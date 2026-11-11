import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function engine(){
 const fields=new Map(),timers=new Map(),labels=[];let seq=0,observer;
 const source=fs.readFileSync(fs.existsSync('../content.js')?'../content.js':'../nfse-git/content.js','utf8').split('// Portal certificate entry')[0].replace('const guide = createGuide();','const guide=testGuide;globalThis.engine={inspectReview,compareReviewValue,waitForPortalChange};');
 const listeners=new Map();
 const context={URLSearchParams,location:{pathname:'/EmissorNacional/DPS/Pessoas',search:''},document:{body:{},hidden:false,querySelector:()=>null,querySelectorAll:selector=>selector==="label,dt,th"?labels:[],getElementById:id=>fields.get(id),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}},window:{addEventListener(){},MutationObserver:class{constructor(fn){this.emit=fn;observer=this;}observe(){}disconnect(){this.disconnected=true;}}},chrome:{runtime:{onMessage:{addListener(){}},sendMessage:async()=>null}},testGuide:{show(){},wait(){},restore(){}},setInterval:()=>1,setTimeout:(fn,delay)=>{const id=++seq;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);
 return {...context.engine,fields,timers,listeners,labels,getObserver:()=>observer};
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
test('Revisão confere CPF com máscara na seção certa e aponta CPF divergente',()=>{
 const e=engine();
 const field=(section,value)=>({
   textContent:'CPF:',closest:()=>({previousElementSibling:{textContent:section}}),
   nextElementSibling:{offsetWidth:1,matches:()=>false,textContent:value}
 });
 e.labels.push(field('Tomador/Adquirente do Serviço','123.456.789-09'),field('Destinatário do Serviço','987.654.321-00'));
 const report=e.inspectReview([{stage:'Pessoas',checks:[
   {id:'Tomador_Inscricao',label:'Documento do tomador',expected:'12345678909',display:'123.456.789-09'},
   {id:'Destinatario_Inscricao',label:'Documento do destinatário',expected:'12345678909',display:'123.456.789-09'}
 ]}]);
 assert.equal(report.confirmed,1);
 assert.equal(report.changed,1);
 assert.equal(report.items[1].actual,'987.654.321-00');
});
test('Revisão distingue confirmação, diferença e campo não exibido sem presumir sucesso',()=>{
 const e=engine();e.fields.set('ServicoPrestado_Descricao',{offsetWidth:1,matches:()=>true,value:'Serviço aprovado'});e.fields.set('Valores_ValorServico',{offsetWidth:1,matches:()=>true,value:'R$ 250,00'});
 const checks=[{id:'ServicoPrestado_Descricao',label:'Descrição',expected:'Serviço aprovado',display:'Serviço aprovado'},{id:'Valores_ValorServico',label:'Valor',expected:'100,00',display:'100,00'},{id:'ServicoPrestado_CodigoNBS',label:'NBS',expected:'120012000',display:'120012000'}];
 const report=e.inspectReview([{stage:'Serviço',checks}]);assert.equal(report.confirmed,1);assert.equal(report.changed,1);assert.equal(report.missing,1);assert.match(report.summary,/Confira as diferenças/);
 assert.equal(e.compareReviewValue('A B',{id:'ServicoPrestado_Descricao',expected:'A/B',display:'A/B'}),false);
 assert.equal(e.inspectReview([]).items.length,0);assert.match(e.inspectReview([]).summary,/Não há histórico suficiente/);
});
test('Estrutura real da revisão separa descrição do código, descrição digitada e CNPJs por seção',()=>{
 const e=engine();
 const row=(label,value,section)=>({textContent:label,closest:()=>({previousElementSibling:{textContent:section}}),nextElementSibling:{offsetWidth:1,matches:()=>false,textContent:value}});
 const issuer='1'.repeat(14),customer='2'.repeat(14),recipient='3'.repeat(14);
 e.labels.push(row('CNPJ:',issuer,'Informações do Emitente'),row('CNPJ:',customer,'Tomador/Adquirente do Serviço'),row('CNPJ:',recipient,'Destinatário do Serviço'),row('Descrição do serviço:','Assistência técnica.','Serviço Prestado'),row('Descrição do Serviço/Fornecimento:','teste','Serviço Prestado'),row('Código completo do serviço:','14.02.01.000','Serviço Prestado'),row('Valor da operação/serviço prestado:','R$ 1,00','Valores do Serviço Prestado'));
 e.fields.set('ServicoPrestado_Descricao',{offsetWidth:1,matches:()=>false,textContent:'Assistência técnica.'});
 const check=(id,label,expected,display=expected)=>({id,label,expected,display});
 const checks=[check('Prestador_Inscricao','CNPJ do emitente',issuer),check('Tomador_Inscricao','CNPJ do tomador',customer),check('Destinatario_Inscricao','CNPJ do destinatário',recipient),check('ServicoPrestado_Descricao','Descrição do serviço','teste'),check('ServicoPrestado_CodigoTributacaoNacional','Código de Tributação Nacional','140201','14.02.01 - Assistência técnica.'),check('Valores_ValorServico','Valor do serviço','1,00'),check('ValorTributos_AliquotaSN','Alíquota do Simples Nacional','6,00')];
 const report=e.inspectReview([{stage:'Teste',checks}]);assert.equal(report.confirmed,6);assert.equal(report.changed,0);assert.equal(report.missing,0);assert.equal(report.stageOnly,1);assert.equal(report.items.find(item=>item.id==='ServicoPrestado_Descricao').actual,'teste');
 e.labels[1].nextElementSibling.textContent='4'.repeat(14);e.labels[4].nextElementSibling.textContent='Outro serviço';
 const changed=e.inspectReview([{stage:'Teste',checks}]);assert.equal(changed.changed,2);assert.equal(changed.items.find(item=>item.id==='Prestador_Inscricao').status,'confirmed');
});
