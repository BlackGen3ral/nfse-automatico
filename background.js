const key = (id) => "nfseFlow:" + id;
const draftKey = (id) => "nfsePopupDraft:" + id;
const queues = new Map();
const remoteTerminalKey = (tabId, jobId) => "nfseRemoteTerminal:" + tabId + ":" + jobId;

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const id = sender.tab?.id;
  if (id == null || !["nfse:status", "nfse:update", "nfse:claim", "nfse:claim-values", "nfse:recover"].includes(message.type)) return;
  const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
    const storageKey = key(id);
    const stored = (await chrome.storage.session.get(storageKey))[storageKey];
    if (message.type === "nfse:status") return stored;
    const remote = (await chrome.storage.session.get("nfseRemote:" + id))["nfseRemote:" + id];
    if (remote?.cancelled) return null;
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
    if (message.type === "nfse:update" && state) await remoteProgress(id, state.phase, state.text).catch(() => {});
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
  const remote = (await chrome.storage.session.get("nfseRemote:" + id))["nfseRemote:" + id];
  const {nfseBridgeKey} = await chrome.storage.local.get("nfseBridgeKey");
  if (remote && nfseBridgeKey) await localRequest("/closed",nfseBridgeKey,{id:remote.jobId}).catch(()=>{});
  await remoteProgress(id,"error","A guia do portal foi fechada. Confira o PC antes de enviar outra solicitação.").catch(()=>{});
  await chrome.storage.session.remove([key(id), draftKey(id), "nfseRemote:" + id]);
  const owner = (await chrome.storage.session.get("nfsePortalOwner")).nfsePortalOwner;
  if (owner?.tabId === id) await chrome.storage.session.remove("nfsePortalOwner");
  await chrome.storage.session.remove("nfsePortal:" + id);
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error("Não foi possível configurar o painel NFS-e", error));

