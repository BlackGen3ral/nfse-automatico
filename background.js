(() => {
 const site='https://nfse-conecta.pages.dev';
 if(!chrome.tabs){
  if(location.origin!==site||location.pathname!=='/diagnosticos')return;
  window.addEventListener('message',async event=>{if(event.source!==window||event.origin!==site||event.data?.type!=='nfse:diagnostics-connect'||!/^[a-f0-9]{64}$/.test(event.data.token||''))return;try{const result=await chrome.runtime.sendMessage({type:'nfse:diagnostics-connect',token:event.data.token});window.postMessage({type:'nfse:diagnostics-connected',ok:!!result?.ok},site);}catch{window.postMessage({type:'nfse:diagnostics-connected',ok:false},site);}});return;
 }
 const fields=['DataCompetencia','btnAvancar','ServicoPrestado_Descricao','ServicoPrestado_CodigoTributacaoNacional','ServicoPrestado_CodigoNBS','ServicoPrestado_CodigoIndOp','Valores_ValorServico','ValorTributos_CodigoSituacaoTributaria','ValorTributos_CodigoClassificacaoTributaria'];
 const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
 let queueTask=Promise.resolve(),sending=false;
 async function flush(){if(sending)return;sending=true;try{const data=await chrome.storage.local.get(['nfseDiagnosticsToken','nfseDiagnosticsQueue']);if(!data.nfseDiagnosticsToken)return;for(const report of (data.nfseDiagnosticsQueue||[]).slice(0,5)){const response=await fetch(site+'/api/diagnostics/report',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+data.nfseDiagnosticsToken},body:JSON.stringify(report),signal:AbortSignal.timeout(5000)});if(!response.ok)break;await (queueTask=queueTask.catch(()=>{}).then(async()=>{const latest=await chrome.storage.local.get('nfseDiagnosticsQueue');await chrome.storage.local.set({nfseDiagnosticsQueue:(latest.nfseDiagnosticsQueue||[]).filter(item=>item.fingerprint!==report.fingerprint||item.reason!==report.reason||item.stage!==report.stage)});}));}}catch{}finally{sending=false;}}
 chrome.alarms?.create('nfse-diagnostics',{periodInMinutes:1});
 chrome.alarms?.onAlarm.addListener(alarm=>{if(alarm.name==='nfse-diagnostics')return flush();});
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message.type==='nfse:diagnostics-connect'){
   if(sender.url?.split(/[?#]/)[0]!==site+'/diagnosticos'||!/^[a-f0-9]{64}$/.test(message.token||'')){respond({ok:false});return;}
   chrome.storage.local.set({nfseDiagnosticsToken:message.token}).then(()=>respond({ok:true}),()=>respond({ok:false}));return true;
  }
  if(message.type!=='nfse:diagnostics-snapshot')return;
  if(!/^https:\/\/www\.nfse\.gov\.br\/EmissorNacional\/DPS\//.test(sender.url||'')||!['people','service','values'].includes(message.stage))return;
  const snapshot=message.fields;
  if(!Array.isArray(snapshot)||snapshot.length>500||snapshot.some(f=>!/^[a-f0-9]{64}$/.test(f.key)||!['text','number','date','radio','checkbox','select-one','select-multiple','textarea','other'].includes(f.type)||typeof f.required!=='boolean')||!Array.isArray(message.missing)||message.missing.some(id=>!fields.includes(id)))return;
  const task=queueTask.catch(()=>{}).then(async()=>{
   const key='nfseDiagnosticBaseline:'+message.stage,stored=await chrome.storage.local.get([key,'nfseDiagnosticsQueue','nfseDiagnosticSeen']);
   const previous=stored[key],added=previous?snapshot.filter(f=>!previous.some(old=>old.key===f.key&&old.type===f.type&&old.required===f.required)):[],removed=previous?previous.filter(f=>!snapshot.some(next=>next.key===f.key&&next.type===f.type&&next.required===f.required)):[];
   const report={stage:message.stage,reason:message.success?(added.length||removed.length?'layout-change':null):message.missing.length?'missing-field':'step-error',version:chrome.runtime.getManifest().version,missing:message.missing,added:added.length,removed:removed.length,requiredAdded:added.filter(f=>f.required).length,fingerprint:await digest(JSON.stringify(snapshot))};
   if(report.reason){const identity=await digest(JSON.stringify(report)),seen=stored.nfseDiagnosticSeen||{};if(!seen[identity]||Date.now()-seen[identity]>86400000){seen[identity]=Date.now();const entries=Object.entries(seen).sort((a,b)=>b[1]-a[1]).slice(0,100);await chrome.storage.local.set({nfseDiagnosticsQueue:[...(stored.nfseDiagnosticsQueue||[]),report].slice(-100),nfseDiagnosticSeen:Object.fromEntries(entries)});}}
   if(message.success)await chrome.storage.local.set({[key]:snapshot});return{ok:true};
  });queueTask=task;task.then(respond,()=>respond({ok:false}));return true;
 });
})();

