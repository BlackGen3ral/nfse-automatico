import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function engine(){
 const fields=new Map(),timers=new Map();let seq=0,observer;
 const source=fs.readFileSync(fs.existsSync('../content.js')?'../content.js':'../nfse-git/content.js','utf8').split('// Portal certificate entry')[0].replace('const guide = createGuide();','const guide=testGuide;globalThis.engine={inspectReview,compareReviewValue,waitForPortalChange};');
 const listeners=new Map();
 const context={URLSearchParams,location:{pathname:'/EmissorNacional/DPS/Pessoas',search:''},document:{body:{},hidden:false,querySelector:()=>null,querySelectorAll:()=>[],getElementById:id=>fields.get(id),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}},window:{addEventListener(){},MutationObserver:class{constructor(fn){this.emit=fn;observer=this;}observe(){}disconnect(){this.disconnected=true;}}},chrome:{runtime:{onMessage:{addListener(){}},sendMessage:async()=>null}},testGuide:{show(){},wait(){},restore(){}},setInterval:()=>1,setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);
 return {...context.engine,fields,timers,listeners,getObserver:()=>observer};
}
test('Mudança do portal acorda a espera em 16 ms em vez do intervalo de 140 ms e limpa recursos',async()=>{
 const e=engine();const originalListeners=e.listeners.size;let complete=false;const waiting=e.waitForPortalChange(140).then(()=>{complete=true;});
 e.getObserver().emit();e.getObserver().emit();
 assert.equal([...e.timers.values()].filter(timer=>timer.delay===16).length,1);
 const fast=[...e.timers.values()].find(timer=>timer.delay===16);fast.fn();await waiting;
 assert.equal(complete,true);assert.equal(e.getObserver().disconnected,true);assert.equal(e.timers.size,0);assert.equal(e.listeners.size,originalListeners);
});
test('Campo sem notificação mantém a checagem de segurança',async()=>{
 const e=engine();const waiting=e.waitForPortalChange(60);[...e.timers.values()][0].fn();await waiting;assert.equal(e.getObserver().disconnected,true);assert.equal(e.timers.size,0);
});
test('Revisão distingue confirmação, diferença e campo não exibido sem presumir sucesso',()=>{
 const e=engine();e.fields.set('ServicoPrestado_Descricao',{offsetWidth:1,matches:()=>true,value:'Serviço aprovado'});e.fields.set('Valores_ValorServico',{offsetWidth:1,matches:()=>true,value:'R$ 250,00'});
 const checks=[{id:'ServicoPrestado_Descricao',label:'Descrição',expected:'Serviço aprovado',display:'Serviço aprovado'},{id:'Valores_ValorServico',label:'Valor',expected:'100,00',display:'100,00'},{id:'ServicoPrestado_CodigoNBS',label:'NBS',expected:'120012000',display:'120012000'}];
 const report=e.inspectReview([{stage:'Serviço',checks}]);assert.equal(report.confirmed,1);assert.equal(report.changed,1);assert.equal(report.missing,1);assert.match(report.summary,/Confira as diferenças/);
 assert.equal(e.compareReviewValue('A B',{id:'ServicoPrestado_Descricao',expected:'A/B',display:'A/B'}),false);
 assert.equal(e.inspectReview([]).items.length,0);assert.match(e.inspectReview([]).summary,/Não há histórico suficiente/);
});
