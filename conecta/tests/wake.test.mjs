import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../server/index.js';
import {validateWakeConfig} from '../server/wake.js';
function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('server/schema.sql','utf8').replace(/^\uFEFF/,''));
 function prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}};}
 return {sqlite,prepare,async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
const invoice={cnpj:'1'.repeat(14),description:'Teste de fila ao iniciar',amount:'1,00',issqnSuspended:false};
const config={enabled:true,autoStart:true,mac:'02:11:22:33:44:55',broadcast:'192.168.100.255',adapter:'Ethernet de teste'};
test('Fila de inicialização: autenticada, cancelável e entregue uma vez quando o PC conecta',async()=>{
 const DB=database(),env={DB};
 async function call(path,token,data){const response=await worker.fetch(new Request('https://test.local'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);return {status:response.status,data:await response.json()};}
 const pc=(await call('/api/register',null,{name:'PC wake teste'})).data;
 const mobile=(await call('/api/pair',null,{code:pc.pairCode})).data;
 const id=crypto.randomUUID();
 assert.equal((await call('/api/jobs',mobile.mobileToken,{requestId:id,invoice,waitForPc:true})).status,409,'Sem configuração não aceita espera');
 assert.equal((await call('/api/pc/wake-config',pc.pcToken,config)).status,200);
 assert.equal((await call('/api/wake','0'.repeat(64))).status,401);
 assert.equal((await call('/api/wake',mobile.mobileToken)).data.config.mac,config.mac);
 assert.equal((await call('/api/pc/wake-config',pc.pcToken,{...config,broadcast:'8.8.8.8'})).status,400);
 assert.equal((await call('/api/jobs',mobile.mobileToken,{requestId:id,invoice})).status,409,'Modo antigo exige PC online');
 assert.equal((await call('/api/jobs',mobile.mobileToken,{requestId:id,invoice,waitForPc:true})).status,201);
 assert.equal((await call('/api/jobs',mobile.mobileToken,{requestId:id,invoice,waitForPc:true})).status,200);
 let status=(await call('/api/status',mobile.mobileToken)).data;
 assert.equal(status.online,false);assert.equal(status.job.state,'queued');assert.match(status.job.message,/30 minutos/);
 const row=DB.sqlite.prepare('SELECT * FROM jobs WHERE id=?').get(id);assert(row.expires-row.created===1800000);
 assert.equal((await call('/api/jobs/cancel',mobile.mobileToken,{id})).data.state,'cancelled');
 assert.equal((await call('/api/pc/poll',pc.pcToken,{parallel:true})).data.job,null);
 DB.sqlite.prepare('UPDATE devices SET last_seen=0').run();
 const batch={id:crypto.randomUUID(),notes:Array.from({length:5},()=>({id:crypto.randomUUID(),invoice})),waitForPc:true};
 assert.equal((await call('/api/batches',mobile.mobileToken,batch)).status,201);
 status=(await call('/api/batches/status?id='+batch.id,mobile.mobileToken)).data;
 assert.equal(status.jobs.length,5);assert(status.jobs.every(j=>j.state==='queued'));
 const claimed=await Promise.all(batch.notes.map(()=>call('/api/pc/poll',pc.pcToken,{parallel:true})));
 assert.equal(new Set(claimed.map(j=>j.data.job.id)).size,5);assert(claimed.every(j=>j.data.job.invoice.description===invoice.description));
 assert.equal((await call('/api/pc/poll',pc.pcToken,{parallel:true})).data.job,null);
});
test('Configuração WOL rejeita destino público, endereço multicast e MAC vazio',()=>{
 for(const bad of [{broadcast:'example.com'},{broadcast:'8.8.8.8'},{broadcast:'192.168.1.999'},{mac:'FF:FF:FF:FF:FF:FF'},{mac:'01:11:22:33:44:55'},{mac:'00:00:00:00:00:00'}])assert.throws(()=>validateWakeConfig({...config,...bad}));
 assert.deepEqual(validateWakeConfig(config),config);
});
test('Celular aguarda retorno do Android e distingue envio de PC conectado',async()=>{
 const elements={},listeners={},pendingTimers=new Map();let nativeRequest,sequence=0;const calls=[];
 const element=id=>elements[id]||=( {hidden:false,disabled:false,checked:false,textContent:'',addEventListener(type,fn){this[type]=fn;}} );
 const pairing={mobileToken:'a'.repeat(64)};
 const context={window:{addEventListener:(name,fn)=>listeners[name]=fn,NfseAndroid:{wakeSupported:()=>true,wakeComputer:input=>{nativeRequest=JSON.parse(input);calls.push(nativeRequest);}}},pairing,online:false,busy:false,$:element,crypto,
  render(){context.window.nfseWake?.render();},feedback:message=>calls.push(message),api:async()=>({config,online:false}),setTimeout(fn){const id=++sequence;pendingTimers.set(id,fn);return id;},clearTimeout:id=>pendingTimers.delete(id)};
 vm.runInNewContext(fs.readFileSync('web/wake.js','utf8'),context);await new Promise(setImmediate);
 element('wake-before-submit').checked=true;assert.equal(context.window.nfseWake.canSubmit,true);
 let settled=false;const prepare=context.window.nfseWake.prepare().then(wait=>{settled=true;return wait;});await new Promise(setImmediate);
 assert.equal(settled,false);assert.equal(nativeRequest.mac,config.mac);assert.equal(nativeRequest.broadcast,config.broadcast);
 listeners['nfse-wake-result']({detail:{id:nativeRequest.id,ok:true,message:'Comando enviado; aguardando PC'}});assert.equal(await prepare,true);assert.equal(context.online,false);
 const retry=context.window.nfseWake.prepare();await new Promise(setImmediate);listeners['nfse-wake-result']({detail:{id:nativeRequest.id,ok:false,message:'Wi-Fi diferente'}});await assert.rejects(retry,/Wi-Fi diferente/);
 assert.equal(pendingTimers.size,0);assert.equal(element('wake-pc').disabled,false);
});

