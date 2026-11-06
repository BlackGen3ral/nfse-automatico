const key = (id) => "nfseFlow:" + id;
const queues = new Map();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const id = sender.tab?.id;
  if (id == null || !["nfse:status", "nfse:update", "nfse:claim", "nfse:claim-values"].includes(message.type)) return;
  const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
    const storageKey = key(id);
    const stored = (await chrome.storage.session.get(storageKey))[storageKey];
    if (message.type === "nfse:status") return stored;
    if (message.type === "nfse:claim" && stored?.phase !== "waiting") return null;
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
    if (state) await chrome.storage.session.set({ [storageKey]: state });
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
  await chrome.storage.session.remove(key(id));
});
