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
