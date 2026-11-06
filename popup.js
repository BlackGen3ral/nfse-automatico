const input = document.querySelector("#cnpj");
const button = document.querySelector("#fill");
const status = document.querySelector("#status");
const peopleUrl = /^https:\/\/www\.nfse\.gov\.br\/EmissorNacional\/DPS\/Pessoas(?:[/?#]|$)/i;
const serviceUrl = /^https:\/\/www\.nfse\.gov\.br\/EmissorNacional\/DPS\/Servi(?:c|ç|%c3%a7)o(?:[/?#]|$)/i;
const digits = (value) => value.replace(/\D/g, "").slice(0, 14);
let tab;
let busy = false;
let starting = false;

document.querySelector("#version").textContent = "v" + chrome.runtime.getManifest().version;
function renderButton() {
  const inService = serviceUrl.test(tab?.url || "");
  document.querySelector("#people-fields").hidden = inService;
  document.querySelector("#fill-label").textContent = inService ? "Preencher Serviço" : "Preencher";
  input.disabled = inService;
  button.disabled = busy || starting ||
    (!inService && (!peopleUrl.test(tab?.url || "") || digits(input.value).length !== 14));
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
input.addEventListener("input", () => {
  input.value = mask(digits(input.value));
  renderButton();
});
async function refresh() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = "nfseFlow:" + tab?.id;
  const flow = (await chrome.storage.session.get(key))[key];
  const current = flow?.until > Date.now() ? flow : null;
  busy = !!current && ["people", "waiting", "service"].includes(current.phase);
  const inService = serviceUrl.test(tab?.url || "");
  document.querySelector("#people").classList.toggle("active", peopleUrl.test(tab?.url || ""));
  document.querySelector("#service").classList.toggle("active", inService);
  if (!starting) {
    if (current && (busy || inService || peopleUrl.test(tab?.url || ""))) show(current.text, current.phase === "error");
    else if (inService) show("A descrição e o avanço ficam com você.");
    else show(peopleUrl.test(tab?.url || "") ? "Digite o CNPJ para começar." : "Abra Pessoas ou Serviço no Emissor Nacional.");
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
    const message = serviceUrl.test(tab.url) ? { type: "nfse:start-service" } : { type: "nfse:start", cnpj: digits(input.value) };
    const reply = await chrome.tabs.sendMessage(tab.id, message);
    if (!reply?.ok) throw new Error();
    input.value = "";
    starting = false;
    await refresh();
  } catch {
    starting = false;
    renderButton();
    show("Não foi possível iniciar. Atualize a página do portal e tente novamente.", true);
  }
});
chrome.storage.onChanged.addListener((_, area) => {
  if (area === "session") refresh().catch(() => {});
});
chrome.tabs.onUpdated.addListener((id) => { if (id === tab?.id) refresh().catch(() => {}); });
refresh().catch(() => show("Não foi possível localizar o portal.", true));
