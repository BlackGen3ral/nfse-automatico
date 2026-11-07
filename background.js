const key = (id) => "nfseFlow:" + id;
const draftKey = (id) => "nfsePopupDraft:" + id;
const queues = new Map();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const id = sender.tab?.id;
  if (id == null || !["nfse:status", "nfse:update", "nfse:claim", "nfse:claim-values", "nfse:recover"].includes(message.type)) return;
  const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
    const storageKey = key(id);
    const stored = (await chrome.storage.session.get(storageKey))[storageKey];
    if (message.type === "nfse:status") return stored;
    if (message.type === "nfse:recover") {
      const url = new URL(sender.url);
      const step = /\/DPS\/Tributacao(?:\/|$)/i.test(url.pathname) ? "values" : /\/DPS\/Servi(?:c|ç|%c3%a7)o(?:\/|$)/i.test(url.pathname) ? "service" : null;
      const draft = url.searchParams.get("idr");
      if (!step || !draft || stored?.phase !== step || stored.visualDraft !== draft || stored.invoiceDraft !== draft ||
          !stored.invoice || !Number.isFinite(stored.until) || stored.until <= Date.now() || (stored.recoveries || 0) >= 2) return null;
      const recovered = { ...stored, recovered: true, recoveries: (stored.recoveries || 0) + 1, until: Date.now() + 120000 };
      await chrome.storage.session.set({ [storageKey]: recovered });
      return recovered;
    }
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
      : { ...message.state, recoveries: message.state?.phase !== "people" && stored?.visualDraft === message.state?.visualDraft ? (stored?.recoveries || 0) : 0 };
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

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error("Não foi possível configurar o painel NFS-e", error));
