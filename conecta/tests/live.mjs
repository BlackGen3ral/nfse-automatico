import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const origin = "https://nfse-conecta.pages.dev";
async function call(path, token, data) {
  const r = await fetch(origin + path, {
    method: data ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = await r.json();
  assert(r.ok, body.error);
  return body;
}
const pc = await call("/api/register", null, { name: "Validação integrada" });
try {
  const mobile = await call("/api/pair", null, { code: pc.pairCode });
  await call("/api/pc/poll", pc.pcToken, {});
  const id = crypto.randomUUID();
  await call("/api/jobs", mobile.mobileToken, {
    requestId: id,
    invoice: {
      cnpj: "1".repeat(14),
      description: "Validação técnica sem acesso ao portal",
      amount: "1,00",
      issqnSuspended: false,
    },
  });
  assert.equal((await call("/api/pc/poll", pc.pcToken, {})).job.id, id);
  assert.equal((await call("/api/pc/poll", pc.pcToken, {})).job, null);
  await call("/api/pc/progress", pc.pcToken, {
    id,
    state: "review",
    message: "Validação técnica concluída",
  });
  assert.equal(
    (await call("/api/status", mobile.mobileToken)).job.state,
    "review",
  );
  const updates = await (await fetch(origin + "/updates.json")).json();
  if (updates.pc.available === false) {
    const response = await fetch(origin + "/downloads/NFSe-Conecta-PC.exe", { method: "HEAD" });
    assert.equal(response.status, 404);
  }
  for (const item of [updates.pc, updates.android, updates.extension].filter(item => item.available !== false)) {
    const response = await fetch(item.url);
    assert(response.ok);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      item.sha256,
    );
  }
  console.log(
    "Conexão real validada: pareamento, fila única, confirmação de resultado e integridade dos downloads disponíveis.",
  );
} finally {
  const batch = [
    { sql: "DELETE FROM jobs WHERE device_id=?", params: [pc.deviceId] },
    { sql: "DELETE FROM devices WHERE id=?", params: [pc.deviceId] },
  ];
  fs.writeFileSync(".cloudflare/cleanup-test.json", JSON.stringify(batch));
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/cf/bin/cf",
      "d1",
      "query",
      "5a2dbd83-1bc4-44cb-9f96-6067ccda97ee",
      "--batch",
      "@.cloudflare/cleanup-test.json",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error("Não foi possível remover o dispositivo de teste.");
}