const key = (id) => "nfseFlow:" + id;
const draftKey = (id) => "nfsePopupDraft:" + id;
const queues = new Map();
let draftQueue = Promise.resolve();
function reserveRemoteDraft(tabId, draft) {
  const task = draftQueue.catch(() => {}).then(async () => {
    const storageKey = "nfseDraftOwner:" + draft;
    const owner = (await chrome.storage.session.get(storageKey))[storageKey];
    if (owner && owner.tabId !== tabId && owner.until > Date.now()) return false;
    await chrome.storage.session.set({[storageKey]:{tabId,until:Date.now()+1800000}});
    return true;
  });
  draftQueue = task;
  return task;
}
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
    if (isClaim && remote && !await reserveRemoteDraft(id,new URL(sender.url).searchParams.get("idr"))) {
      const text = "O portal abriu o mesmo rascunho em duas guias. Esta nota foi pausada para preservar os dados. Confira as guias antes de tentar novamente.";
      await chrome.storage.session.set({[storageKey]:{...stored,phase:"error",visualDraft:new URL(sender.url).searchParams.get("idr"),text,until:Date.now()+1800000}});
      await remoteProgress(id,"error",text).catch(()=>{});
      return null;
    }
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
  if (remote && nfseBridgeKey) await localRequest("/closed",nfseBridgeKey,{id:remote.jobId},id).catch(()=>{});
  await remoteProgress(id,"error","A guia do portal foi fechada. Confira o PC antes de enviar outra solicitação.").catch(()=>{});
  await chrome.storage.session.remove([key(id), draftKey(id), "nfseRemote:" + id, "nfseTabPort:"+id, "nfseTabJob:"+id]);
  const owner = (await chrome.storage.session.get("nfsePortalOwner")).nfsePortalOwner;
  if (owner?.tabId === id) await chrome.storage.session.remove("nfsePortalOwner");
  await chrome.storage.session.remove("nfsePortal:" + id);
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error("Não foi possível configurar o painel NFS-e", error));

