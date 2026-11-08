import { assets } from "./assets.js";
import {diagnostics} from './diagnostics.js';
import {validateWakeConfig,canWaitForPc} from './wake.js';
import {power} from './power.js';
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function body(request, maximum=16384) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Envie os dados em JSON.");
  const reader = request.body?.getReader();
  let size = 0,
    chunks = [];
  if (!reader) throw new ApiError(400, "Dados ausentes.");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) {
      await reader.cancel();
      throw new ApiError(413, "Dados muito grandes.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "Dados inválidos.");
  }
}
async function limited(request, db) {
  const now = Date.now();
  const key = await hash(
    (request.headers.get("cf-connecting-ip") || "local") +
      ":" +
      Math.floor(now / 60000),
  );
  const row = await db
    .prepare(
      "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(key, now + 120000)
    .first();
  if (row.count > 15)
    throw new ApiError(429, "Aguarde um minuto e tente novamente.");
  await db.prepare("DELETE FROM limits WHERE expires < ?").bind(now).run();
}
async function authenticate(request, db, role) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer [a-f0-9]{64}$/.test(authorization))
    throw new ApiError(401, "Pareie este aparelho novamente.");
  const field = role === "pc" ? "pc_hash" : "mobile_hash";
  const device = await db
    .prepare(`SELECT * FROM devices WHERE ${field}=?`)
    .bind(await hash(authorization.slice(7)))
    .first();
  if (!device) throw new ApiError(401, "Pareamento inválido ou revogado.");
  return device;
}
async function cleanup(db) {
  await db
    .prepare(
      "UPDATE jobs SET state='error',message='O prazo desta solicitação terminou. Confira o PC antes de enviar novamente.',payload=NULL WHERE expires < ? AND state IN ('queued','claimed','running')",
    )
    .bind(Date.now())
    .run();
  await db
    .prepare("DELETE FROM jobs WHERE expires < ?")
    .bind(Date.now() - 86400000)
    .run();
}
export function validateInvoice(data) {
  if (
    !data ||
    !/^\d{14}$/.test(data.cnpj || "") ||
    typeof data.description !== "string" ||
    !data.description.trim() ||
    data.description.length > 2000 ||
    !/^\d{1,12},\d{2}$/.test(data.amount || "") ||
    !/[1-9]/.test(data.amount) ||
    typeof data.issqnSuspended !== "boolean"
  )
    throw new ApiError(400, "Confira CNPJ, descrição e valor do serviço.");
  return {
    cnpj: data.cnpj,
    description: data.description.trim(),
    amount: data.amount,
    issqnSuspended: data.issqnSuspended,
  };
}
async function api(request, env) {
  const path = new URL(request.url).pathname,
    db = env.DB,
    now = Date.now();
  if (!db) throw new ApiError(503, "Serviço indisponível.");
  if (path === "/api/health") return json({ ok: true, version: "1.0.0" });
  if (path === "/api/register" && request.method === "POST") {
    await limited(request, db);
    const input = await body(request);
    const id = crypto.randomUUID(),
      secret = token(),
      code = token().slice(0, 12).toUpperCase();
    await db
      .prepare(
        "INSERT INTO devices(id,name,pc_hash,pair_code,pair_expires) VALUES(?,?,?,?,?)",
      )
      .bind(
        id,
        String(input.name || "Meu computador").slice(0, 60),
        await hash(secret),
        code,
        now + 300000,
      )
      .run();
    return json({
      deviceId: id,
      pcToken: secret,
      pairCode: code,
      expires: now + 300000,
    });
  }
  if (path === "/api/pair" && request.method === "POST") {
    await limited(request, db);
    const input = await body(request);
    if (!/^[A-F0-9]{12}$/.test(input.code || ""))
      throw new ApiError(400, "Confira o código de 12 caracteres.");
    const secret = token();
    const device = await db
      .prepare(
        "UPDATE devices SET mobile_hash=?,pair_code=NULL,pair_expires=NULL WHERE pair_code=? AND pair_expires>? AND NOT EXISTS(SELECT 1 FROM jobs WHERE device_id=devices.id AND state IN('queued','claimed','running') AND expires>?) RETURNING id,name",
      )
      .bind(await hash(secret), input.code, now, now)
      .first();
    if (!device) {
      const busy = await db.prepare("SELECT id FROM devices WHERE pair_code=? AND pair_expires>? AND EXISTS(SELECT 1 FROM jobs WHERE device_id=devices.id AND state IN('queued','claimed','running') AND expires>?)")
        .bind(input.code, now, now).first();
      if (busy) throw new ApiError(409, "Conclua a solicitação atual no PC antes de trocar de celular.");
      throw new ApiError(
        400,
        "Código vencido ou já utilizado. Gere outro no PC.",
      );
    }
    return json({
      deviceId: device.id,
      name: device.name,
      mobileToken: secret,
    });
  }
  const pc = path.startsWith("/api/pc/"),
    device = await authenticate(request, db, pc ? "pc" : "mobile");
  await cleanup(db);
  const powerResult=await power(request,db,device,pc,{body,json,ApiError});if(powerResult)return powerResult;
  if (pc && path === "/api/pc/status" && request.method === "POST") {
    const active = await db.prepare("SELECT id FROM jobs WHERE device_id=? AND state IN('queued','claimed','running')")
      .bind(device.id).first();
    return json({
      paired: !!device.mobile_hash,
      pairCode: device.pair_expires > now ? device.pair_code : null,
      expires: device.pair_expires,
      activeJob: !!active,
    });
  }
  if (pc && path === "/api/pc/pair" && request.method === "POST") {
    const active = await db
      .prepare(
        "SELECT id FROM jobs WHERE device_id=? AND state IN('queued','claimed','running')",
      )
      .bind(device.id)
      .first();
    if (active)
      throw new ApiError(
        409,
        "Conclua a solicitação atual antes de parear outro celular.",
      );
    const code = token().slice(0, 12).toUpperCase();
    await db
      .prepare(
        "UPDATE devices SET pair_code=?,pair_expires=? WHERE id=?",
      )
      .bind(code, now + 300000, device.id)
      .run();
    return json({ pairCode: code, expires: now + 300000 });
  }
  if (pc && path === "/api/pc/poll" && request.method === "POST") {
    const pollInput=await body(request);
    const stopping = await db.prepare("SELECT id FROM jobs WHERE device_id=? AND cancel_requested=1 AND state IN('claimed','running') AND (? IS NULL OR id=?)")
      .bind(device.id,pollInput.jobId||null,pollInput.jobId||null).first();
    await db
      .prepare("UPDATE devices SET last_seen=? WHERE id=?")
      .bind(now, device.id)
      .run();
    const job = pollInput.ready===false ? null : await db
      .prepare(
        "UPDATE jobs SET state='claimed',message='Abrindo o portal no PC…' WHERE id=(SELECT id FROM jobs WHERE device_id=? AND state='queued' AND expires>? AND (batch_id IS NULL OR ?=1) ORDER BY created LIMIT 1) AND state='queued' RETURNING *",
      )
      .bind(device.id, now,pollInput.parallel===true?1:0)
      .first();
    if(pollInput.parallel===true)await db.prepare("UPDATE devices SET parallel_ready=1 WHERE id=?").bind(device.id).run();
    return json({
      paired: !!device.mobile_hash,
      cancelJobId: stopping?.id || null,
      pairCode: device.pair_expires > now ? device.pair_code : null,
      job: job
        ? { id: job.id, invoice: JSON.parse(job.payload), expires: job.expires, batchId:job.batch_id || null }
        : null,
    });
  }
  if (pc && path === '/api/pc/wake-config' && request.method === 'POST') {
    let config;
    try {config=validateWakeConfig(await body(request));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,error.message);}
    await db.prepare('UPDATE devices SET wake_config=? WHERE id=?').bind(JSON.stringify(config),device.id).run();
    return json({ok:true});
  }
  if (!pc && path === '/api/wake' && request.method === 'GET') {
    let config;try{config=JSON.parse(device.wake_config||'null');}catch{config=null;}
    return json({config,online:now-device.last_seen<20000,remoteReady:false});
  }
  if (pc && path === "/api/pc/progress" && request.method === "POST") {
    const input = await body(request);
    if (
      !["running", "review", "error", "cancelled"].includes(input.state) ||
      typeof input.id !== "string"
    )
      throw new ApiError(400, "Progresso inválido.");
    await db
      .prepare(
        "UPDATE jobs SET state=?,message=?,payload=CASE WHEN ? IN ('review','error','cancelled') THEN NULL ELSE payload END WHERE id=? AND device_id=? AND state IN ('claimed','running') AND (cancel_requested=0 OR ?='cancelled')",
      )
      .bind(
        input.state,
        String(input.message || "").slice(0, 240),
        input.state,
        input.id,
        device.id,
        input.state,
      )
      .run();
    const progress = await db.prepare("SELECT cancel_requested,state FROM jobs WHERE id=? AND device_id=?").bind(input.id,device.id).first();
    return json({ ok: true, cancelRequested: !!progress?.cancel_requested && progress.state !== "cancelled" });
  }
  if (!pc && path === "/api/status" && request.method === "GET") {
    const job = await db
      .prepare(
        "SELECT id,state,message,created,cancel_requested AS cancelRequested FROM jobs WHERE device_id=? ORDER BY created DESC LIMIT 1",
      )
      .bind(device.id)
      .first();
    return json({
      name: device.name,
      online: now - device.last_seen < 20000,
      job,
    });
  }
  if (!pc && path==='/api/batches/status' && request.method==='GET') {
    const id=new URL(request.url).searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))throw new ApiError(400,'Lote inválido.');
    const result=await db.prepare('SELECT id,state,message,created,cancel_requested AS cancelRequested FROM jobs WHERE device_id=? AND batch_id=? ORDER BY created,id').bind(device.id,id).all();
    return json({online:now-device.last_seen<20000,jobs:result.results});
  }
  if (!pc && path==='/api/batches' && request.method==='POST') {
    const data=await body(request,65536);
    if(!/^[a-f0-9-]{36}$/.test(data.id||'')||!Array.isArray(data.notes)||data.notes.length<2||data.notes.length>5)throw new ApiError(400,'Monte um lote de 2 a 5 notas.');
    const notes=data.notes.map(note=>{if(!/^[a-f0-9-]{36}$/.test(note.id||''))throw new ApiError(400,'Identificador inválido.');return{id:note.id,invoice:validateInvoice(note.invoice)};});
    if(new Set(notes.map(note=>note.id)).size!==notes.length)throw new ApiError(400,'Notas duplicadas no lote.');
    const old=await db.prepare('SELECT id FROM jobs WHERE device_id=? AND batch_id=?').bind(device.id,data.id).first();if(old)return json({id:data.id});
    const waiting=data.waitForPc===true;
    if(waiting&&!canWaitForPc(device))throw new ApiError(409,'Configure Ligar pela rede no PC e ative o início automático.');
    if(now-device.last_seen>=20000&&!waiting)throw new ApiError(409,'Conecte o PC antes de enviar o lote.');
    if(!device.parallel_ready)throw new ApiError(409,'Atualize o app do PC para a versão 1.5.0 e abra-o antes de enviar lotes.');
    const active=await db.prepare("SELECT id FROM jobs WHERE device_id=? AND state IN('queued','claimed','running')").bind(device.id).first();if(active)throw new ApiError(409,'Conclua ou pare o lote anterior.');
    try{await db.batch(notes.map((note,index)=>db.prepare("INSERT INTO jobs(id,device_id,payload,state,message,created,expires,batch_id) VALUES(?,?,?,'queued',?,?,?,?)").bind(note.id,device.id,JSON.stringify(note.invoice),waiting?'Aguardando o PC conectar (até 30 minutos). A emissão será manual.':'Lote enviado ao PC',now+index,now+(waiting?1800000:600000),data.id)));}catch{throw new ApiError(409,'Não foi possível criar o lote. Confira se há notas em andamento.');}
    return json({id:data.id},201);
  }
  if (!pc && path === "/api/jobs/cancel" && request.method === "POST") {
    const input = await body(request);
    if (!/^[a-f0-9-]{36}$/.test(input.id || "")) throw new ApiError(400, "Solicitação inválida.");
    const job = await db.prepare("UPDATE jobs SET cancel_requested=1,payload=NULL,message=CASE WHEN state='queued' THEN 'Preenchimento interrompido antes de iniciar.' ELSE 'Parada solicitada. Aguardando confirmação do PC e da extensão…' END,state=CASE WHEN state='queued' THEN 'cancelled' ELSE state END WHERE id=? AND device_id=? AND state IN('queued','claimed','running') RETURNING state")
      .bind(input.id, device.id).first();
    if (job) return json({state:job.state});
    const existing = await db.prepare("SELECT state FROM jobs WHERE id=? AND device_id=?").bind(input.id,device.id).first();
    if (existing?.state === "cancelled") return json({state:"cancelled"});
    throw new ApiError(409, "Esta solicitação já terminou. Confira o resultado no PC.");
  }
  if (!pc && path === "/api/jobs" && request.method === "POST") {
    const input = await body(request),
      invoice = validateInvoice(input.invoice);
    if (!/^[a-f0-9-]{36}$/.test(input.requestId || ""))
      throw new ApiError(400, "Identificador inválido.");
    const old = await db
      .prepare("SELECT id,device_id FROM jobs WHERE id=?")
      .bind(input.requestId)
      .first();
    if (old) {
      if (old.device_id !== device.id)
        throw new ApiError(409, "Solicitação inválida.");
      return json({ id: old.id });
    }
    const waiting=input.waitForPc===true;
    if(waiting&&!canWaitForPc(device))throw new ApiError(409,'Configure Ligar pela rede no PC e ative o início automático.');
    if (now - device.last_seen >= 20000 && !waiting)
      throw new ApiError(
        409,
        "Abra o NFS-e Conecta no computador e aguarde conectar.",
      );
    if(await db.prepare("SELECT id FROM jobs WHERE device_id=? AND state IN('queued','claimed','running')").bind(device.id).first())throw new ApiError(409,'Já existe uma solicitação em andamento.');
    try {
      await db
        .prepare(
          "INSERT INTO jobs(id,device_id,payload,state,message,created,expires) VALUES(?,?,?,'queued',?,?,?)",
        )
        .bind(
          input.requestId,
          device.id,
          JSON.stringify(invoice),
          waiting?'Aguardando o PC conectar (até 30 minutos). A emissão será manual.':'Solicitação enviada ao PC',
          now,
          now + (waiting?1800000:600000),
        )
        .run();
    } catch (error) {
      if (String(error).includes("PC shutting down"))throw new ApiError(409,"O PC está desligando. Cancele o desligamento ou aguarde antes de enviar notas.");
      if (String(error).includes("UNIQUE"))
        throw new ApiError(409, "Já existe uma solicitação em andamento.");
      throw error;
    }
    return json({ id: input.requestId }, 201);
  }
  if (!pc && path === "/api/unpair" && request.method === "POST") {
    await db
      .prepare("UPDATE devices SET mobile_hash=NULL WHERE id=?")
      .bind(device.id)
      .run();
    return json({ ok: true });
  }
  throw new ApiError(404, "Endereço não encontrado.");
}
export default {
  async scheduled(event, env) {
    await cleanup(env.DB);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/diagnostics/')) return await diagnostics(request,env,{body,hash,token,json,limited,ApiError});
      if (url.pathname.startsWith("/api/")) return await api(request, env);
      if (!["GET", "HEAD"].includes(request.method))
        return json({ error: "Método inválido." }, 405);
      const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname === '/diagnosticos' ? '/diagnostics.html' : url.pathname];
      if (!asset)
        return new Response("Página não encontrada.", { status: 404 });
      const data = asset.base64
        ? Uint8Array.from(atob(asset.data), (c) => c.charCodeAt(0))
        : asset.data;
      return new Response(request.method === "HEAD" ? null : data, {
        headers: {
          "content-type": asset.type,
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          "permissions-policy": "camera=(self), microphone=()",
          ...(url.pathname.endsWith(".exe") ||
          url.pathname.endsWith(".apk") ||
          url.pathname.endsWith(".zip")
            ? { "content-disposition": "attachment" }
            : {}),
        },
      });
    } catch (error) {
      if (!(error instanceof ApiError))
        console.error(
          JSON.stringify({ event: "request_failed", path: url.pathname }),
        );
      return json(
        {
          error:
            error instanceof ApiError
              ? error.message
              : "Falha temporária. Tente novamente.",
        },
        error.status || 500,
      );
    }
  },
};
