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
let refreshSequence = 0;
const panelParams = new URLSearchParams(location.search);
const expandedView = panelParams.get("expanded") === "1";
const sourceParam = panelParams.get("sourceTab");
const boundSourceTab = sourceParam !== null && /^\d+$/.test(sourceParam) && Number.isSafeInteger(Number(sourceParam)) ? Number(sourceParam) : null;
document.body.classList.toggle("expanded-view", expandedView);
let openingNoteTab = false;
if (expandedView) {
  document.getElementById("new-note-tab").title = "Voltar à guia do portal";
  document.getElementById("new-note-tab").setAttribute("aria-label","Voltar à guia do portal");
}
document.getElementById("new-note-tab").addEventListener("click", async () => {
  if (openingNoteTab) return;
  const opener = document.getElementById("new-note-tab");
  openingNoteTab = true;
  opener.disabled = true;
  opener.setAttribute("aria-busy", "true");
  try {
    if (expandedView) {
      const source = await targetTab();
      if (source) await chrome.tabs.update(source.id,{active:true});
      else show("A guia do portal foi fechada. Abra o painel lateral pela guia que deseja usar.",true);
      return;
    }
    const result = await chrome.runtime.sendMessage({type:"nfse:expand-panel",sourceTabId:tab?.id});
    if (!result) { show("O navegador ainda não carregou a expansão do painel. Recarregue a extensão ou encerre e abra o navegador.",true); return; }
    if (!result?.ok) show(result?.error || "Não consegui expandir o painel. Tente novamente.", true);
  } catch { show("Não consegui expandir o painel. Reabra a extensão e tente novamente.", true); }
  finally { openingNoteTab = false; opener.disabled = false; opener.setAttribute("aria-busy", "false"); }
});
let pastePending = false;
async function pasteCopiedCnpj() {
  if (input.disabled || pastePending) return;
  const currentDraft = draftKey;
  pastePending = true;
  renderButton();
  try {
    const text = await navigator.clipboard.readText();
    if (input.disabled || currentDraft !== draftKey) return;
    const cnpj = text.trim().replace(/[\s./-]/g, "");
    if (!/^\d{14}$/.test(cnpj)) {
      closeSavedPicker();
      input.focus({preventScroll:true});
      show("Copie um CNPJ com 14 números e clique novamente na caixinha do CNPJ.");
      return;
    }
    input.value = mask(cnpj);
    closeSavedPicker();
    onDraftEdit();
    description.focus();
  } catch {
    if (!input.disabled && currentDraft === draftKey) {
      closeSavedPicker();
      input.focus({preventScroll:true});
      show("Não consegui acessar o conteúdo copiado. Use Ctrl + V no campo CNPJ.");
    }
  } finally {
    pastePending = false;
    renderButton();
  }
}
document.getElementById("paste-cnpj").addEventListener("click", pasteCopiedCnpj);
const savedCnpjsKey = "nfseSavedCnpjs";
const pickerAboveKey = "nfseCnpjPickerAbove";
let pickerAbove = false, positionSaving = false;
const pickerAboveChoice = document.getElementById("cnpj-picker-above");
let savedCnpjs = [], savedWriting = false;
const savedPicker = document.getElementById("saved-cnpjs");
const savedSearch = document.getElementById("search-cnpj");
const savedOpener = document.getElementById("open-cnpjs");
const pickerOpen = () => savedPicker.matches(":popover-open");
function closeSavedPicker() { if (pickerOpen()) savedPicker.hidePopover(); }
function positionSavedPicker() {
  if (!pickerOpen()) return;
  const rect = input.getBoundingClientRect();
  const above = rect.top - 16, below = innerHeight - rect.bottom - 16;
  const showAbove = pickerAbove ? above >= 160 || above >= below : below < 160 && above > below;
  savedPicker.style.width = Math.min(Math.max(rect.width, 240), 340, innerWidth - 16) + "px";
  savedPicker.style.maxHeight = Math.max(100, Math.min(320, showAbove ? above : below)) + "px";
  savedPicker.style.left = Math.max(8, Math.min(rect.left, innerWidth - savedPicker.offsetWidth - 8)) + "px";
  savedPicker.style.top = Math.max(8, showAbove ? rect.top - savedPicker.offsetHeight - 8 : rect.bottom + 8) + "px";
}
function openSavedPicker(focusSearch = false) {
  if (input.disabled || savedWriting) return;
  if (!pickerOpen()) {
    savedSearch.value = "";
    renderSavedCnpjs();
    savedPicker.showPopover();
  }
  positionSavedPicker();
  if (focusSearch) savedSearch.focus({preventScroll:true});
}
input.addEventListener("click", () => {
  // Um campo preenchido precisa continuar editável sem sobrescrever o número
  // nem levar o foco de volta para a descrição.
  if (!input.value.trim()) pasteCopiedCnpj();
});
input.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" && !event.isComposing) { event.preventDefault(); openSavedPicker(true); }
});
savedOpener.onclick = () => openSavedPicker(true);
pickerAboveChoice.addEventListener("change", async () => {
  if (input.disabled || positionSaving) return;
  const previous = pickerAbove;
  pickerAbove = pickerAboveChoice.checked;
  positionSaving = true;
  pickerAboveChoice.disabled = true;
  positionSavedPicker();
  try { await chrome.storage.local.set({[pickerAboveKey]: pickerAbove}); }
  catch {
    pickerAbove = previous;
    pickerAboveChoice.checked = previous;
    positionSavedPicker();
    savedMessage("Não foi possível salvar a posição da caixinha. Tente novamente.", true);
  } finally {
    positionSaving = false;
    pickerAboveChoice.disabled = input.disabled;
  }
});
document.getElementById("close-cnpjs").onclick = () => { closeSavedPicker(); input.focus({preventScroll:true}); };
savedSearch.addEventListener("input", renderSavedCnpjs);
savedSearch.addEventListener("keydown", event => {
  if (event.isComposing) return;
  if (event.key === "Enter") { event.preventDefault(); savedPicker.querySelector(".choose-cnpj:not(:disabled)")?.click(); }
  if (event.key === "ArrowDown") { event.preventDefault(); savedPicker.querySelector(".choose-cnpj:not(:disabled)")?.focus(); }
  if (event.key === "Escape") { event.preventDefault(); closeSavedPicker(); input.focus({preventScroll:true}); }
});
savedPicker.addEventListener("toggle", () => {
  const expanded = String(pickerOpen());
  input.setAttribute("aria-expanded", expanded);
  savedOpener.setAttribute("aria-expanded", expanded);
});
document.addEventListener("focus", event => {
  if (event.target !== input && event.target !== savedOpener && !savedPicker.contains(event.target)) closeSavedPicker();
}, true);
window.addEventListener("resize", positionSavedPicker);
document.querySelector("main").addEventListener("scroll", closeSavedPicker, {passive:true});
function cleanSavedCnpjs(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(cnpj => typeof cnpj === "string" && /^\d{14}$/.test(cnpj)))];
}
function savedMessage(text, error = false) {
  const message = document.getElementById("saved-cnpj-status");
  message.textContent = text;
  message.dataset.error = String(error);
  message.hidden = !text;
}
function renderSavedCnpjs() {
  const blocked = input.disabled || savedWriting;
  const saved = savedCnpjs.includes(digits(input.value));
  const save = document.getElementById("save-cnpj");
  save.disabled = blocked || digits(input.value).length !== 14 || saved;
  save.textContent = saved ? "✓ Salvo" : "＋ Salvar";
  savedOpener.disabled = blocked;
  pickerAboveChoice.disabled = input.disabled || positionSaving;
  if (input.disabled) closeSavedPicker();
  document.getElementById("saved-cnpj-count").textContent = String(savedCnpjs.length);
  const list = document.getElementById("saved-cnpj-list");
  list.replaceChildren();
  const query = savedSearch.value.trim();
  const searchDigits = query.replace(/\D/g, "");
  const matches = savedCnpjs.filter(cnpj => !query || (searchDigits && cnpj.includes(searchDigits)));
  const empty = document.getElementById("saved-cnpj-empty");
  empty.hidden = !!matches.length;
  empty.textContent = savedCnpjs.length ? "Nenhum CNPJ encontrado." : "Salve um CNPJ pelo botão ＋ Salvar para encontrá-lo aqui.";
  for (const cnpj of matches) {
    const item = document.createElement("li");
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "choose-cnpj";
    choose.textContent = mask(cnpj);
    choose.disabled = blocked;
    choose.setAttribute("aria-label", "Usar CNPJ " + mask(cnpj));
    choose.onclick = () => {
      if (input.disabled || savedWriting) return;
      input.value = mask(cnpj);
      closeSavedPicker();
      onDraftEdit();
      description.focus();
    };
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-cnpj";
    remove.textContent = "×";
    remove.disabled = blocked;
    remove.setAttribute("aria-label", "Remover CNPJ " + mask(cnpj));
    remove.onclick = () => changeSavedCnpjs(cnpj, true);
    item.append(choose, remove);
    list.append(item);
  }
  positionSavedPicker();
}
async function changeSavedCnpjs(cnpj, remove = false) {
  if (input.disabled || savedWriting || !/^\d{14}$/.test(cnpj)) return;
  savedWriting = true;
  renderSavedCnpjs();
  try {
    const stored = await chrome.storage.local.get(savedCnpjsKey);
    const current = cleanSavedCnpjs(stored[savedCnpjsKey]);
    const next = remove ? current.filter(value => value !== cnpj) : [...new Set([...current, cnpj])];
    await chrome.storage.local.set({[savedCnpjsKey]: next});
    savedCnpjs = next;
    savedMessage(remove ? "CNPJ removido da lista." : "CNPJ salvo neste navegador.");
  } catch {
    savedMessage("Não foi possível alterar os CNPJs salvos. Tente novamente.", true);
  } finally {
    savedWriting = false;
    renderSavedCnpjs();
  }
}
document.getElementById("save-cnpj").onclick = () => changeSavedCnpjs(digits(input.value));
async function closePanel() {
  if (expandedView) {
    if (tab) await chrome.tabs.update(tab.id,{active:true});
    return;
  }
  try {
    const current = await chrome.windows.getCurrent();
    await chrome.sidePanel.close({ windowId: current.id });
  } catch {
    show("Use o X da lateral do Chrome para fechar o painel.", true);
  }
}
async function targetTab() {
  if (expandedView) {
    if (boundSourceTab !== null) return chrome.tabs.get(boundSourceTab).catch(()=>null);
    const portals = await chrome.tabs.query({url:"https://www.nfse.gov.br/EmissorNacional/*",currentWindow:true});
    return portals.find(item=>item.active) || (portals.length === 1 ? portals[0] : null);
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}
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
  button.setAttribute("aria-busy", String(busy || starting));
  document.querySelector("#count").textContent = description.value.length + "/2000";
  const inService = serviceUrl.test(tab?.url || "");
  const inValues = valuesUrl.test(tab?.url || "");
  const withoutCnpj = inService || inValues;
  const portalOpen = peopleUrl.test(tab?.url || "") || withoutCnpj;
  const portalState = document.getElementById("portal-state");
  portalState.textContent = portalOpen ? "Portal aberto" : "Aguardando portal";
  portalState.dataset.open = String(portalOpen);
  document.querySelector("#people-fields").hidden = withoutCnpj;
  document.querySelector("#fill-label").textContent = inValues ? "Preencher Valores" : inService ? "Preencher Serviço" : "Preencher até a revisão";
  if (busy || starting) document.querySelector("#fill-label").textContent = starting ? "Preparando sua nota…" : "Preenchendo nota…";
  for (const field of [input, description, amount, ...suspensionChoices]) {
    field.disabled = withoutCnpj || initializing || busy || starting;
  }
  document.getElementById("paste-cnpj").disabled = input.disabled || pastePending;
  button.disabled = initializing || busy || starting ||
    (!withoutCnpj && (!peopleUrl.test(tab?.url || "") || digits(input.value).length !== 14 || !invoiceData()));
  renderSavedCnpjs();
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
    : "Use o formato 1.234,56. Enter para preencher.";
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
  if (!initializing && !busy && !starting && peopleUrl.test(tab?.url || "") && status.dataset.error !== "true") {
    show(digits(input.value).length === 14 && invoiceData()
      ? "Tudo pronto. Vamos preparar sua nota?"
      : "Informe o CNPJ, a descrição e o valor para começar.");
  }
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
for (const field of [input, description, amount]) field.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.isComposing || event.altKey || event.shiftKey || field.disabled) return;
  if (field === description) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    amount.focus();
    return;
  }
  if (event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  if (event.repeat) return;
  if (field === input) {
    if (digits(input.value).length === 14) description.focus();
    else show("Complete os 14 números do CNPJ antes de continuar.");
  } else if (!serviceAmount()) {
    showAmountHint();
    show("Informe um valor maior que zero antes de continuar.");
  } else if (!description.value.trim()) description.focus();
  else if (digits(input.value).length !== 14) input.focus();
  else if (!button.disabled) document.getElementById("fill-form").requestSubmit(button);
});

