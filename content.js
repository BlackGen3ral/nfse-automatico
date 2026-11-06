(() => {
  const DIGITS = (value) => (value || "").replace(/\D/g, "");
  const norm = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
  let running = false;
  const peoplePath = /\/DPS\/Pessoas(?:\/|$)/i;
  const servicePath = /\/DPS\/Servi(?:c|ç|%c3%a7)o(?:\/|$)/i;
  const valuesPath = /\/DPS\/Tributacao(?:\/|$)/i;

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
      const usable = candidates.find((item) => !item.matches("input[type=radio],input[type=checkbox],input[type=hidden]"));
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
    if (!(element instanceof HTMLSelectElement)) return false;
    const options = Array.from(element.options).filter((option) =>
      !option.matches(":disabled") && option.value && !/^selecione\b/.test(norm(option.textContent)));
    const target = norm(wanted).replace(/\s/g, "");
    const option = firstValid ? options[0] : options.find((item) => {
      const text = norm(item.textContent);
      const label = text.replace(/\s/g, "");
      return norm(item.value).replace(/\s/g, "") === target ||
        (target && (/^\d+$/.test(target)
          ? label.startsWith(target) && !/\d/.test(label[target.length] || "")
          : text.replace(/^\d+ /, "") === norm(wanted) || text.startsWith(norm(wanted) + " ")));
    });
    if (!option) return false;
    if (element.value === option.value) return true;
    if (element.disabled) return false;
    const chosen = document.getElementById(element.id + "_chosen");
    if (visible(chosen)) {
      const opener = chosen.querySelector(".chosen-single");
      if (!opener) return false;
      if (!chosen.classList.contains("chosen-with-drop")) {
        opener.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      }
      const result = Array.from(chosen.querySelectorAll(".chosen-results .active-result"))
        .find((item) => norm(item.textContent) === norm(option.textContent));
      if (!result) return false;
      result.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      return element.value === option.value;
    }
    return setNativeValue(element, option.value) && element.value === option.value;
  }

  function select2LabelMatches(label, wanted) {
    const text = norm(label);
    if (/^\d+$/.test(wanted)) {
      const code = text.replace(/\s/g, "").match(/^\d+/)?.[0];
      return code === wanted;
    }
    return text === norm(wanted) || text === "pimenta bueno rondonia";
  }

  function pressWidgetKey(element, key, code) {
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key, keyCode: code, which: code, bubbles: true, cancelable: true
    }));
  }

  async function searchSelect2(label, id, wanted, terms) {
    const field = () => document.getElementById(id);
    const selection = () => document.getElementById("select2-" + id + "-container")?.closest(".select2-selection");
    const selected = () => {
      const option = field()?.selectedOptions?.[0];
      return !!option?.value && (option.value === wanted || select2LabelMatches(option.textContent, wanted));
    };
    const control = await waitFor(label, () => {
      const widget = selection();
      return field() && !field().disabled && visible(widget) && widget;
    }, 12000);
    if (selected()) return;
    if (control.getAttribute("aria-expanded") !== "true") {
      pressWidgetKey(control, "Enter", 13);
    }
    try {
      const listId = "select2-" + id + "-results";
      const search = await waitFor(label + " · caixa de busca", () => {
        if (control.getAttribute("aria-expanded") !== "true") return null;
        const owned = document.querySelector(".select2-search__field[aria-controls='" + listId + "']");
        return owned || document.querySelector(".select2-container--open .select2-search__field");
      });
      for (const term of terms) {
        search.value = term;
        search.dispatchEvent(new Event("input", { bubbles: true }));
        const result = await waitFor(label + " · resultado", () => {
          const list = document.getElementById(listId);
          return Array.from(list?.querySelectorAll("li[aria-selected], li.select2-results__option--selectable") || [])
            .find((item) => visible(item) && item.getAttribute("aria-disabled") !== "true" &&
              select2LabelMatches(item.textContent, wanted));
        }, 4500).catch(() => null);
        if (!result) continue;
        result.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
        await waitFor(label + " · seleção", selected);
        return;
      }
      throw new Error(label + " · resultado");
    } finally {
      if (control.getAttribute("aria-expanded") === "true") {
        pressWidgetKey(control, "Escape", 27);
      }
    }
  }

  function findRadio(scope, optionText, group) {
    if (!scope) return null;
    const wanted = norm(optionText);
    const matchesGroup = (input) => input?.matches?.("input[type=radio]") &&
      (group === undefined || input.name === group);
    for (const label of scope.querySelectorAll("label")) {
      if (norm(label.innerText || label.textContent) === wanted) {
        const input = label.control || label.querySelector("input[type=radio]") || (label.htmlFor && document.getElementById(label.htmlFor));
        if (matchesGroup(input)) return input;
      }
    }
    for (const radio of scope.querySelectorAll("input[type=radio]")) {
      if (!matchesGroup(radio)) continue;
      const wrapper = radio.closest("label") || radio.parentElement;
      if (norm(wrapper?.innerText || wrapper?.textContent) === wanted) return radio;
    }
    return null;
  }

  function chooseRadio(scope, optionText, group) {
    const radio = findRadio(scope, optionText, group);
    if (!radio || radio.disabled) return !!radio?.checked;
    if (!radio.checked) {
      const label = Array.from(radio.labels || []).find((item) =>
        norm(item.innerText || item.textContent) === norm(optionText));
      label?.click();
    }
    if (!radio.checked) radio.click();
    return radio.checked;
  }

  function findCnpjInput(panel, stem) {
    return panel?.querySelector(`#${stem}_Inscricao, input[name="${stem}.Inscricao"], input[id*="${stem}_Inscricao"]`) ||
      findControl(panel, /^(cpf cnpj|cnpj)$/);
  }

  const defaults = {
    governmentPurchase: false, recipientIsAcquirer: false,
    customerLocation: "Brasil", recipientLocation: "Brasil", intermediary: "Intermediário não informado"
  };

  async function preferences() {
    const { nfseConfig } = await chrome.storage.local.get("nfseConfig");
    const issuer = cnpjInEmitterHeader();
    const profile = issuer && nfseConfig?.companies?.find((item) => DIGITS(item.issuerCnpj) === issuer);
    return { ...defaults, ...nfseConfig?.defaults, ...profile?.overrides };
  }

  let statusBox;
  function showStatus(phase, text) {
    if (!statusBox?.isConnected) {
      statusBox = document.createElement("aside");
      statusBox.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:2147483647;width:min(360px,calc(100vw - 40px));box-sizing:border-box;padding:12px 38px 12px 14px;border-radius:8px;color:white;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px #0003";
      const message = document.createElement("div");
      message.setAttribute("role", "status");
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Fechar aviso da extensão");
      close.style.cssText = "position:absolute;top:6px;right:8px;border:0;background:none;color:inherit;font-size:22px;cursor:pointer";
      close.addEventListener("click", () => statusBox.remove());
      statusBox.append(message, close);
      document.body.append(statusBox);
    }
    statusBox.style.background = phase === "error" ? "#83351e" : "#134b3a";
    statusBox.firstElementChild.textContent = text;
  }

  const draftId = () => new URLSearchParams(location.search).get("idr");

  function update(phase, text, { valuesDraft = null, invoice = null, invoiceDraft = null, retryStep = null } = {}) {
    showStatus(phase, text);
    return chrome.runtime.sendMessage({
      type: "nfse:update",
      state: {
        phase, text, valuesDraft, invoice, invoiceDraft, retryStep,
        until: Date.now() + (valuesDraft || retryStep ? 1800000 : 120000)
      }
    });
  }

  function validInvoice(invoice) {
    return typeof invoice?.description === "string" && !!invoice.description.trim() &&
      invoice.description.length <= 2000 && typeof invoice.amount === "string" &&
      /^\d{1,20},\d{2}$/.test(invoice.amount) && /[1-9]/.test(invoice.amount) &&
      (invoice.issqnSuspended === undefined || typeof invoice.issqnSuspended === "boolean");
  }

  function advanceButton(fieldId, stagePath, stageName) {
    const field = document.getElementById(fieldId);
    const form = field?.form || field?.closest("form");
    if (!stagePath.test(location.pathname) || !form) throw new Error("Formulário da etapa " + stageName);
    const buttons = Array.from(form.querySelectorAll("button,input[type=submit]")).filter((element) =>
      visible(element) && !element.disabled && norm(element.textContent || element.value) === "avancar");
    if (buttons.length !== 1) throw new Error("Botão Avançar da etapa " + stageName);
    if (!form.checkValidity() || form.querySelector("input.input-validation-error, select.input-validation-error, textarea.input-validation-error")) {
      throw new Error("Campos obrigatórios da etapa " + stageName);
    }
    return buttons[0];
  }

  function watchAdvance(path, button, stageName, invoice = null) {
    button.click();
    setTimeout(() => {
      if (path.test(location.pathname)) {
        report(new Error("O portal permaneceu em " + stageName + ". Verifique os avisos da página"), invoice).catch(() => {});
      }
    }, 25000);
  }

  async function waitFor(label, predicate, timeout = 7500) {
    const deadline = Date.now() + timeout;
    do {
      const result = predicate();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 140));
    } while (Date.now() < deadline);
    throw new Error(label);
  }

  function panel(id) {
    const element = document.getElementById(id);
    return visible(element) ? element : null;
  }

  function applyRadio(scope, label, option) {
    return waitFor(label, () => chooseRadio(scope(), option));
  }

  function dateValue(field) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return field.type === "date" ? [year, month, day].join("-") : [day, month, year].join("/");
  }

  function lookupName(scope, stem) {
    const field = scope?.querySelector("#" + stem + "_Nome, [name='" + stem + ".Nome']") ||
      findControl(scope, /^(?:nome(?: (?:ou )?razao social)?|razao social)$/);
    return (field?.value || field?.textContent || "").trim();
  }

  async function lookup(scope, stem, label, cnpj) {
    const field = () => findCnpjInput(scope(), stem);
    const input = await waitFor(label + " · campo de CNPJ", () => visible(field()) && field());
    const previousCnpj = DIGITS(input.value);
    const previousName = lookupName(scope(), stem);
    const formatted = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    if (!setNativeValue(input, formatted) || DIGITS(input.value) !== cnpj) throw new Error(label + " · CNPJ");
    const button = await waitFor(label + " · botão de pesquisa", () => {
      const candidate = scope()?.querySelector("#btn_" + stem + "_Inscricao_pesquisar") ||
        field()?.closest(".input-group")?.querySelector("button[id$='_pesquisar']");
      return visible(candidate) && !candidate.disabled && candidate;
    });
    let nameWasCleared = !previousName || !lookupName(scope(), stem);
    button.click();
    await waitFor(label + " · resultado da pesquisa", () => {
      const name = lookupName(scope(), stem);
      if (!name) nameWasCleared = true;
      return DIGITS(field()?.value) === cnpj && name &&
        (previousCnpj === cnpj || nameWasCleared || name !== previousName);
    }, 12000);
  }

  async function fillPeople(cnpj, invoice) {
    const settings = await preferences();
    const scope = document.querySelector("main, #main-content") || document;
    const issues = [];
    async function tryStep(step) {
      try { await step(); return true; }
      catch (error) { issues.push(error.message); return false; }
    }

    // O portal habilita a competência e as informações do destinatário após esta escolha.
    const ibs = () => panel("pnlInfoIBSCBS");
    if (ibs()) await tryStep(() => applyRadio(ibs, "Preencher as informações IBS/CBS", "Sim"));
    await tryStep(() => waitFor("Data de competência", () => {
      const field = document.getElementById("DataCompetencia") || findControl(scope, /^data de competencia/);
      return visible(field) && !field.disabled && setNativeValue(field, dateValue(field)) && field.value === dateValue(field);
    }));
    const regime = () => findControl(scope, /regime de apuracao/);
    if (regime()) await tryStep(() => waitFor("Regime de apuração", () => selectOption(regime(), settings.regime, !settings.regime || settings.regime === "first-valid")));
    const government = () => panel("pnlComprasGov");
    if (government()) await tryStep(() => applyRadio(government, "Compra governamental", settings.governmentPurchase ? "Sim" : "Não"));

    const customer = () => panel("pnlTomador");
    const customerReady = await tryStep(() => applyRadio(customer, "Localização do tomador", settings.customerLocation));
    if (customerReady && settings.customerLocation === "Brasil") {
      showStatus("people", "Pesquisando o CNPJ do tomador…");
      await tryStep(() => lookup(customer, "Tomador", "Tomador", cnpj));
    }
    const destination = () => panel("pnlDestinatario");
    const destinationReady = await tryStep(() => applyRadio(destination, "Destinatário é o próprio adquirente", settings.recipientIsAcquirer ? "Sim" : "Não"));
    if (destinationReady && !settings.recipientIsAcquirer) {
      const locationReady = await tryStep(() => applyRadio(destination, "Localização do destinatário", settings.recipientLocation));
      if (locationReady && settings.recipientLocation === "Brasil") {
        showStatus("people", "Pesquisando o CNPJ do destinatário…");
        await tryStep(() => lookup(destination, "Destinatario", "Destinatário", cnpj));
      }
    }
    await tryStep(() => applyRadio(() => panel("pnlIntermediario"), "Intermediário", settings.intermediary));
    if (issues.length) throw new Error(issues.join(" · "));

    const next = document.getElementById("btnAvancar");
    const form = next?.form || next?.closest("form");
    if (!peoplePath.test(location.pathname) || !visible(next) || next.disabled || !form) throw new Error("Botão Avançar");
    if (!form.checkValidity() || form.querySelector("input.input-validation-error, select.input-validation-error, textarea.input-validation-error")) {
      throw new Error("Campos obrigatórios da etapa Pessoas");
    }

    const armed = await update("waiting", "Pessoas preenchida. Abrindo a etapa Serviço…", {
      invoice, invoiceDraft: draftId()
    });
    if (!armed || !peoplePath.test(location.pathname)) throw new Error("Transição para Serviço");
    next.click();
    setTimeout(() => {
      if (peoplePath.test(location.pathname)) {
        update("error", "O portal permaneceu em Pessoas. Confira os avisos da página antes de avançar.").catch(() => {});
      }
    }, 120000);
  }

  async function fillService(invoice = null) {
    await update("service", "Preenchendo Serviço…");
    const scope = document.querySelector("main, #main-content") || document;
    const select = (label, id, value) => waitFor(label, () => selectOption(document.getElementById(id), value), 12000);
    const issues = [];
    async function attempt(step) {
      try { await step(); } catch (error) { issues.push(error.message); }
    }
    await attempt(async () => {
      await select("País", "LocalPrestacao_CodigoPaisPrestacao", "Brasil");
      showStatus("service", "Buscando Pimenta Bueno/RO…");
      await searchSelect2("Município", "LocalPrestacao_CodigoMunicipioPrestacao", "Pimenta Bueno/RO", ["Pimenta Bueno"]);
      showStatus("service", "Buscando o código de tributação 140201…");
      await searchSelect2("Código de Tributação Nacional", "ServicoPrestado_CodigoTributacaoNacional", "140201", ["140201", "14.02.01"]);
    });
    const issqn = () => {
      const panel = document.getElementById("pnlServicoPrestado") || scope;
      const label = Array.from(panel.querySelectorAll("label,legend,p,span,div")).find((element) =>
        norm(element.textContent).startsWith("o servico fornecimento prestado e um caso de imunidade") &&
        !element.querySelector("input,select,textarea"));
      if (!label) return null;
      for (let item = label.parentElement; item && item !== scope; item = item.parentElement) {
        if (findRadio(item, "Sim") && findRadio(item, "Não")) return item;
      }
      return null;
    };
    await attempt(() => applyRadio(issqn, "Imunidade, exportação ou não incidência do ISSQN", "Não"));
    if (issues.length) throw new Error(issues.join(" · "));
    await attempt(() => select("Item da NBS", "ServicoPrestado_CodigoNBS", "120012000"));
    await attempt(() => select("Código indicador da operação", "ServicoPrestado_CodigoIndOp", "050101"));
    if (issues.length) throw new Error(issues.join(" · "));
    const draft = draftId();
    if (!invoice) {
      await update("done", "Serviço preenchido. Complete a descrição e avance quando estiver pronto.", { valuesDraft: draft });
      return;
    }
    await waitFor("Descrição do Serviço/Fornecimento", () => {
      const field = document.getElementById("ServicoPrestado_Descricao");
      return visible(field) && !field.disabled && !field.readOnly &&
        setNativeValue(field, invoice.description) && field.value === invoice.description;
    });
    if (!draft) throw new Error("Rascunho da etapa Serviço");
    const next = advanceButton("ServicoPrestado_Descricao", servicePath, "Serviço");
    const armed = await update("done", "Serviço preenchido. Abrindo Valores…", { valuesDraft: draft, invoice });
    if (!armed || !servicePath.test(location.pathname)) throw new Error("Transição para Valores");
    watchAdvance(servicePath, next, "Serviço", invoice);
  }

  function selectIssqnAnswer(questionStart, answer) {
    const scope = document.getElementById("pnlOperacaoTributavel");
    if (!visible(scope)) return false;
    const question = Array.from(scope.querySelectorAll("label,legend,p,span,div")).find((item) =>
      norm(item.textContent).startsWith(questionStart) &&
      !item.querySelector("input,select,textarea"));
    if (!question) return false;
    const following = Array.from(scope.querySelectorAll("input[type=radio],hr")).filter((item) =>
      question.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING);
    const [first, second] = following;
    if (!first?.name || first.name !== second?.name ||
        !first.matches("input[type=radio]") || !second.matches("input[type=radio]")) return false;
    if (!findRadio(scope, "Não", first.name) || !findRadio(scope, "Sim", first.name)) return false;
    return chooseRadio(scope, answer, first.name);
  }

  async function fillValues(invoice = null) {
    await update("values", "Preenchendo Valores…");
    const issues = [];
    async function attempt(step) {
      try { await step(); return true; }
      catch (error) { issues.push(error.message); return false; }
    }
    const select = (label, id, code) => waitFor(label,
      () => selectOption(document.getElementById(id), code), 12000);
    if (invoice) await attempt(() => waitFor("Valor do serviço", () => {
      const field = document.getElementById("Valores_ValorServico");
      if (!visible(field) || field.disabled || field.readOnly) return false;
      const formatted = invoice.amount.replace(/\B(?=(\d{3})+,)/g, ".");
      return setNativeValue(field, formatted) && field.value.replace(/\./g, "").trim() === invoice.amount;
    }));
    const suspension = invoice?.issqnSuspended === true ? "Sim" : "Não";
    await attempt(() => waitFor("Suspensão da exigibilidade do ISSQN", () => selectIssqnAnswer(
      "a exigibilidade do recolhimento do issqn devido nesta operacao esta suspensa", suspension)));
    await attempt(() => waitFor("Retenção do ISSQN", () => selectIssqnAnswer(
      "ha retencao do issqn pelo tomador ou pelo intermediario", "Não")));
    const pisReady = await attempt(() => select("Situação Tributária do PIS/COFINS",
      "TributacaoFederal_PISCofins_SituacaoTributaria", "00"));
    if (pisReady) await attempt(() => select("Tipo de retenção do PIS/COFINS/CSLL",
      "TributacaoFederal_PISCofins_TipoRetencao", "0"));
    const ibsReady = await attempt(() => select("Código de Situação Tributária",
      "ValorTributos_CodigoSituacaoTributaria", "000"));
    if (ibsReady) await attempt(() => select("Código de Classificação Tributária",
      "ValorTributos_CodigoClassificacaoTributaria", "000001"));

    const rateModeReady = await attempt(() => applyRadio(() => panel("pnlValorTributos"),
      "Informar alíquota do Simples Nacional", "Informar alíquota do Simples Nacional"));
    if (rateModeReady) await attempt(() => waitFor("Alíquota do Simples Nacional", () => {
      const field = document.getElementById("ValorTributos_AliquotaSN");
      return visible(field) && !field.disabled && !field.readOnly &&
        setNativeValue(field, "6,00") && field.value === "6,00";
    }));

    if (issues.length) throw new Error(issues.join(" · "));
    if (!invoice) {
      await update("done", "Valores preenchidos. Confira os dados antes de avançar.");
      return;
    }
    if (invoice.issqnSuspended) {
      const scope = document.getElementById("pnlOperacaoTributavel");
      const required = scope?.querySelectorAll("input[required], input[data-val-required], select[required], select[data-val-required]") || [];
      const missing = Array.from(required).some((field) => {
        const shown = visible(field) || visible(document.getElementById(field.id + "_chosen"));
        return shown && !field.disabled && !field.matches("[type=radio],[type=checkbox],[type=hidden]") && !field.value.trim();
      });
      if (missing) throw new Error("Preencha os dados da suspensão da exigibilidade do ISSQN");
    }
    const next = advanceButton("Valores_ValorServico", valuesPath, "Valores");
    const armed = await update("review", "Preenchimento concluído. Revise a nota e decida quando emitir.");
    if (!armed || !valuesPath.test(location.pathname)) throw new Error("Transição para revisão");
    watchAdvance(valuesPath, next, "Valores", invoice);
  }

  function report(error, invoice = null) {
    const draft = invoice && draftId();
    return update("error", "Confira no portal: " + error.message + ".", draft ? {
      invoice, invoiceDraft: draft, retryStep: valuesPath.test(location.pathname) ? "values" : "service"
    } : {});
  }

  async function resume() {
    const inValues = valuesPath.test(location.pathname);
    if (running || (!inValues && !servicePath.test(location.pathname))) return;
    running = true;
    let invoice = null;
    try {
      const flow = await chrome.runtime.sendMessage({ type: inValues ? "nfse:claim-values" : "nfse:claim" });
      invoice = validInvoice(flow?.invoice) ? flow.invoice : null;
      if (flow) await (inValues ? fillValues(invoice) : fillService(invoice));
    } catch (error) {
      await report(error, invoice);
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _, respond) => {
    if (message.type === "nfse:start-service" || message.type === "nfse:start-values") {
      const inValues = message.type === "nfse:start-values";
      if (running || !(inValues ? valuesPath : servicePath).test(location.pathname)) {
        respond({ ok: false });
        return;
      }
      running = true;
      respond({ ok: true });
      let invoice = null;
      (async () => {
        const state = await chrome.runtime.sendMessage({ type: "nfse:status" });
        if (state?.until > Date.now() && state.retryStep === (inValues ? "values" : "service") &&
            state.invoiceDraft === draftId() && validInvoice(state.invoice)) invoice = state.invoice;
        await (inValues ? fillValues(invoice) : fillService(invoice));
      })().catch((error) => report(error, invoice)).finally(() => { running = false; }).catch(() => {});
      return;
    }
    if (message.type !== "nfse:start") return;
    if (running || !peoplePath.test(location.pathname) || !/^\d{14}$/.test(message.cnpj) || !validInvoice(message.invoice)) {
      respond({ ok: false });
      return;
    }
    running = true;
    (async () => {
      const state = await update("people", "Preenchendo Pessoas e pesquisando o CNPJ…");
      if (!state) throw new Error("Início do preenchimento");
      respond({ ok: true });
      await fillPeople(message.cnpj, message.invoice);
    })().catch(async (error) => {
      respond({ ok: false });
      await report(error);
    }).finally(() => {
      running = false;
      resume().catch(() => {});
    }).catch(() => {});
    return true;
  });
  window.addEventListener("pageshow", () => resume().catch(() => {}));
  resume().catch(() => {});
})();
