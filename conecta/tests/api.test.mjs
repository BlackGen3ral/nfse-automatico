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
  const mobile = (await call("/api/pair", null, { code: pc.pairCode })).data;
  assert(mobile.mobileToken);
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
