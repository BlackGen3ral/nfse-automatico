import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";

const content = fs.readFileSync(
  fs.existsSync("../content.js") ? "../content.js" : "../nfse-git/content.js",
  "utf8",
);
const source = content.slice(content.indexOf("// Portal certificate entry"));
async function portal(path, active, hash = "", delayed = false, command = "open-invoice") {
  const actions = [];
  const events = {};
  const timers = [];
  let linkReady = !delayed;
  const certificate = {
    dataset: {},
    click() { actions.push("certificate"); },
  };
  const people = {
    href: "https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas",
    dataset: {},
    click() { actions.push("people"); },
  };
  vm.runInNewContext(source, {
    URL,
    setInterval(fn) { timers.push(fn); return timers.length; },
    clearInterval() {},
    location: {
      origin: "https://www.nfse.gov.br",
      pathname: path, search: "", hash,
      href: "https://www.nfse.gov.br" + path + hash,
    },
    history: { replaceState() { actions.push("clear-hash"); } },
    document: {
      querySelector() { return linkReady ? certificate : null; },
      querySelectorAll() { return [people]; },
    },
    window: { addEventListener(name, fn) { events[name] = fn; } },
    chrome: { runtime: {
      async sendMessage(message) {
        if (message.type === "nfse:portal-entry") return { active, command:active ? command : null };
        actions.push(message.type);
        return { ok: true };
      },
    } },
  });
  await new Promise(setImmediate);
  if (delayed) {
    linkReady = true;
    timers[0]();
    await new Promise(setImmediate);
  }
  await events.pageshow();
  return actions;
}
test("Entrada autorizada segue certificado, Pessoas e conexão sem repetir cliques", async () => {
  assert.deepEqual(await portal("/EmissorNacional/Login", true, "#nfse-connect=" + "a".repeat(64)), ["clear-hash", "certificate"]);
  assert.deepEqual(await portal("/EmissorNacional/", true), ["people"]);
  assert.deepEqual(await portal("/EmissorNacional/Dashboard", true), ["people"]);
  assert((await portal("/EmissorNacional/DPS/Pessoas", true)).includes("nfse:connect-pc"));
});
test("Navegação exige solicitação ativa e preserva as etapas em andamento", async () => {
  assert.deepEqual(await portal("/EmissorNacional/Login", false), []);
  assert.deepEqual(await portal("/EmissorNacional/", false), []);
  for (const step of ["Servico", "Tributacao", "Revisao"])
    assert.deepEqual(await portal("/EmissorNacional/DPS/" + step, true), []);
});
test("Acesso por certificado aguarda o botão aparecer", async () => {
  assert.deepEqual(await portal("/EmissorNacional/Login", true, "", true), ["certificate"]);
});
test("Dashboard só abre uma nota com comando do PC",async()=>{
  assert.deepEqual(await portal("/EmissorNacional/Dashboard",true,"",false,null),[]);
  assert.deepEqual(await portal("/EmissorNacional/Dashboard",true),["people"]);
});
