import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../server/index.js';
function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('server/schema.sql','utf8').replace(/^\uFEFF/,''));
 const prepare=sql=>({bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return sqlite.prepare(sql).run(...args);}};}});
 return {sqlite,prepare};
}
test('Desligamento autenticado: imediato, idempotência, cancelamento e bloqueio cruzado com notas',async()=>{
 const DB=database();
 async function call(path,token,data){const r=await worker.fetch(new Request('https://test.local'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})}),{DB});return {status:r.status,data:await r.json()};}
 const pc=(await call('/api/register',null,{name:'PC power teste'})).data,mobile=(await call('/api/pair',null,{code:pc.pairCode})).data;
 const id=crypto.randomUUID(),invoice={cnpj:'1'.repeat(14),description:'Teste sem portal',amount:'1,00',issqnSuspended:false};
 assert.equal((await call('/api/power/shutdown',null,{id})).status,401);
 assert.equal((await call('/api/power/shutdown',mobile.mobileToken,{id})).status,409);
 await call('/api/pc/poll',pc.pcToken,{ready:false});
 await call('/api/pc/power',pc.pcToken,{});
 const jobId=crypto.randomUUID();await call('/api/jobs',mobile.mobileToken,{requestId:jobId,invoice});
 assert.equal((await call('/api/power/shutdown',mobile.mobileToken,{id})).status,409);
 await call('/api/jobs/cancel',mobile.mobileToken,{id:jobId});
 assert.equal((await call('/api/power/shutdown',mobile.mobileToken,{id})).status,201);
 assert.equal((await call('/api/power/shutdown',mobile.mobileToken,{id})).status,200);
 assert.equal((await call('/api/jobs',mobile.mobileToken,{requestId:crypto.randomUUID(),invoice})).status,409);
 assert.equal((await call('/api/pc/power',pc.pcToken,{})).data.command.id,id);
 const before=Date.now();await call('/api/pc/power/ack',pc.pcToken,{id,state:'scheduled'});
 const status=(await call('/api/power',mobile.mobileToken)).data;assert(status.command.deadline>=before&&status.command.deadline<=Date.now());
 await call('/api/power/cancel',mobile.mobileToken,{id});
 DB.sqlite.prepare('UPDATE power_commands SET deadline=? WHERE id=?').run(Date.now()-1,id);
 assert.equal((await call('/api/pc/power/commit',pc.pcToken,{id})).data.allowed,false,'Parada confirmada não executa');
 const second=crypto.randomUUID();await call('/api/power/shutdown',mobile.mobileToken,{id:second});await call('/api/pc/power/ack',pc.pcToken,{id:second,state:'scheduled'});
 DB.sqlite.prepare('UPDATE power_commands SET deadline=? WHERE id=?').run(Date.now()-1,second);
 assert.equal((await call('/api/pc/power/commit',pc.pcToken,{id:second})).data.allowed,true);
 assert.equal((await call('/api/pc/power/commit',pc.pcToken,{id:second})).data.allowed,false,'Só autoriza uma vez');
 assert.equal((await call('/api/power/cancel',mobile.mobileToken,{id:second})).status,409);
 DB.sqlite.prepare('UPDATE power_commands SET expires=0').run();
 assert.equal((await call('/api/jobs',mobile.mobileToken,{requestId:crypto.randomUUID(),invoice})).status,201);
});
test('Mobile pede confirmação, envia só uma solicitação e permite cancelar a contagem',async()=>{
 const elements={},calls=[];let command=null,confirmed=false;
 const element=id=>elements[id]||={hidden:false,disabled:false,textContent:''};
 const context={window:{},document:{hidden:false},pairing:{name:'PC teste'},online:true,busy:false,crypto,Date,setInterval:()=>1,$:element,confirm:()=>confirmed,feedback(){},
  async api(path,options){calls.push(path);if(path==='/api/power/shutdown'){const id=JSON.parse(options.body).id;command={id,state:'scheduled',deadline:Date.now(),expires:Date.now()+120000};}if(path==='/api/power/cancel')command={...command,state:'cancelled',message:'Cancelado'};return {ready:true,command};}};
 vm.runInNewContext(fs.readFileSync('web/power.js','utf8'),context);await new Promise(setImmediate);
 await element('power-shutdown').onclick();assert.equal(calls.filter(p=>p==='/api/power/shutdown').length,0);
 confirmed=true;await element('power-shutdown').onclick();assert.equal(calls.filter(p=>p==='/api/power/shutdown').length,1);assert.match(element('power-status').textContent,/imediato/);assert.equal(element('power-cancel').hidden,false);
 await element('power-shutdown').onclick();assert.equal(calls.filter(p=>p==='/api/power/shutdown').length,1);
 await element('power-cancel').onclick();assert.equal(element('power-cancel').hidden,true);assert.equal(element('power-shutdown').disabled,false);
 context.busy=true;context.window.nfsePower.render();assert.equal(element('power-shutdown').disabled,true);
});

