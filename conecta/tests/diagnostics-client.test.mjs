import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('Coletor aprende a estrutura, enfileira só metadados e envia sem bloquear preenchimento',async()=>{
 const source=fs.readFileSync(fs.existsSync('../diagnostics-runtime.js')?'../diagnostics-runtime.js':'../nfse-git/diagnostics-runtime.js','utf8');const local={},listeners=[],requests=[];let alarm;
 const chrome={tabs:{},runtime:{getManifest:()=>({version:'0.7.0'}),onMessage:{addListener:fn=>listeners.push(fn)}},storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,local[key]])),set:async data=>Object.assign(local,data)}},alarms:{create(){},onAlarm:{addListener:fn=>alarm=fn}}};
 vm.runInNewContext(source,{chrome,crypto,TextEncoder,AbortSignal,fetch:async(url,options)=>{requests.push({url,report:JSON.parse(options.body)});return{ok:true};}});
 const send=(data,url='https://www.nfse.gov.br/EmissorNacional/DPS/Servico')=>new Promise(resolve=>{if(!listeners.some(listener=>listener(data,{url},resolve)))resolve(null);});
 const first={type:'nfse:diagnostics-snapshot',stage:'service',success:true,fields:[{key:'a'.repeat(64),type:'text',required:false}],missing:[]};await send(first);assert.equal(local.nfseDiagnosticsQueue,undefined);
 await send({...first,fields:[...first.fields,{key:'b'.repeat(64),type:'select-one',required:true}]});assert.equal(local.nfseDiagnosticsQueue.length,1);assert.equal(local.nfseDiagnosticsQueue[0].requiredAdded,1);assert.equal(requests.length,0);assert.equal('fields' in local.nfseDiagnosticsQueue[0],false);
 const token='c'.repeat(64);assert.equal((await send({type:'nfse:diagnostics-connect',token},'https://example.com')).ok,false);assert.equal((await send({type:'nfse:diagnostics-connect',token},'https://nfse-conecta.pages.dev/diagnosticos')).ok,true);
 await alarm({name:'nfse-diagnostics'});assert.equal(requests.length,1);assert.equal(local.nfseDiagnosticsQueue.length,0);assert.equal(requests[0].url,'https://nfse-conecta.pages.dev/api/diagnostics/report');
});
