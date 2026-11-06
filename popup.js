const input = document.querySelector("#cnpj");
const description = document.querySelector("#description");
const amount = document.querySelector("#amount");
const suspensionChoices = Array.from(document.querySelectorAll("[name=issqn-suspended]"));
const button = document.querySelector("#fill");
const status = document.querySelector("#status");
const peopleUrl = /^https:\/\/www\.nfse\.gov\.br\/EmissorNacional\/DPS\/Pessoas(?:[/?#]|$)/i;
const serviceUrl = /^https:\/\/www\.nfse\.gov\.br\/EmissorNacional\/DPS\/Servi(?:c|ç|%c3%a7)o(?:[/?#]|$)/i;
const valuesUrl = /^https:\/\/www\.nfse\.gov\.br\/EmissorNacional\/DPS\/Tributacao(?:[/?#]|$)/i;
const digits = (value) => value.replace(/\D/g, "").slice(0, 14);
let tab;
let busy = false;
let starting = false;
let initializing = true;
let draftKey;
document.querySelector("#version").textContent = "v" + chrome.runtime.getManifest().version;
async function refreshUpdater() {
  const indicator = document.querySelector("#update-dot");
  const message = document.querySelector("#update-status");
  try {
    const response = await fetch(chrome.runtime.getURL("atualizador/status.json"), { cache: "no-store" });
    if (!response.ok) throw new Error();
    const update = await response.json();
    const lastRun = Date.parse(update.updatedAt);
    const stale = !Number.isFinite(lastRun) || Date.now() - lastRun > 2 * 60 * 60 * 1000;
    const waiting = update.state === "waiting-close" && /^\d+\.\d+\.\d+$/.test(update.version);
    const failed = update.state === "error";
    indicator.dataset.state = waiting || failed || stale ? "attention" : "on";
    if (failed) message.textContent = "Falha ao verificar atualizações";
    else if (waiting) message.textContent = "v" + update.version + " pronta · feche o navegador";
    else if (stale) message.textContent = "Atualizador sem verificação recente";
    else message.textContent = "Atualização automática ativa";
  } catch {
    message.textContent = "Atualização automática sem status";
  }
}
refreshUpdater();
function serviceAmount() {
  const value = amount.value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return null;
  const [whole, decimals = ""] = value.replace(/\./g, "").split(",");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const cents = decimals.padEnd(2, "0");
  if (!/[1-9]/.test(integer + cents)) return null;
  return integer + "," + cents;
}
function invoiceData() {
  const text = description.value.trim();
  const value = serviceAmount();
  const issqnSuspended = suspensionChoices.some((choice) => choice.checked && choice.value === "yes");
  return text && value ? { description: text, amount: value, issqnSuspended } : null;
}

function renderButton() {
  document.querySelector("#count").textContent = description.value.length + "/2000";
  const inService = serviceUrl.test(tab?.url || "");
  const inValues = valuesUrl.test(tab?.url || "");
  const withoutCnpj = inService || inValues;
  document.querySelector("#people-fields").hidden = withoutCnpj;
  document.querySelector("#fill-label").textContent = inValues ? "Preencher Valores" : inService ? "Preencher Serviço" : "Preencher até a revisão";
  if (busy || starting) document.querySelector("#fill-label").textContent = "Preenchendo nota…";
  for (const field of [input, description, amount, ...suspensionChoices]) {
    field.disabled = withoutCnpj || initializing || busy || starting;
  }
  button.disabled = initializing || busy || starting ||
    (!withoutCnpj && (!peopleUrl.test(tab?.url || "") || digits(input.value).length !== 14 || !invoiceData()));
}
function show(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}
function mask(value) {
  return value.slice(0, 2) + (value.length > 2 ? "." + value.slice(2, 5) : "") +
    (value.length > 5 ? "." + value.slice(5, 8) : "") +
    (value.length > 8 ? "/" + value.slice(8, 12) : "") + (value.length > 12 ? "-" + value.slice(12) : "");
}
function showAmountHint() {
  const invalid = !!amount.value.trim() && !serviceAmount();
  amount.setAttribute("aria-invalid", String(invalid));
  document.querySelector("#amount-hint").textContent = invalid
    ? "Digite um valor maior que zero no formato 1.234,56."
    : "Use o formato 1.234,56.";
}
function setSuspension(value) {
  for (const choice of suspensionChoices) choice.checked = choice.value === value;
}
function saveDraft() {
  if (!draftKey || initializing) return;
  const draft = {
    cnpj: digits(input.value),
    description: description.value,
    amount: amount.value,
    suspension: suspensionChoices.find((choice) => choice.checked)?.value || "no"
  };
  chrome.storage.session.set({ [draftKey]: draft }).catch(() => {
    if (!busy && !starting) show("Não foi possível guardar o rascunho nesta guia.", true);
  });
}
function onDraftEdit() {
  renderButton();
  saveDraft();
}
input.addEventListener("input", () => {
  input.value = mask(digits(input.value));
  onDraftEdit();
});
description.addEventListener("input", onDraftEdit);
amount.addEventListener("input", () => {
  showAmountHint();
  onDraftEdit();
});
for (const choice of suspensionChoices) choice.addEventListener("change", onDraftEdit);

async function initialize() {
  renderButton();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    draftKey = "nfsePopupDraft:" + tab.id;
    const saved = (await chrome.storage.session.get(draftKey))[draftKey];
    if (saved) {
      input.value = mask(digits(saved.cnpj || ""));
      description.value = saved.description || "";
      amount.value = saved.amount || "";
      setSuspension(saved.suspension === "yes" ? "yes" : "no");
      showAmountHint();
    }
  }
  initializing = false;
  await refresh();
}
async function refresh() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = "nfseFlow:" + tab?.id;
  const flow = (await chrome.storage.session.get(key))[key];
  const current = flow?.until > Date.now() ? flow : null;
  const inService = serviceUrl.test(tab?.url || "");
  const inValues = valuesUrl.test(tab?.url || "");
  busy = !!current && (["people", "waiting", "service", "values"].includes(current.phase) ||
    (inService && current.phase === "done" && !!current.invoice) || (inValues && current.phase === "review"));
  const inPeople = peopleUrl.test(tab?.url || "");
  const inReview = !inPeople && !inService && !inValues && current?.phase === "review" &&
    /^https:\/\/www\.nfse\.gov\.br\/EmissorNacional\/DPS\//i.test(tab?.url || "");
  const step = inPeople ? 0 : inService ? 1 : inValues ? 2 : inReview ? 3 : -1;
  ["people", "service", "values", "review"].forEach((id, index) => {
    const item = document.getElementById(id);
    item.classList.toggle("active", index === step);
    item.classList.toggle("complete", index < step);
    if (index === step) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  if (!starting) {
    if (current && (busy || inService || (inValues && !current.valuesDraft) || peopleUrl.test(tab?.url || ""))) show(current.text, current.phase === "error");
    else if (inService) show("A descrição e o avanço ficam com você.");
    else if (inValues) show("Confira os valores antes de avançar.");
    else if (current?.phase === "review") show(current.text);
    else show(peopleUrl.test(tab?.url || "") ? "Informe o CNPJ, a descrição e o valor para começar." : "Abra Pessoas, Serviço ou Valores no Emissor Nacional.");
  }
  renderButton();
}
document.querySelector("#fill-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  starting = true;
  renderButton();
  show("Iniciando preenchimento…");
  try {
    let message = { type: "nfse:start", cnpj: digits(input.value), invoice: invoiceData() };
    if (serviceUrl.test(tab.url)) message = { type: "nfse:start-service" };
    if (valuesUrl.test(tab.url)) message = { type: "nfse:start-values" };
    const reply = await chrome.tabs.sendMessage(tab.id, message);
    if (!reply?.ok) throw new Error();
    starting = false;
    await refresh();
  } catch {
    starting = false;
    renderButton();
    show("Não foi possível iniciar. Atualize a página do portal e tente novamente.", true);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || initializing) return;
  if (draftKey && changes[draftKey] && !changes[draftKey].newValue) {
    for (const field of [input, description, amount]) field.value = "";
    setSuspension("no");
    showAmountHint();
    renderButton();
  }
  if (changes["nfseFlow:" + tab?.id]) refresh().catch(() => {});
});
chrome.tabs.onUpdated.addListener((id) => { if (id === tab?.id) refresh().catch(() => {}); });
initialize().catch(() => show("Não foi possível localizar o portal.", true));
