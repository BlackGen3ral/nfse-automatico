import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function engine(index=0) {
 const fields=new Map(),events=[];
 let now=0,seq=0,listener;
 const timers=new Map();
 const schedule=(fn,delay)=>{const id=++seq;timers.set(id,{fn,at:now+delay});return id;};
 class Option {constructor(value,text=value){this.value=value;this.textContent=text;}matches(){return false;}}
 class Select {
  constructor(id,value,options){Object.assign(this,{id,value,options,disabled:false,readOnly:false,labels:[],offsetWidth:1});}
  get selectedOptions(){return this.options.filter(o=>o.value===this.value);}
  hasAttribute(name){return name==='readonly'&&this.readOnly;}
  dispatchEvent(event){events.push({id:this.id,type:event.type,value:this.value,at:now});this.onEvent?.(event);return true;}
 }
 const situation=new Select('ValorTributos_CodigoSituacaoTributaria','', [new Option('','Selecione'),new Option('000','000 - Tributação integral')]);
 const classification=new Select('ValorTributos_CodigoClassificacaoTributaria','',[new Option('','Selecione'),new Option('000001','000001 - Integral')]);
 classification.readOnly=true;
 const loading={offsetWidth:0,offsetHeight:0,getClientRects:()=>[]};
 fields.set(situation.id,situation);fields.set(classification.id,classification);fields.set('modalLoading',loading);
 situation.onEvent=event=>{if(event.type==='change'){
  loading.offsetWidth=1;classification.readOnly=false;
  schedule(()=>{classification.options=[new Option('','Selecione'),new Option('000001','000001 - Integral')];classification.value='';loading.offsetWidth=0;},2000+index*900);
 }};
 classification.onEvent=event=>{if(event.type==='change'){loading.offsetWidth=1;schedule(()=>{loading.offsetWidth=0;},400+index*100);}};
 const file=fs.readFileSync(fs.existsSync('../content.js')?'../content.js':'../nfse-git/content.js','utf8');
 const source=file.split('// Portal certificate entry')[0].replace('const guide = createGuide();','const guide=testGuide;globalThis.tax={fillTaxClassification,conferStage};');
 const context={
  document:{hidden:true,getElementById:id=>fields.get(id),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}},
  location:{pathname:'/EmissorNacional/DPS/Tributacao',search:'?idr=draft-'+index},window:{addEventListener(){}},URLSearchParams,HTMLSelectElement:Select,Event:class{constructor(type){this.type=type;}},
  chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}},sendMessage:async()=>null}},testGuide:{show(){},point(){},confirm(){},wait(){},restore(){}},
  Date:{now:()=>now},setTimeout:schedule,clearTimeout:id=>timers.delete(id),setInterval:()=>1,navigator:{onLine:true}
 };
 vm.runInNewContext(source,context);
 async function settle(promise,limit=70000){let done=false,failure,result;promise.then(x=>{done=true;result=x},e=>{done=true;failure=e});for(let i=0;i<1500&&!done;i++){await Promise.resolve();if(!timers.size){await Promise.resolve();continue;}const [id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=timer.at;if(now>limit)throw Error('Unexpected timeout');timer.fn();}if(!done)throw Error('Did not settle');if(failure)throw failure;return result;}
 return {tax:context.tax,settle,events,situation,classification,loading,schedule,get now(){return now;},stop(){listener({type:'nfse:stop',jobId:'test'},{},()=>{});}};
}

test('Cinco guias ocultas aguardam a troca da lista antes de selecionar 000001',async()=>{
 await Promise.all(Array.from({length:5},async(_,i)=>{
  const e=engine(i);await e.settle(e.tax.fillTaxClassification());
  assert.equal(e.situation.value,'000');assert.equal(e.classification.value,'000001');assert.equal(e.loading.offsetWidth,0);
  const changes=e.events.filter(ev=>ev.id===e.classification.id&&ev.type==='change');
  assert.equal(changes.length,1);assert(changes[0].at>=2000+i*900,'Não seleciona a opção antiga durante a consulta');
  assert.equal(e.events.filter(ev=>ev.id===e.situation.id&&ev.type==='change').length,1,'Não reinicia a consulta em cada checagem');
  assert(e.now>=changes[0].at+400+i*100+350,'Aguarda a consulta da classificação e estabilidade');
  await e.tax.conferStage();
 }));
});
test('Nova consulta que limpa a classificação é corrigida antes da conferência final',async()=>{
 const e=engine();await e.settle(e.tax.fillTaxClassification());
 e.loading.offsetWidth=1;e.schedule(()=>{e.classification.value='';e.loading.offsetWidth=0;},1600);
 await e.settle(e.tax.fillTaxClassification());assert.equal(e.classification.value,'000001');await e.tax.conferStage();
 e.classification.value='';await assert.rejects(e.tax.conferStage(),/Classificação tributária/);
});
test('Parada cancela a espera da classificação sem novas seleções',async()=>{
 const e=engine();const pending=e.tax.fillTaxClassification();e.stop();await assert.rejects(e.settle(pending),error=>error.name==='AbortError');
 assert.equal(e.events.filter(ev=>ev.id===e.classification.id&&ev.type==='change').length,0);
});
test('Lista sem 000001 mantém o processo parado e não inventa opção',async()=>{
 const e=engine();e.situation.value='000';e.classification.readOnly=false;e.classification.options=[e.classification.options[0]];
 await assert.rejects(e.settle(e.tax.fillTaxClassification()),/000001/);assert.equal(e.classification.value,'');assert.equal(e.classification.options.length,1);
});

