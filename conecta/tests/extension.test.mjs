import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";
test("Extensão entrega uma vez e só confirma revisão na página correta", async () => {
  const listeners = [],
    local = {},
    session = {},
    calls = [],
    fetches = [];
  const storage = (store) => ({
    get: async (key) => ({ [key]: store[key] }),
    set: async (values) => Object.assign(store, values),
    remove: async (key) => {
      for (const k of Array.isArray(key) ? key : [key]) delete store[k];
    },
  });
  const job = {
    id: crypto.randomUUID(),
    expires: Date.now() + 30000,
    invoice: {
      cnpj: "1".repeat(14),
      description: "Teste",
      amount: "10,00",
      issqnSuspended: false,
    },
  };
  const bridge = "a".repeat(64);
  let pendingJob = null;
  let controlJobId = job.id, cancelledJobId = "";
  let requestedOpenUntil = 0;
  const chrome = {
    runtime: { onMessage: { addListener: (f) => listeners.push(f) } },
    storage: { local: storage(local), session: storage(session) },
    tabs: {
      onRemoved: { addListener() {} },
      sendMessage: async (id, m) => {
        calls.push(m);
        return m.type === "nfse:stop" ? {stopped:true} : { ok: true };
      },
    },
    sidePanel: { setPanelBehavior: async () => {} },
  };
  const fetch = async (url, options) => {
    assert.equal(options.headers.authorization, "Bearer " + bridge);
    fetches.push({ url, data: options.body ? JSON.parse(options.body) : null });
    return {
      ok: true,
      json: async () => (url.endsWith("/job") ? {job:pendingJob,command:pendingJob||requestedOpenUntil>Date.now()?"open-invoice":null,openUntil:requestedOpenUntil} :
        url.endsWith("/control") ? {jobId:controlJobId,cancelledJobId} : {ok:true}),
    };
  };
  vm.runInNewContext(
    fs.readFileSync(
      fs.existsSync("../background.js")
        ? "../background.js"
        : "../nfse-git/background.js",
      "utf8",
    ),
    { chrome, URL, fetch, AbortSignal },
  );
  const sender = {
    tab: { id: 5 },
    url: "https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas?idr=teste",
  };
  const send = (message) =>
    new Promise((resolve, reject) => {
      let handled = false;
      for (const fn of listeners) {
        if (fn(message, sender, resolve)) handled = true;
      }
      if (!handled) reject(Error("Mensagem sem receptor"));
    });
  sender.url = "https://www.nfse.gov.br/EmissorNacional/Login";
  local.nfseBridgeKey = bridge;
  assert.equal((await send({ type: "nfse:portal-entry" })).active, false);
  requestedOpenUntil = Date.now() + 10000;
  assert.equal((await send({type:"nfse:portal-entry"})).command,"open-invoice");
  requestedOpenUntil = 0;
  pendingJob = job;
  assert.equal((await send({ type: "nfse:portal-entry" })).active, true);
  sender.url = "https://www.nfse.gov.br/EmissorNacional/";
  assert.equal((await send({ type: "nfse:portal-entry" })).active, true);
  session["nfsePortal:5"].until = Date.now() - 1;
  assert.equal((await send({ type: "nfse:portal-entry" })).active, false);
  assert.equal((await send({ type: "nfse:portal-entry", bridgeKey: bridge })).active, true);
  sender.tab.id = 6;
  assert.equal((await send({ type: "nfse:portal-entry" })).active, false);
  sender.tab.id = 5;
  sender.url = "https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas?idr=teste";
  assert((await send({ type: "nfse:connect-pc" })).ok);
  assert.equal(session["nfsePortal:5"], undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cnpj, job.invoice.cnpj);
  await send({ type: "nfse:connect-pc" });
  assert.equal(calls.length, 1);
  await send({
    type: "nfse:update",
    state: {
      phase: "review",
      text: "Abrindo revisão",
      visualDraft: "teste",
      until: Date.now() + 30000,
    },
  });
  assert.equal((await send({ type: "nfse:remote-result" })).ok, false);
  sender.url = "https://www.nfse.gov.br/EmissorNacional/DPS/Revisao?idr=outro";
  assert.equal((await send({ type: "nfse:remote-result" })).ok, false);
  sender.url = "https://www.nfse.gov.br/EmissorNacional/DPS/Revisao?idr=teste";
  assert((await send({ type: "nfse:remote-result" })).ok);
  assert(fetches.some((f) => f.data?.phase === "review-ready"));
  controlJobId = "";
  await send({type:"nfse:remote-control"});
  assert.equal(session["nfseRemote:5"], undefined);
  const second = {...job,id:crypto.randomUUID()};
  pendingJob = second;
  sender.url = "https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas?idr=teste";
  assert((await send({type:"nfse:connect-pc"})).ok);
  controlJobId = second.id;
  cancelledJobId = second.id;
  assert.equal((await send({type:"nfse:remote-control"})).stopped,true);
  assert.equal(session["nfseFlow:5"].phase,"cancelled");
  const beforePortChange=fetches.length;
  assert.equal((await send({type:"nfse:portal-entry",bridgeKey:bridge,bridgePort:443})).active,false);
  assert.equal(fetches.length,beforePortChange);
  await send({type:"nfse:portal-entry",bridgeKey:bridge,bridgePort:17847});
  assert(fetches.at(-1).url.startsWith("http://127.0.0.1:17847/"));
  assert(fetches.some(f=>f.url.endsWith("/cancel-ack") && f.data.id===second.id));
  await send({type:"nfse:update",state:{phase:"service",until:Date.now()+10000}});
  assert.equal(session["nfseFlow:5"].phase,"cancelled");
});
