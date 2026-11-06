const key = (id) => "nfseFlow:" + id;
const queues = new Map();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const id = sender.tab?.id;
  if (id == null || !["nfse:status", "nfse:update", "nfse:claim"].includes(message.type)) return;
  const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
    const storageKey = key(id);
    const stored = (await chrome.storage.session.get(storageKey))[storageKey];
    if (message.type === "nfse:status") return stored;
    if (message.type === "nfse:claim" && stored?.phase !== "waiting") return null;
    const state = message.type === "nfse:claim"
      ? (Date.now() < stored.until ? { ...stored, phase: "service", until: Date.now() + 60000 } : null)
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