const remoteInFlight = new Set();
const extraTabKey = (id) => "nfseExtraTab:" + id;
async function editTab(action) {
  for (let attempt=0;;attempt++) {
    try { return await action(); }
    catch (error) {
      if (attempt>=2 || !/tabs cannot be edited|dragging a tab/i.test(error?.message || "")) throw error;
      await new Promise(resolve=>setTimeout(resolve,120));
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== "nfse:expand-panel") return;
  const ownPanel = sender.id === chrome.runtime.id && (sender.url
    ? sender.url.split(/[?#]/)[0] === chrome.runtime.getURL("popup.html") : !sender.tab);
  if (!ownPanel) { respond({ok:false,error:"Reabra o painel da extensão para expandi-lo."}); return; }
  const task = (async () => {
    const url = new URL(chrome.runtime.getURL("popup.html"));
    url.searchParams.set("expanded","1");
    if (Number.isInteger(message.sourceTabId) && message.sourceTabId >= 0) {
      const source = await chrome.tabs.get(message.sourceTabId).catch(()=>null);
      if (/^https:\/\/www\.nfse\.gov\.br\/EmissorNacional(?:[/?#]|$)/i.test(source?.url || "")) {
        url.searchParams.set("sourceTab",String(source.id));
      }
    }
    const tab = await editTab(()=>chrome.tabs.create({url:url.href,active:true}));
    return {ok:true,tabId:tab.id};
  })();
  task.then(respond,error=>respond({ok:false,error:"Não consegui expandir o painel. " + String(error?.message || "Reabra o navegador e tente novamente.").slice(0,180)}));
  return true;
});
chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove(extraTabKey(id)).catch(()=>{}));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== "nfse:portal-entry" || sender.tab?.id == null) return;
  const url = new URL(sender.url);
  if (url.origin !== "https://www.nfse.gov.br" ||
      !/^\/EmissorNacional(?:\/|$)/i.test(url.pathname)) return;
  const task = (async () => {
    const extra = (await chrome.storage.session.get(extraTabKey(sender.tab.id)))[extraTabKey(sender.tab.id)];
    if (extra) {
      if (/^\/EmissorNacional\/DPS\/Pessoas\/?$/i.test(url.pathname) && !extra.completed) {
        await chrome.storage.session.set({[extraTabKey(sender.tab.id)]:{...extra,completed:true}});
        return {active:false,local:true};
      }
      return {active:!extra.completed && extra.until>Date.now(),command:!extra.completed && extra.until>Date.now()?"open-invoice":null,local:true};
    }
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
      await chrome.storage.session.set({["nfseTabPort:"+sender.tab.id]:port});
    }
    const control = await localRequest("/job", bridgeKey,undefined,sender.tab.id);
    const job = control.job;
    if(message.bridgeKey && job?.batchId)await chrome.storage.session.set({["nfseTabJob:"+sender.tab.id]:job.id});
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
async function localRequest(path, token, data, tabId) {
  const {nfseBridgePort} = await chrome.storage.local.get("nfseBridgePort");
  const scoped=tabId==null?null:(await chrome.storage.session.get("nfseTabPort:"+tabId))["nfseTabPort:"+tabId];
  const bridgePort=Number.isInteger(scoped)&&scoped>=17846&&scoped<=17861?scoped:nfseBridgePort;
  const port = Number.isInteger(bridgePort) && bridgePort >= 17846 && bridgePort <= 17861 ? bridgePort : 17846;
  const response = await fetch("http://127.0.0.1:" + port + path, {
    method: data ? "POST" : "GET",
    headers: { "X-NFSe-Parallel":"1", authorization: "Bearer " + token, ...(data ? {"content-type":"application/json"} : {}) },
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
  const result = await localRequest("/progress", nfseBridgeKey, {id:remote.jobId,phase,text},tabId);
  if (result.cancelled) await chrome.tabs.sendMessage(tabId,{type:"nfse:stop",jobId:remote.jobId}).catch(()=>{});
  if (phase === "error" || phase === "review-ready") await chrome.storage.session.set({[remoteTerminalKey(tabId,remote.jobId)]:true});
}
async function remoteControl(tabId) {
  const storageKey = "nfseRemote:" + tabId;
  const remote = (await chrome.storage.session.get(storageKey))[storageKey];
  if (!remote) return {active:false};
  const {nfseBridgeKey} = await chrome.storage.local.get("nfseBridgeKey");
  const control = await localRequest("/control",nfseBridgeKey,undefined,tabId);
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
    await localRequest("/cancel-ack",nfseBridgeKey,{id:remote.jobId},tabId);
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
  if ((await chrome.storage.session.get(extraTabKey(sender.tab.id)))[extraTabKey(sender.tab.id)]) return {ok:true,connected:false,local:true};
  const bridgeKey = message.bridgeKey || (await chrome.storage.local.get("nfseBridgeKey")).nfseBridgeKey;
  if (!/^[a-f0-9]{64}$/.test(bridgeKey)) return {ok:true,connected:false};
  await chrome.storage.local.set({nfseBridgeKey:bridgeKey});
  const response = await localRequest("/job", bridgeKey,undefined,sender.tab.id);
  await localRequest("/opened",bridgeKey,{},sender.tab.id);
  const job = response.job;
  if (!job) return {ok:true,connected:true};
  if(job.batchId && (await chrome.storage.session.get("nfseTabJob:"+sender.tab.id))["nfseTabJob:"+sender.tab.id]!==job.id)return {ok:true,connected:true,notAssigned:true};
  if (!/^[a-f0-9-]{36}$/.test(job.id) || job.expires <= Date.now() || remoteInFlight.has(job.id)) return {ok:false};
  const ledger = "nfseRemoteJob:" + job.id;
  if ((await chrome.storage.session.get(ledger))[ledger]) return {ok:true,alreadyStarted:true};
  remoteInFlight.add(job.id);
  try {
    await chrome.storage.session.set({[ledger]:true,["nfseRemote:"+sender.tab.id]:{jobId:job.id}});
    const ack = await localRequest("/ack", bridgeKey, {id:job.id},sender.tab.id);
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
    await remoteProgress(sender.tab.id,state.reviewReport?.changed?"error":"review-ready",state.reviewReport?.summary || "A nota chegou à revisão. Confira os dados e emita manualmente no PC.");
    return {ok:true};
  })();
  task.then(respond,()=>respond(message.type==="nfse:remote-control"?{active:true,unavailable:true}:{ok:false,error:"Abra o programa NFS-e Conecta no PC e tente conectar novamente."}));
  return true;
});