const remoteInFlight = new Set();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== "nfse:portal-entry" || sender.tab?.id == null) return;
  const url = new URL(sender.url);
  if (url.origin !== "https://www.nfse.gov.br" ||
      !/^\/EmissorNacional(?:\/|$)/i.test(url.pathname)) return;
  const task = (async () => {
    const key = "nfsePortal:" + sender.tab.id;
    const ownerKey = "nfsePortalOwner";
    let state = (await chrome.storage.session.get(key))[key];
    const owner = (await chrome.storage.session.get(ownerKey))[ownerKey];
    const bridgeKey = message.bridgeKey || (await chrome.storage.local.get("nfseBridgeKey")).nfseBridgeKey;
    if (!/^[a-f0-9]{64}$/.test(bridgeKey)) return {active:false};
    if (message.bridgeKey) {
      const port = message.bridgePort === undefined ? 17846 : message.bridgePort;
      if (!Number.isInteger(port) || port < 17846 || port > 17861) return {active:false};
      await chrome.storage.local.set({nfseBridgeKey:bridgeKey,nfseBridgePort:port});
    }
    const control = await localRequest("/job", bridgeKey);
    const job = control.job;
    const pending = job && /^[a-f0-9-]{36}$/.test(job.id) && Number.isFinite(job.expires) &&
      job.expires > Date.now() && control.cancelledJobId !== job.id &&
      !(await chrome.storage.session.get("nfseRemoteJob:" + job.id))["nfseRemoteJob:" + job.id];
    const openRequested = control.command === "open-invoice" && Number.isFinite(control.openUntil) && control.openUntil > Date.now();
    if (message.bridgeKey || (!state && (pending || openRequested) && (!owner || owner.until <= Date.now() || owner.tabId === sender.tab.id))) {
      state = {until:Math.min(job?.expires || Infinity, Date.now() + 9*60*1000)};
      await chrome.storage.session.set({[key]:state,[ownerKey]:{tabId:sender.tab.id,until:state.until}});
    }
    const active = !!state && state.until > Date.now() && (pending || openRequested || !control.cancelledJobId);
    return {active,command:active && (openRequested || pending && (control.command === "open-invoice" || control.command === undefined)) ? "open-invoice" : null};
  })();
  task.then(respond, () => respond({active:false,error:"Não consegui falar com o app do PC. Confira se ele está conectado e clique em Abrir Emissão Completa no Chrome."}));
  return true;
});
async function localRequest(path, token, data) {
  const {nfseBridgePort} = await chrome.storage.local.get("nfseBridgePort");
  const port = Number.isInteger(nfseBridgePort) && nfseBridgePort >= 17846 && nfseBridgePort <= 17861 ? nfseBridgePort : 17846;
  const response = await fetch("http://127.0.0.1:" + port + path, {
    method: data ? "POST" : "GET",
    headers: { authorization: "Bearer " + token, ...(data ? {"content-type":"application/json"} : {}) },
    ...(data ? {body:JSON.stringify(data)} : {}),
    signal: AbortSignal.timeout(5000), cache: "no-store"
  });
  if (!response.ok) throw new Error("Abra o NFS-e Conecta no PC para conectar.");
  return response.json();
}
async function remoteProgress(tabId, phase, text) {
  const storageKey = "nfseRemote:" + tabId;
  const remote = (await chrome.storage.session.get(storageKey))[storageKey];
  if (!remote || remote.cancelled) return;
  const {nfseBridgeKey} = await chrome.storage.local.get("nfseBridgeKey");
  if (!nfseBridgeKey) return;
  const result = await localRequest("/progress", nfseBridgeKey, {id:remote.jobId,phase,text});
  if (result.cancelled) await chrome.tabs.sendMessage(tabId,{type:"nfse:stop",jobId:remote.jobId}).catch(()=>{});
  if (phase === "error" || phase === "review-ready") await chrome.storage.session.set({[remoteTerminalKey(tabId,remote.jobId)]:true});
}
async function remoteControl(tabId) {
  const storageKey = "nfseRemote:" + tabId;
  const remote = (await chrome.storage.session.get(storageKey))[storageKey];
  if (!remote) return {active:false};
  const {nfseBridgeKey} = await chrome.storage.local.get("nfseBridgeKey");
  const control = await localRequest("/control",nfseBridgeKey);
  if (control.cancelledJobId === remote.jobId) {
    const reply = await chrome.tabs.sendMessage(tabId,{type:"nfse:stop",jobId:remote.jobId});
    if (!reply?.stopped) return {active:true};
    await queues.get(tabId)?.catch(()=>{});
    await chrome.storage.session.set({
      [key(tabId)]:{phase:"cancelled",until:0,text:"Preenchimento interrompido. Confira os dados já preenchidos no portal."},
      [storageKey]:{...remote,cancelled:true},
      ["nfseRemoteJob:" + remote.jobId]:"cancelled",
    });
    await chrome.storage.session.remove(["nfsePortal:" + tabId,"nfsePortalOwner"]);
    await localRequest("/cancel-ack",nfseBridgeKey,{id:remote.jobId});
    return {active:false,stopped:true};
  }
  if (remote.cancelled) {
    await chrome.tabs.sendMessage(tabId,{type:"nfse:stop",jobId:remote.jobId});
    return {active:false,stopped:true};
  }
  const terminal = (await chrome.storage.session.get(remoteTerminalKey(tabId,remote.jobId)))[remoteTerminalKey(tabId,remote.jobId)];
  if (terminal && !control.jobId) {
    await chrome.storage.session.remove(storageKey);
    return {active:false};
  }
  return {active:true,jobId:remote.jobId};
}
async function connectRemote(message, sender) {
  const url = new URL(sender.url);
  if (url.origin !== "https://www.nfse.gov.br" || !/^\/EmissorNacional\/DPS\/Pessoas(?:\/|$)/i.test(url.pathname)) throw new Error("Conexão inválida.");
  const bridgeKey = message.bridgeKey || (await chrome.storage.local.get("nfseBridgeKey")).nfseBridgeKey;
  if (!/^[a-f0-9]{64}$/.test(bridgeKey)) return {ok:true,connected:false};
  await chrome.storage.local.set({nfseBridgeKey:bridgeKey});
  const response = await localRequest("/job", bridgeKey);
  await localRequest("/opened",bridgeKey,{});
  const job = response.job;
  if (!job) return {ok:true,connected:true};
  if (!/^[a-f0-9-]{36}$/.test(job.id) || job.expires <= Date.now() || remoteInFlight.has(job.id)) return {ok:false};
  const ledger = "nfseRemoteJob:" + job.id;
  if ((await chrome.storage.session.get(ledger))[ledger]) return {ok:true,alreadyStarted:true};
  remoteInFlight.add(job.id);
  try {
    await chrome.storage.session.set({[ledger]:true,["nfseRemote:"+sender.tab.id]:{jobId:job.id}});
    const ack = await localRequest("/ack", bridgeKey, {id:job.id});
    if (ack.cancelled) { await remoteControl(sender.tab.id); return {ok:false,stopped:true}; }
    const reply = await chrome.tabs.sendMessage(sender.tab.id,{type:"nfse:start",cnpj:job.invoice?.cnpj,invoice:job.invoice,jobId:job.id});
    if (reply?.ok) await chrome.storage.session.remove(["nfsePortal:" + sender.tab.id, "nfsePortalOwner"]);
    if (!reply?.ok) await remoteProgress(sender.tab.id,"error",reply?.error || "Abra Pessoas no portal e confira a sessão antes de enviar outra solicitação.");
    return {ok:!!reply?.ok};
  } catch (error) {
    await remoteProgress(sender.tab.id,"error","Não foi possível iniciar o preenchimento. Confira a extensão e a sessão no portal.").catch(()=>{});
    throw error;
  } finally { remoteInFlight.delete(job.id); }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if (sender.tab?.id == null || !["nfse:connect-pc","nfse:remote-result","nfse:remote-control","nfse:manual-begin"].includes(message.type)) return;
  const url = new URL(sender.url);
  if (url.origin !== "https://www.nfse.gov.br" || !url.pathname.startsWith("/EmissorNacional/DPS/")) return;
  const task = message.type === "nfse:connect-pc" ? connectRemote(message,sender) :
    message.type === "nfse:remote-control" ? remoteControl(sender.tab.id) :
    message.type === "nfse:manual-begin" ? chrome.storage.session.remove("nfseRemote:" + sender.tab.id).then(()=>({ok:true})) : (async()=>{
    const state=(await chrome.storage.session.get(key(sender.tab.id)))[key(sender.tab.id)];
    const url=new URL(sender.url);
    if (url.origin!=="https://www.nfse.gov.br" || !url.pathname.startsWith("/EmissorNacional/DPS/") || /\/DPS\/(?:Pessoas|Servi(?:c|ç|%c3%a7)o|Tributacao)(?:\/|$)/i.test(url.pathname)) return {ok:false};
    const draft=url.searchParams.get("idr");
    if (state?.phase !== "review" || !draft || state.visualDraft !== draft || state.until <= Date.now()) return {ok:false};
    await remoteProgress(sender.tab.id,"review-ready","Deu tudo certo! A nota está pronta para conferir e emitir manualmente no PC.");
    return {ok:true};
  })();
  task.then(respond,()=>respond(message.type==="nfse:remote-control"?{active:true,unavailable:true}:{ok:false,error:"Abra o programa NFS-e Conecta no PC e tente conectar novamente."}));
  return true;
});
