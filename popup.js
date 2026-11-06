const DEFAULTS = {
  municipality: "Pimenta Bueno/RO",
  taxCode: "140201",
  issqnImune: false,
  nbs: "120012000",
  operation: "050101",
  governmentPurchase: false,
  recipientIsAcquirer: false,
  recipientCountry: "Brasil",
  intermediary: "Intermediário não informado",
  regime: "first-valid"
};

const $ = (id) => document.getElementById(id);
const digits = (value) => (value || "").replace(/\D/g, "").slice(0, 14);
let config = { defaults: { ...DEFAULTS }, companies: [] };

function formatCnpj(value) {
  const d = digits(value);
  return d.slice(0, 2) + (d.length > 2 ? `.${d.slice(2, 5)}` : "") + (d.length > 5 ? `.${d.slice(5, 8)}` : "") + (d.length > 8 ? `/${d.slice(8, 12)}` : "") + (d.length > 12 ? `-${d.slice(12, 14)}` : "");
}

async function load() {
  const result = await chrome.storage.local.get("nfseConfig");
  const saved = result.nfseConfig || {};
  config = {
    defaults: { ...DEFAULTS, ...(saved.defaults || {}) },
    companies: Array.isArray(saved.companies) ? saved.companies : []
  };
  renderCompanies();
}

function renderCompanies() {
  const list = $("companies");
  list.replaceChildren();
  if (!config.companies.length) {
    const empty = document.createElement("li");
    empty.className = "hint";
    empty.textContent = "Nenhuma empresa cadastrada. Os valores comuns já podem ser aplicados.";
    list.append(empty);
    return;
  }
  config.companies.forEach((company) => {
    const item = document.createElement("li");
    item.className = "company";
    const details = document.createElement("div");
    const name = document.createElement("span");
    name.className = "company-name";
    name.textContent = company.name;
    const count = document.createElement("span");
    count.className = "company-count";
    const customized = Object.keys(company.overrides || {}).length;
    count.textContent = customized ? `${customized} exceção(ões) configurada(s)` : "Usa os padrões";
    details.append(name, count);
    const actions = document.createElement("div");
    actions.className = "company-actions";
    for (const [label, action] of [["Editar", "edit"], ["Remover", "remove"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button";
      button.textContent = label;
      button.dataset.action = action;
      button.dataset.id = company.id;
      actions.append(button);
    }
    item.append(details, actions);
    list.append(item);
  });
}

function showEditor(company = null) {
  $("editor").hidden = false;
  $("editorTitle").textContent = company ? "Editar empresa" : "Nova empresa";
  $("editingId").value = company?.id || "";
  $("companyName").value = company?.name || "";
  $("issuerCnpj").value = company ? formatCnpj(company.issuerCnpj) : "";
  $("customerCnpj").value = company ? formatCnpj(company.customerCnpj) : "";
  $("recipientCnpj").value = company ? formatCnpj(company.recipientCnpj) : "";
  const overrides = company?.overrides || {};
  $("overrideMunicipality").value = overrides.municipality || "";
  $("overrideTaxCode").value = overrides.taxCode || "";
  $("overrideNbs").value = overrides.nbs || "";
  $("overrideOperation").value = overrides.operation || "";
  $("overrideIssqn").value = overrides.issqnImune === true ? "sim" : overrides.issqnImune === false && Object.hasOwn(overrides, "issqnImune") ? "nao" : "";
  $("overrideGovernment").value = overrides.governmentPurchase === true ? "sim" : overrides.governmentPurchase === false && Object.hasOwn(overrides, "governmentPurchase") ? "nao" : "";
  $("overrideOwnRecipient").value = overrides.recipientIsAcquirer === true ? "sim" : overrides.recipientIsAcquirer === false && Object.hasOwn(overrides, "recipientIsAcquirer") ? "nao" : "";
  $("overrideCustomerLocation").value = overrides.customerLocation || "";
  $("overrideRecipientLocation").value = overrides.recipientLocation || "";
  $("overrideIntermediary").value = overrides.intermediary || "";
  $("overrideRegime").value = overrides.regime || "";
  $("editor").scrollIntoView({ block: "nearest" });
  $("companyName").focus();
}

function clearEditor() {
  $("companyForm").reset();
  $("editingId").value = "";
  $("editor").hidden = true;
}

$("newCompany").addEventListener("click", () => showEditor());
$("cancelEdit").addEventListener("click", clearEditor);
$("issuerCnpj").addEventListener("input", (event) => { event.currentTarget.value = formatCnpj(event.currentTarget.value); });
$("customerCnpj").addEventListener("input", (event) => { event.currentTarget.value = formatCnpj(event.currentTarget.value); });
$("recipientCnpj").addEventListener("input", (event) => { event.currentTarget.value = formatCnpj(event.currentTarget.value); });

$("companies").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const company = config.companies.find((item) => item.id === button.dataset.id);
  if (button.dataset.action === "edit" && company) showEditor(company);
  if (button.dataset.action === "remove" && company) {
    config.companies = config.companies.filter((item) => item.id !== company.id);
    await chrome.storage.local.set({ nfseConfig: config });
    renderCompanies();
    $("status").textContent = "Empresa removida do armazenamento local.";
  }
});

$("companyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const issuerCnpj = digits($("issuerCnpj").value);
  if (issuerCnpj.length !== 14) {
    $("status").textContent = "Informe um CNPJ de emitente com 14 dígitos.";
    return;
  }
  if (config.companies.some((company) => company.issuerCnpj === issuerCnpj && company.id !== $("editingId").value)) {
    $("status").textContent = "Esse CNPJ de emitente já está cadastrado.";
    return;
  }
  const overrides = {};
  for (const [field, key] of [["overrideMunicipality", "municipality"], ["overrideTaxCode", "taxCode"], ["overrideNbs", "nbs"], ["overrideOperation", "operation"], ["overrideRegime", "regime"]]) {
    const value = $(field).value.trim();
    if (value) overrides[key] = value;
  }
  if ($("overrideIssqn").value) overrides.issqnImune = $("overrideIssqn").value === "sim";
  if ($("overrideGovernment").value) overrides.governmentPurchase = $("overrideGovernment").value === "sim";
  if ($("overrideOwnRecipient").value) overrides.recipientIsAcquirer = $("overrideOwnRecipient").value === "sim";
  if ($("overrideCustomerLocation").value) overrides.customerLocation = $("overrideCustomerLocation").value;
  if ($("overrideRecipientLocation").value) overrides.recipientLocation = $("overrideRecipientLocation").value;
  if ($("overrideIntermediary").value) overrides.intermediary = $("overrideIntermediary").value;
  const company = {
    id: $("editingId").value || crypto.randomUUID(),
    name: $("companyName").value.trim(),
    issuerCnpj,
    customerCnpj: digits($("customerCnpj").value),
    recipientCnpj: digits($("recipientCnpj").value) || digits($("customerCnpj").value),
    overrides
  };
  const existing = config.companies.findIndex((item) => item.id === company.id);
  if (existing >= 0) config.companies[existing] = company;
  else config.companies.push(company);
  await chrome.storage.local.set({ nfseConfig: config });
  renderCompanies();
  clearEditor();
  $("status").textContent = "Empresa salva neste navegador.";
});

load();

