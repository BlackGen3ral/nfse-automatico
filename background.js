const key = (id) => "nfseFlow:" + id;
const draftKey = (id) => "nfsePopupDraft:" + id;
const queues = new Map();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const id = sender.tab?.id;
  if (id == null || !["nfse:status", "nfse:update", "nfse:claim", "nfse:claim-values"].includes(message.type)) return;
  const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
    const storageKey = key(id);
    const stored = (await chrome.storage.session.get(storageKey))[storageKey];
    if (message.type === "nfse:status") return stored;
    if (message.type === "nfse:claim") {
      const url = new URL(sender.url);
      if (stored?.phase !== "waiting" || !/\/DPS\/Servi(?:c|ç|%c3%a7)o(?:\/|$)/i.test(url.pathname) ||
          (stored.invoiceDraft && url.searchParams.get("idr") !== stored.invoiceDraft)) return null;
    }
    const isValues = message.type === "nfse:claim-values";
    if (isValues) {
      const url = new URL(sender.url);
      if (stored?.phase !== "done" || !stored.valuesDraft ||
          url.searchParams.get("idr") !== stored.valuesDraft ||
          !/\/DPS\/Tributacao(?:\/|$)/i.test(url.pathname)) return null;
    }
    const isClaim = isValues || message.type === "nfse:claim";
    const state = isClaim
      ? (Date.now() < stored.until ? { ...stored, phase: isValues ? "values" : "service", until: Date.now() + 120000 } : null)
      : message.state;
    if (state) {
      await chrome.storage.session.set({ [storageKey]: state });
      if (message.type === "nfse:claim") await chrome.storage.session.remove(draftKey(id)).catch(() => {});
    }
    return state;
  });
  queues.set(id, task);
  task.then((result) => respond(result ?? null), () => respond(null)).finally(() => {
    if (queues.get(id) === task) queues.delete(id);
  });
  return true;
});
chrome.tabs.onRemoved.addListener(async (id) => {
  await queues.get(id)?.catch(() => {});
  await chrome.storage.session.remove([key(id), draftKey(id)]);
});

let panelQueue = Promise.resolve();
async function openPanel(tab) {
  if (tab?.id == null) return;
  const storageKey = "nfseWindow:" + tab.id;
  const url = chrome.runtime.getURL("popup.html") + "?tabId=" + tab.id;
  const existing = (await chrome.storage.session.get(storageKey))[storageKey];
  if (Number.isInteger(existing)) {
    try {
      const window = await chrome.windows.get(existing, {populate:true});
      if (window.tabs?.some((item) => item.url === url)) {
        await chrome.windows.update(existing, {focused:true, state:"normal"});
        return;
      }
    } catch {}
  }
  const window = await chrome.windows.create({url, type:"popup", focused:true, width:508, height:740});
  if (window?.id != null) await chrome.storage.session.set({[storageKey]:window.id});
}
chrome.action.onClicked.addListener((tab) => {
  panelQueue = panelQueue.catch(() => {}).then(() => openPanel(tab)).catch(() => {});
});
chrome.windows.onRemoved.addListener(async (id) => {
  const entries = await chrome.storage.session.get(null);
  const keys = Object.keys(entries).filter((key) => key.startsWith("nfseWindow:") && entries[key] === id);
  if (keys.length) await chrome.storage.session.remove(keys);
});
