import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

test('Expansão abre apenas a interface da extensão e mantém o vínculo e rascunho do portal',async()=>{
 const listeners=[],created=[];const popup='chrome-extension://test/popup.html';
 const session={'nfseFlow:5':{phase:'service',visualDraft:'original'},'nfsePopupDraft:5':{description:'Rascunho de teste'},nfsePortalOwner:{tabId:5}};
 const storage=store=>({get:async key=>({[key]:store[key]}),set:async value=>Object.assign(store,value),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete store[key];}});
 let nextId=10;
 const chrome={runtime:{id:'test',getURL:()=>popup,onMessage:{addListener:fn=>listeners.push(fn)}},storage:{session:storage(session),local:storage({})},sidePanel:{setPanelBehavior:async()=>{}},tabs:{onRemoved:{addListener(){}},get:async id=>{if(id===5)return{id,url:'https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas?idr=original'};if(id===6)return{id,url:'https://example.com'};throw Error('Closed tab');},create:async options=>{created.push(options);return{id:nextId++};},update:async()=>{throw Error('Não deve navegar o portal');}}};
 vm.runInNewContext(fs.readFileSync(fs.existsSync('../background.js')?'../background.js':'../nfse-git/background.js','utf8'),{chrome,URL,AbortSignal,setTimeout,fetch:async()=>{throw Error('Não deve consultar o app do PC');}});
 const send=(message,sender)=>new Promise(resolve=>{let handled=false;for(const listener of listeners)if(listener(message,sender,resolve))handled=true;if(!handled)resolve(null);});
 const before=JSON.stringify(session);
 assert.equal((await send({type:'nfse:expand-panel',sourceTabId:5},{id:'other',url:popup})).ok,false);
 assert.equal(created.length,0);
 const first=await send({type:'nfse:expand-panel',sourceTabId:5},{id:'test'});
 assert.equal(first.ok,true);assert.equal(first.tabId,10);
 const opened=new URL(created[0].url);assert.equal(opened.protocol,'chrome-extension:');assert.equal(opened.host,'test');assert.equal(opened.pathname,'/popup.html');assert.equal(opened.searchParams.get('expanded'),'1');assert.equal(opened.searchParams.get('sourceTab'),'5');assert.equal(created[0].active,true);
 assert.equal(JSON.stringify(session),before);
 const originalCreate=chrome.tabs.create;let attempts=0;chrome.tabs.create=async options=>{if(attempts++===0)throw Error('Tabs cannot be edited right now');return originalCreate(options);};
 assert.equal((await send({type:'nfse:expand-panel',sourceTabId:6},{id:'test',url:popup+'?expanded=1'})).ok,true);assert.equal(attempts,2);assert.equal(new URL(created[1].url).searchParams.has('sourceTab'),false);
 assert.equal((await send({type:'nfse:expand-panel',sourceTabId:99},{id:'test'})).ok,true);assert.equal(new URL(created[2].url).searchParams.has('sourceTab'),false);
 chrome.tabs.create=async()=>{throw Error('No current window');};const failed=await send({type:'nfse:expand-panel'},{id:'test'});assert.equal(failed.ok,false);assert.match(failed.error,/expandir o painel.*No current window/);
 assert.equal(created.every(options=>options.url.startsWith(popup+'?')),true);assert.equal(JSON.stringify(session),before);
});
