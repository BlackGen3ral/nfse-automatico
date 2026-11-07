import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../server/index.js";
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync("server/schema.sql", "utf8").replace(/^\uFEFF/, ""));
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return db.prepare(sql).get(...args) || null;
            },
            async run() {
              return db.prepare(sql).run(...args);
            },
          };
        },
      };
    },
  };
}

const invoice = {
  cnpj: "1".repeat(14),
  description: "Serviço de teste",
  amount: "10,00",
  issqnSuspended: false,
};
test("Pareamento, autenticação, fila exclusiva, entrega única e resultado", async () => {
  const env = { DB: database() };
  async function call(path, token, data) {
    const result = await worker.fetch(
      new Request("https://test.local" + path, {
        method: data ? "POST" : "GET",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      }),
      env,
    );
    return { status: result.status, data: await result.json() };
  }
  const registration = await call("/api/register", null, { name: "PC teste" });
  assert.equal(registration.status, 200);
  const pc = registration.data;
  assert.equal((await call("/api/pc/status", pc.pcToken, {})).data.pairCode, pc.pairCode);
  const mobile = (await call("/api/pair", null, { code: pc.pairCode })).data;
  assert(mobile.mobileToken);
  assert.equal((await call("/api/pc/status", pc.pcToken, {})).data.paired, true);
  const replacement = await call("/api/pc/pair", pc.pcToken, {});
  assert.equal(replacement.status, 200);
  assert.equal((await call("/api/status", mobile.mobileToken)).status, 200);
  assert((await call("/api/pc/status", pc.pcToken, {})).data.pairCode);
  assert.equal(
    (await call("/api/pair", null, { code: pc.pairCode })).status,
    400,
  );
  assert.equal((await call("/api/status", "a".repeat(64))).status, 401);
  await call("/api/pc/poll", pc.pcToken, {});
  const id = crypto.randomUUID();
  assert.equal(
    (await call("/api/jobs", mobile.mobileToken, { requestId: id, invoice }))
      .status,
    201,
  );
  assert.equal(
    (await call("/api/jobs", mobile.mobileToken, { requestId: id, invoice }))
      .status,
    200,
  );
  assert.equal(
    (
      await call("/api/jobs", mobile.mobileToken, {
        requestId: crypto.randomUUID(),
        invoice,
      })
    ).status,
    409,
  );
  const claim = await call("/api/pc/poll", pc.pcToken, {});
  assert.equal((await call("/api/pair", null, {code:replacement.data.pairCode})).status, 409);
  assert.equal((await call("/api/status", mobile.mobileToken)).status, 200);
  assert.equal((await call("/api/pc/pair", pc.pcToken, {})).status, 409);
  assert.equal(claim.data.job.id, id);
  assert.equal(claim.data.job.invoice.description, invoice.description);
  assert.equal((await call("/api/pc/poll", pc.pcToken, {})).data.job, null);
  await call("/api/pc/progress", pc.pcToken, {
    id,
    state: "review",
    message: "Pronto para revisão",
  });
  const status = (await call("/api/status", mobile.mobileToken)).data;
  assert.equal(status.job.state, "review");
  assert(status.online);
  assert.equal(
    (
      await env.DB.prepare("SELECT payload FROM jobs WHERE id=?")
        .bind(id)
        .first()
    ).payload,
    null,
  );
  assert.equal(
    (
      await call("/api/jobs", mobile.mobileToken, {
        requestId: crypto.randomUUID(),
        invoice: { ...invoice, amount: "0,00" },
      })
    ).status,
    400,
  );
  await call("/api/unpair", mobile.mobileToken, {});
  assert.equal((await call("/api/status", mobile.mobileToken)).status, 401);
});
test("Cancelamento mantém a fila bloqueada até confirmar a parada e rejeita progresso tardio",async()=>{
  const env={DB:database()};
  async function call(path,credential,data) {
    const result=await worker.fetch(new Request("https://test.local"+path,{
      method:data?"POST":"GET",
      headers:{"content-type":"application/json",...(credential?{authorization:"Bearer "+credential}:{})},
      ...(data?{body:JSON.stringify(data)}:{}),
    }),env);
    return {status:result.status,data:await result.json()};
  }
  const pc=(await call("/api/register",null,{name:"Teste de parada"})).data;
  const mobile=(await call("/api/pair",null,{code:pc.pairCode})).data;
  await call("/api/pc/poll",pc.pcToken,{});
  const queued=crypto.randomUUID();
  await call("/api/jobs",mobile.mobileToken,{requestId:queued,invoice});
  assert.equal((await call("/api/jobs/cancel",mobile.mobileToken,{id:queued})).data.state,"cancelled");
  assert.equal((await call("/api/pc/poll",pc.pcToken,{})).data.job,null);
  assert.equal((await call("/api/jobs/cancel",mobile.mobileToken,{id:queued})).data.state,"cancelled");
  const id=crypto.randomUUID();
  await call("/api/jobs",mobile.mobileToken,{requestId:id,invoice});
  await call("/api/pc/poll",pc.pcToken,{});
  assert.equal((await call("/api/jobs/cancel","0".repeat(64),{id})).status,401);
  assert.equal((await call("/api/jobs/cancel",mobile.mobileToken,{id})).data.state,"claimed");
  assert.equal((await call("/api/pc/poll",pc.pcToken,{})).data.cancelJobId,id);
  assert.equal((await call("/api/jobs",mobile.mobileToken,{requestId:crypto.randomUUID(),invoice})).status,409);
  const late=await call("/api/pc/progress",pc.pcToken,{id,state:"review",message:"Resposta tardia"});
  assert.equal(late.data.cancelRequested,true);
  assert.equal((await call("/api/status",mobile.mobileToken)).data.job.state,"claimed");
  await call("/api/pc/progress",pc.pcToken,{id,state:"cancelled",message:"Interrompido"});
  assert.equal((await call("/api/status",mobile.mobileToken)).data.job.state,"cancelled");
  await call("/api/pc/progress",pc.pcToken,{id,state:"running",message:"Progresso tardio"});
  assert.equal((await call("/api/status",mobile.mobileToken)).data.job.state,"cancelled");
  assert.equal((await call("/api/jobs",mobile.mobileToken,{requestId:crypto.randomUUID(),invoice})).status,201);
});