async function initialize() {
  renderButton();
  try {
    const stored = await chrome.storage.local.get(savedCnpjsKey);
    savedCnpjs = cleanSavedCnpjs(stored[savedCnpjsKey]);
    const position = await chrome.storage.local.get(pickerAboveKey);
    pickerAbove = position[pickerAboveKey] === true;
    pickerAboveChoice.checked = pickerAbove;
  } catch { savedMessage("Não foi possível carregar os CNPJs salvos.", true); }
  await refresh();
  if (!input.disabled && peopleUrl.test(tab?.url || "")) input.focus({preventScroll:true});
}
async function refresh() {
  const sequence = ++refreshSequence;
  const nextTab = await targetTab();
  if (sequence !== refreshSequence) return;
  if (tab?.id !== nextTab?.id || initializing) {
    initializing = true;
    renderButton();
    const nextKey = nextTab?.id == null ? null : "nfsePopupDraft:" + nextTab.id;
    const saved = nextKey ? (await chrome.storage.session.get(nextKey))[nextKey] : null;
    if (sequence !== refreshSequence) return;
    tab = nextTab;
    draftKey = nextKey;
    input.value = mask(digits(saved?.cnpj || ""));
    description.value = saved?.description || "";
    amount.value = saved?.amount || "";
    setSuspension(saved?.suspension === "yes" ? "yes" : "no");
    showAmountHint();
    busy = starting = false;
    initializing = false;
  } else { tab = nextTab; }
  const key = "nfseFlow:" + tab?.id;
  const flow = (await chrome.storage.session.get(key))[key];
  if (sequence !== refreshSequence) return;
  const current = flow?.until > Date.now() ? flow : null;
  const auditReview = document.getElementById("audit-review");
  auditReview.hidden = !current?.audit?.length;
  const auditContent = document.getElementById("audit-content");
  auditContent.replaceChildren();
  for (const record of current?.audit || []) {
    const entry = document.createElement("p");
    entry.textContent = record.stage + " · " + record.count + " campos confirmados antes de avançar. " + (record.fields || []).join(" · ");
    auditContent.append(entry);
  }
  for (const item of current?.reviewReport?.items || []) {
    const entry=document.createElement("p");
    entry.textContent=(item.status==="confirmed"?"✓ Confirmado: ":item.status==="changed"?"⚠ Diferente: ":item.status==="stage-only"?"○ Conferido na etapa anterior: ":"○ Conferir manualmente: ")+item.label+". Esperado: "+item.display+". Revisão: "+(item.actual ?? (item.status==="stage-only"?"Não exibido nesta tela":"Não localizado nesta tela"))+".";
    auditContent.append(entry);
  }
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
    if (!reply?.ok) {
      starting = false;
      renderButton();
      show(reply?.error || "Não foi possível iniciar. Atualize a página do portal e tente novamente.", true);
      return;
    }
    if (message.type === "nfse:start") {
      if (expandedView) { starting = false; await refresh(); }
      await closePanel();
      return;
    }
    starting = false;
    await refresh();
  } catch {
    starting = false;
    renderButton();
    show("Não foi possível iniciar. Atualize a página do portal e tente novamente.", true);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[pickerAboveKey]) {
    pickerAbove = changes[pickerAboveKey].newValue === true;
    pickerAboveChoice.checked = pickerAbove;
    positionSavedPicker();
  }
  if (area === "local" && changes[savedCnpjsKey]) {
    savedCnpjs = cleanSavedCnpjs(changes[savedCnpjsKey].newValue);
    renderSavedCnpjs();
    return;
  }
  if (area !== "session" || initializing) return;
  if (draftKey && changes[draftKey] && !changes[draftKey].newValue) {
    for (const field of [input, description, amount]) field.value = "";
    setSuspension("no");
    showAmountHint();
    renderButton();
  } else if (draftKey && changes[draftKey]?.newValue && !busy && !starting) {
    // O painel lateral e a guia expandida editam o mesmo rascunho.
    // Só substitui valores diferentes para preservar o cursor ao digitar.
    const draft = changes[draftKey].newValue;
    const cnpj = mask(digits(draft.cnpj || ""));
    if (input.value !== cnpj) input.value = cnpj;
    if (description.value !== (draft.description || "")) description.value = draft.description || "";
    if (amount.value !== (draft.amount || "")) amount.value = draft.amount || "";
    setSuspension(draft.suspension === "yes" ? "yes" : "no");
    showAmountHint();
    renderButton();
  }
  if (changes["nfseFlow:" + tab?.id]) refresh().catch(() => {});
});
chrome.tabs.onActivated.addListener(() => refresh().catch(() => {}));
chrome.tabs.onUpdated.addListener((id) => { if (id === tab?.id || (expandedView && !tab && boundSourceTab === null)) refresh().catch(() => {}); });
chrome.tabs.onRemoved.addListener((id) => {
  if (id !== tab?.id) return;
  tab = null;
  busy = starting = false;
  renderButton();
  show("A guia do portal foi fechada. Abra a extensão pela guia que deseja usar.");
});
initialize().catch(() => show("Não foi possível localizar o portal.", true));
