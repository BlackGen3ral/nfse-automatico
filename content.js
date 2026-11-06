(() => {
  const DIGITS = (value) => (value || "").replace(/\D/g, "");
  const norm = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
  const searched = new WeakMap();
  let timer;
  let lastSignature = "";

  function cnpjInEmitterHeader() {
    const text = Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.children.length === 0 && /logado como/i.test(element.textContent || ""))
      .map((element) => element.textContent || "")
      .join(" ");
    const found = text.match(/(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    return found ? DIGITS(found[0]) : "";
  }

  function visible(element) {
    return !!element && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  }

  function formGroup(label) {
    let element = label;
    for (let i = 0; i < 6 && element && element !== document.body; i++, element = element.parentElement) {
      if (element.matches?.(".form-group,.form-control-group,.form-row,.row,.input-group,[class*=form-group]")) return element;
      if (element.querySelectorAll?.("input,select,textarea").length === 1) return element;
    }
    return label?.parentElement || null;
  }

  function findControl(scope, labelPattern) {
    if (!scope) return null;
    const labels = Array.from(scope.querySelectorAll("label,[aria-label]"));
    for (const label of labels) {
      const text = norm(label.innerText || label.getAttribute("aria-label") || label.textContent);
      if (!labelPattern.test(text)) continue;
      const direct = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector("input,select,textarea,[role=combobox]");
      const candidates = [direct, formGroup(label)?.querySelector("input,select,textarea,[role=combobox]")].filter(Boolean);
      const usable = candidates.find((item) => !item.matches("input[type=radio],input[type=checkbox]") && !item.disabled);
      if (usable) return usable;
    }
    return null;
  }

  function setNativeValue(element, value) {
    if (!element || element.disabled) return false;
    const next = String(value);
    if (element.value === next) return true;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    if (setter) setter.call(element, next);
    else element.value = next;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function selectOption(element, wanted, firstValid = false) {
    if (!element) return false;
    if (element instanceof HTMLSelectElement) {
      const options = Array.from(element.options).filter((option) => !option.disabled && option.value && !/selecione|selecione\.\.\./i.test(norm(option.textContent)));
      let option;
      if (firstValid) option = options[0];
      else {
        const target = norm(wanted).replace(/\s/g, "");
        option = options.find((item) => norm(item.value).replace(/\s/g, "") === target || norm(item.textContent).replace(/\s/g, "").includes(target));
      }
      if (!option) return false;
      if (element.value === option.value) return true;
      element.value = option.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    const chosen = element.closest(".chosen-container") || (element.matches("[role=combobox]") ? element : null);
    if (!chosen) return false;
    chosen.click();
    const search = chosen.querySelector("input.chosen-search-input,input");
    if (search && !firstValid) {
      setNativeValue(search, wanted);
      search.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "p" }));
    }
    requestAnimationFrame(() => {
      const results = Array.from(document.querySelectorAll(".chosen-results .active-result,[role=option]"));
      const target = norm(wanted).replace(/\s/g, "");
      const option = firstValid ? results.find(visible) : results.find((item) => visible(item) && norm(item.textContent).replace(/\s/g, "").includes(target));
      option?.click();
    });
    return true;
  }

  function findRadio(scope, optionText) {
    if (!scope) return null;
    const wanted = norm(optionText);
    for (const label of scope.querySelectorAll("label")) {
      if (norm(label.innerText || label.textContent) === wanted) {
        const input = label.control || label.querySelector("input[type=radio]") || (label.htmlFor && document.getElementById(label.htmlFor));
        if (input?.matches?.("input[type=radio]")) return input;
      }
    }
    for (const radio of scope.querySelectorAll("input[type=radio]")) {
      const wrapper = radio.closest("label") || radio.parentElement;
      if (norm(wrapper?.innerText || wrapper?.textContent) === wanted) return radio;
    }
    return null;
  }

  function chooseRadio(scope, optionText) {
    const radio = findRadio(scope, optionText);
    if (!radio || radio.checked) return !!radio;
    radio.click();
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function findCnpjInput(panel, stem) {
    return panel?.querySelector(`#${stem}_Inscricao, input[name="${stem}.Inscricao"], input[id*="${stem}_Inscricao"]`) ||
      findControl(panel, /^(cpf cnpj|cnpj)$/);
  }

  function triggerSearch(panel, input, buttonId) {
    if (!input || !input.value || searched.get(input) === input.value) return;
    const button = document.getElementById(buttonId) || input.closest(".input-group")?.querySelector("button:not([disabled]),button");
    if (button && !button.disabled) {
      button.click();
      searched.set(input, input.value);
    }
  }

  function fillParty(panel, stem, cnpj, buttonId) {
    if (!panel || !visible(panel) || !cnpj || cnpj.length !== 14) return;
    const input = findCnpjInput(panel, stem);
    if (!input) return;
    setNativeValue(input, cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"));
    triggerSearch(panel, input, buttonId);
  }

  function fillDate() {
    const field = findControl(document, /data de competencia/);
    if (!field) return;
    const now = new Date();
    const value = field.type === "date"
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
      : `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    setNativeValue(field, value);
  }

  function findPortalSection(id, headingText) {
    const byId = document.getElementById(id);
    if (byId) return byId;
    const heading = Array.from(document.querySelectorAll("h1,h2,h3,h4,legend"))
      .find((item) => norm(item.textContent).includes(norm(headingText)));
    return heading?.parentElement || null;
  }

  function fillPeople(config, company) {
    const overrides = company?.overrides || {};
    const governmentPurchase = Object.hasOwn(overrides, "governmentPurchase") ? overrides.governmentPurchase : config.defaults.governmentPurchase;
    const recipientIsAcquirer = Object.hasOwn(overrides, "recipientIsAcquirer") ? overrides.recipientIsAcquirer : config.defaults.recipientIsAcquirer;
    const customerLocation = overrides.customerLocation || "Brasil";
    const recipientLocation = overrides.recipientLocation || config.defaults.recipientCountry || "Brasil";
    const government = document.getElementById("pnlComprasGov") || findPortalSection("", "Compras governamentais");
    chooseRadio(government, governmentPurchase ? "Sim" : "Não");
    const customer = document.getElementById("pnlTomador") || findPortalSection("", "Tomador/adquirente do serviço");
    chooseRadio(customer, customerLocation);
    if (customerLocation === "Brasil") fillParty(customer, "Tomador", company?.customerCnpj || "", "btn_Tomador_Inscricao_pesquisar");

    const destination = document.getElementById("pnlDestinatario") || findPortalSection("", "Destinatário do serviço");
    chooseRadio(destination, recipientIsAcquirer ? "Sim" : "Não");
    const destinationCnpj = company?.recipientCnpj || company?.customerCnpj || "";
    if (!recipientIsAcquirer) {
      chooseRadio(destination, recipientLocation);
      if (recipientLocation === "Brasil") fillParty(destination, "Destinatario", destinationCnpj, "btn_Destinatario_Inscricao_pesquisar");
    }

    const intermediary = document.getElementById("pnlIntermediario") || findPortalSection("", "Intermediário do serviço");
    chooseRadio(intermediary, overrides.intermediary || config.defaults.intermediary || "Intermediário não informado");

    const regimeField = findControl(document, /regime de apuracao dos tributos no simples nacional/);
    if (regimeField) {
      const override = company?.overrides?.regime;
      selectOption(regimeField, override || "", !override);
    }
  }

  function fillService(config, company) {
    const municipality = company?.overrides?.municipality || config.defaults.municipality;
    const taxCode = company?.overrides?.taxCode || config.defaults.taxCode;
    const nbs = company?.overrides?.nbs || config.defaults.nbs;
    const operation = company?.overrides?.operation || config.defaults.operation;
    const issqnImune = Object.hasOwn(company?.overrides || {}, "issqnImune") ? company.overrides.issqnImune : config.defaults.issqnImune;
    const countryField = findControl(document, /^pais$/);
    if (countryField) selectOption(countryField, "Brasil");
    const cityField = findControl(document, /^municipio$/);
    if (cityField) selectOption(cityField, municipality);
    const taxField = findControl(document, /codigo de tributacao nacional/);
    if (taxField) selectOption(taxField, taxCode);
    const issqnGroup = Array.from(document.querySelectorAll("body *"))
      .find((element) => element.children.length === 0 && norm(element.textContent).includes("o servico fornecimento prestado e um caso de imunidade"));
    const issqnScope = issqnGroup ? formGroup(issqnGroup) || issqnGroup.parentElement : document;
    chooseRadio(issqnScope, issqnImune ? "Sim" : "Não");
    const nbsField = findControl(document, /item da nbs correspondente/);
    if (nbsField) selectOption(nbsField, nbs);
    const operationField = findControl(document, /codigo indicador da operacao/);
    if (operationField) selectOption(operationField, operation);
  }

  async function apply() {
    const stored = await chrome.storage.local.get("nfseConfig");
    const config = stored.nfseConfig;
    if (!config?.defaults) return;
    const cnpj = cnpjInEmitterHeader();
    let company = config.companies.find((item) => DIGITS(item.issuerCnpj) === cnpj);
    if (!company && !cnpj && config.companies.length === 1) company = config.companies[0];
    const signature = `${location.pathname}:${cnpj || (company ? "single" : "none")}`;
    if (signature !== lastSignature) lastSignature = signature;

    if (/\/DPS\/Pessoas/i.test(location.pathname)) {
      fillDate();
      fillPeople(config, company);
    }
    if (/\/DPS\/Servico/i.test(location.pathname)) fillService(config, company);
  }

  function scheduleApply() {
    clearTimeout(timer);
    timer = setTimeout(() => apply().catch(() => {}), 350);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.nfseConfig) scheduleApply();
  });
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pageshow", scheduleApply);
  window.addEventListener("popstate", scheduleApply);
  window.addEventListener("hashchange", scheduleApply);
  scheduleApply();
})();

