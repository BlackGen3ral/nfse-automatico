import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../server/index.js';

function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('server/schema.sql','utf8').replace(/^\uFEFF/,''));
 function prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}};}};}
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
const invoice=i=>({cnpj:String(i+1).repeat(14),description:'Teste lote '+i,amount:(i+1)+',00',issqnSuspended:false});
test('Lote de cinco: versão compatível, entrega isolada, reenvio idempotente e parada por nota',async()=>{
 const env={DB:database()};
 async function call(path,token,data){const response=await worker.fetch(new Request('https://test.local'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);return {status:response.status,data:await response.json()};}
 const pc=(await call('/api/register',null,{name:'PC lote'})).data;
 const mobile=(await call('/api/pair',null,{code:pc.pairCode})).data;
 await call('/api/pc/poll',pc.pcToken,{});
 const batch={id:crypto.randomUUID(),notes:Array.from({length:5},(_,i)=>({id:crypto.randomUUID(),invoice:invoice(i)}))};
 assert.equal((await call('/api/batches',mobile.mobileToken,batch)).status,409);
 await call('/api/pc/poll',pc.pcToken,{parallel:true,ready:false});
 assert.equal((await call('/api/batches',mobile.mobileToken,batch)).status,201);
 assert.equal((await call('/api/batches',mobile.mobileToken,batch)).status,200);
 assert.equal((await call('/api/pc/poll',pc.pcToken,{})).data.job,null,'PC antigo não recebe lote');
 assert.equal((await call('/api/pc/poll',pc.pcToken,{parallel:true,ready:false})).data.job,null,'Canal ocupado não retira nota');
 const results=await Promise.all(batch.notes.map(()=>call('/api/pc/poll',pc.pcToken,{parallel:true})));
 assert.equal(new Set(results.map(r=>r.data.job.id)).size,5);
 for(const {data:{job}} of results){assert.equal(job.batchId,batch.id);assert.deepEqual(job.invoice,batch.notes.find(n=>n.id===job.id).invoice);}
 assert.equal((await call('/api/pc/poll',pc.pcToken,{parallel:true})).data.job,null);
 const id=batch.notes[2].id;
 assert.equal((await call('/api/jobs/cancel',mobile.mobileToken,{id})).status,200);
 assert.equal((await call('/api/pc/poll',pc.pcToken,{parallel:true,ready:false,jobId:batch.notes[0].id})).data.cancelJobId,null);
 assert.equal((await call('/api/pc/poll',pc.pcToken,{parallel:true,ready:false,jobId:id})).data.cancelJobId,id);
 await call('/api/pc/progress',pc.pcToken,{id,state:'review',message:'Tarde demais'});
 await call('/api/pc/progress',pc.pcToken,{id,state:'cancelled',message:'Parou'});
 for(const note of batch.notes.filter(n=>n.id!==id))await call('/api/pc/progress',pc.pcToken,{id:note.id,state:'review',message:'Revisão manual'});
 const status=(await call('/api/batches/status?id='+batch.id,mobile.mobileToken)).data;
 assert.equal(status.jobs.length,5);assert.equal(status.jobs.filter(j=>j.state==='review').length,4);assert.equal(status.jobs.find(j=>j.id===id).state,'cancelled');
 const other=(await call('/api/register',null,{name:'Outro PC'})).data;const otherMobile=(await call('/api/pair',null,{code:other.pairCode})).data;
 assert.equal((await call('/api/batches/status?id='+batch.id,otherMobile.mobileToken)).data.jobs.length,0);
 assert.equal((await call('/api/batches',mobile.mobileToken,{...batch,id:crypto.randomUUID(),notes:[...batch.notes,{id:crypto.randomUUID(),invoice:invoice(0)}]})).status,400);
 const invalid={id:crypto.randomUUID(),notes:[{id:crypto.randomUUID(),invoice:invoice(0)},{id:crypto.randomUUID(),invoice:{...invoice(1),amount:'0,00'}}]};
 assert.equal((await call('/api/batches',mobile.mobileToken,invalid)).status,400);
 assert.equal((await call('/api/batches/status?id='+invalid.id,mobile.mobileToken)).data.jobs.length,0);
});

test('Uma consulta atende cinco canais, cancelamentos e energia sem duplicar notas',async()=>{
 const env={DB:database()};
 async function call(path,token,data){
  const response=await worker.fetch(new Request('https://test.local'+path,{
   method:data?'POST':'GET',
   headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
   ...(data?{body:JSON.stringify(data)}:{})
  }),env);
  return {status:response.status,data:await response.json()};
 }
 const pc=(await call('/api/register',null,{name:'PC consulta única'})).data;
 const mobile=(await call('/api/pair',null,{code:pc.pairCode})).data;
 const poll=(slots,activeIds=[])=>call('/api/pc/poll',pc.pcToken,{slots,activeIds,ready:false});
 assert.equal((await poll(6)).status,400);
 const idle=await poll(5);
 assert.equal(idle.status,200);
 assert.deepEqual(idle.data.jobs,[]);
 assert.equal(idle.data.power.command,null);
 const batch={id:crypto.randomUUID(),notes:Array.from({length:5},(_,i)=>({id:crypto.randomUUID(),invoice:invoice(i)}))};
 assert.equal((await call('/api/batches',mobile.mobileToken,batch)).status,201);
 const results=await Promise.all([poll(5),poll(5)]);
 assert.deepEqual(results.map(result=>result.data.jobs.length).sort(),[0,5]);
 const jobs=results.flatMap(result=>result.data.jobs);
 assert.deepEqual(new Set(jobs.map(job=>job.id)),new Set(batch.notes.map(note=>note.id)));
 assert.equal((await call('/api/power/shutdown',mobile.mobileToken,{id:crypto.randomUUID()})).status,409);
 const [first,second]=jobs;
 for(const job of [first,second])assert.equal((await call('/api/jobs/cancel',mobile.mobileToken,{id:job.id})).status,200);
 const active=await poll(0,jobs.map(job=>job.id));
 assert.deepEqual(new Set(active.data.cancelJobIds),new Set([first.id,second.id]));
 for(const job of jobs)await call('/api/pc/progress',pc.pcToken,{
  id:job.id,state:active.data.cancelJobIds.includes(job.id)?'cancelled':'review',message:'Teste'
 });
 const powerId=crypto.randomUUID();
 assert.equal((await call('/api/power/shutdown',mobile.mobileToken,{id:powerId})).status,201);
 const power=await poll(5);
 assert.equal(power.data.power.command.id,powerId);
 assert.equal(power.data.power.command.state,'queued');
 assert.deepEqual(power.data.jobs,[]);
});

test('Cinco guias mantêm seus canais, dados e revisão separados; guia alheia não recebe lote',async()=>{
 const listeners=[],local={},session={},starts=[],requests=[];
 const storage=store=>({get:async key=>({[key]:store[key]}),set:async values=>Object.assign(store,values),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete store[k];}});
 const jobs=Array.from({length:5},(_,i)=>({id:crypto.randomUUID(),batchId:crypto.randomUUID(),expires:Date.now()+60000,invoice:invoice(i)}));
 const chrome={runtime:{onMessage:{addListener:f=>listeners.push(f)}},storage:{local:storage(local),session:storage(session)},tabs:{onRemoved:{addListener(){}},sendMessage:async(id,message)=>{starts.push({id,message});return {ok:true,stopped:true};}},sidePanel:{setPanelBehavior:async()=>{}}};
 const fetch=async(url,options)=>{const port=new URL(url).port,i=Number(port)-17846;assert.equal(options.headers['X-NFSe-Parallel'],'1');requests.push({port,path:new URL(url).pathname,data:options.body?JSON.parse(options.body):null});return {ok:true,json:async()=>url.endsWith('/job')?{job:jobs[i],command:'open-invoice'}:url.endsWith('/control')?{jobId:jobs[i].id,cancelledJobId:''}:{ok:true}};};
 vm.runInNewContext(fs.readFileSync(fs.existsSync('../background.js')?'../background.js':'../nfse-git/background.js','utf8'),{chrome,URL,fetch,AbortSignal});
 const send=(id,type,extra={},review=false,draft='draft-'+id)=>new Promise((resolve,reject)=>{let handled=false;for(const listener of listeners)if(listener({type,...extra},{tab:{id},url:'https://www.nfse.gov.br/EmissorNacional/DPS/'+(review?'EmitirNFSe':'Pessoas')+'?idr='+draft},resolve))handled=true;if(!handled)reject(Error(type));});
 await Promise.all(jobs.map((_,i)=>send(i+20,'nfse:portal-entry',{bridgeKey:'a'.repeat(64),bridgePort:17846+i})));
 assert.equal((await send(99,'nfse:connect-pc')).notAssigned,true);
 await Promise.all(jobs.map((_,i)=>send(i+20,'nfse:connect-pc')));
 assert.equal(starts.filter(s=>s.message.type==='nfse:start').length,5);
 for(let i=0;i<5;i++){const start=starts.find(s=>s.id===i+20);assert.equal(start.message.invoice.description,invoice(i).description);assert.equal(start.message.jobId,jobs[i].id);}
 await Promise.all(jobs.map((_,i)=>send(i+20,'nfse:connect-pc')));assert.equal(starts.length,5,'Repetição não inicia nota outra vez');
 for(let i=0;i<5;i++){
  await send(i+20,'nfse:update',{state:{phase:'review',visualDraft:'draft-'+(i+20),until:Date.now()+60000,reviewReport:{summary:'Conferir manualmente'}}});
  assert.equal((await send(i+20,'nfse:remote-result',{},true)).ok,true);
  assert(requests.some(r=>r.port===String(17846+i)&&r.data?.id===jobs[i].id&&r.data.phase==='review-ready'));
 }
 session['nfseFlow:20']={phase:'waiting',until:Date.now()+60000,invoiceDraft:'shared'};session['nfseFlow:21']={phase:'waiting',until:Date.now()+60000,invoiceDraft:'shared'};
 const claim=(id)=>new Promise(resolve=>{for(const listener of listeners)listener({type:'nfse:claim'},{tab:{id},url:'https://www.nfse.gov.br/EmissorNacional/DPS/Servico?idr=shared'},resolve);});
 const claimed=await Promise.all([claim(20),claim(21)]);assert.equal(claimed.filter(Boolean).length,1);assert.equal(session['nfseFlow:21'].phase,'error');
 assert(starts.every(s=>s.message.type==='nfse:start'),'Ponte apenas inicia preenchimento; não envia comando de emissão');
});
