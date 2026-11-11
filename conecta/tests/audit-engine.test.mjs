import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function engine(pathname = "/EmissorNacional/DPS/Servico") {
  const file = fs.readFileSync(fs.existsSync("../content.js") ? "../content.js" : "../nfse-git/content.js", "utf8");
  const source = file.slice(0, file.indexOf("// Portal certificate entry"))
    .replace("const guide = createGuide();", "const guide = testGuide; globalThis.engine = {remember,conferStage,reviewExplanation,portalHealth,missingRecipientAddress,lookupConfirmed,update};");
  const fields = new Map(), messages = [];
  const context = {
    document:{hidden:false,querySelector:()=>null,querySelectorAll:selector=>selector === 'input[type=radio]' ? [...fields.values()].filter(field=>field.type === 'radio') : [],getElementById:id=>fields.get(id),addEventListener(){}},
    location:{pathname,search:"?idr=draft-test"}, window:{addEventListener(){}}, URLSearchParams,
    chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(message){messages.push(message);return null;}}},
    testGuide:{show(){},point(){},confirm(){},wait(){},restore(){}},
    setTimeout,clearTimeout,setInterval:()=>1,navigator:{onLine:true}
  };
  vm.runInNewContext(source,context);
  return {...context.engine, fields, messages, context};
}

test("Conferência relê o campo e bloqueia avanço quando o portal perde uma seleção", async()=>{
  const e=engine();
  const field={id:"CodigoNBS",value:"120012000",labels:[{textContent:"Item NBS"}]};
  e.fields.set(field.id,field);e.remember(field,field.value);
  field.value="";
  await assert.rejects(e.conferStage(),/Item NBS/);
  field.value="120012000";
  await e.conferStage();await e.update("done","Conferido");
  const audit=e.messages.findLast(message=>message.type==="nfse:update").state.audit;
  assert.equal(audit[0].count,1);assert.equal(audit[0].fields[0],"Item NBS");
  assert.equal(audit[0].checks[0].expected,"120012000");
});
test("Histórico incompleto não declara sucesso e diagnóstico detecta falta de internet",()=>{
  const e=engine();
  assert.match(e.reviewExplanation([{stage:"Serviço",count:1}]),/incompleto/);
  assert.match(e.reviewExplanation(["Pessoas","Serviço","Valores"].map(stage=>({stage,count:3}))),/As seleções foram relidas/);
  e.context.navigator.onLine=false;assert.equal(e.portalHealth().kind,"offline");
});
test("Validação em Pessoas identifica o campo do destinatário por trás do aviso geral",()=>{
  const e = engine("/EmissorNacional/DPS/Pessoas");
  const id = "Destinatario_EnderecoNacional_CEP";
  e.fields.set(id, {id, name:"Destinatario.EnderecoNacional.CEP"});
  e.context.document.querySelectorAll = selector => {
    if (selector.startsWith(".alert-danger")) {
      return [{offsetWidth:1, innerText:"× Preencha o formulário conforme orientações abaixo"}];
    }
    if (selector === ".field-validation-error") {
      return [{offsetWidth:1, innerText:"Campo obrigatório", getAttribute:()=> "Destinatario.EnderecoNacional.CEP"}];
    }
    return [];
  };
  assert.equal(e.portalHealth().kind, "validation");
  assert.equal(e.portalHealth().message, "Destinatário · CEP: Campo obrigatório");
  e.fields.clear();
  e.context.document.querySelectorAll = selector => selector.startsWith(".alert-danger")
    ? [{offsetWidth:1, innerText:"× Preencha o formulário conforme orientações abaixo"}] : [];
  assert.equal(e.portalHealth(), null);
});

test("Endereço do destinatário pendente considera apenas campos ativos e vazios",()=>{
  const e = engine("/EmissorNacional/DPS/Pessoas");
  const checkbox = {checked:true};
  e.fields.set("Destinatario_InformarEndereco", checkbox);
  e.fields.set("pnlDestinatarioEnderecoBrasil", {offsetWidth:1, querySelector:selector=>e.fields.get(selector.slice(1))});
  for (const [key, value] of [["CEP",""], ["Bairro","Preenchido"], ["Logradouro",""], ["Numero",""]]) {
    const id = "Destinatario_EnderecoNacional_" + key;
    e.fields.set(id, {id, value, offsetWidth:1, disabled:key === "Logradouro"});
  }
  const missing = () => Array.from(e.missingRecipientAddress(), field=>field.id.split("_").at(-1));
  assert.deepEqual(missing(), ["CEP","Numero"]);
  checkbox.checked = false;
  assert.deepEqual(missing(), []);
});

test("Retomar a consulta exige o CPF registrado pelo portal",()=>{
  const e = engine("/EmissorNacional/DPS/Pessoas");
  const portalResult = {value:""};
  const input = {value:"123.456.789-09", closest:()=>({querySelectorAll:()=>[portalResult]})};
  assert.equal(e.lookupConfirmed(input, "12345678909"), false);
  portalResult.value = "12345678909";
  assert.equal(e.lookupConfirmed(input, "12345678909"), true);
  input.value = "111.444.777-35";
  assert.equal(e.lookupConfirmed(input, "12345678909"), false);
});
test("Uma troca posterior no mesmo grupo de rádio substitui a confirmação anterior",async()=>{
  const e=engine();
  const no={id:"no",name:"suspensao",type:"radio",checked:true,labels:[]};
  const yes={id:"yes",name:"suspensao",type:"radio",checked:false,labels:[]};
  e.fields.set(no.id,no);e.fields.set(yes.id,yes);e.remember(no,true);
  no.checked=false;yes.checked=true;e.remember(yes,true);
  await e.conferStage();yes.checked=false;
  await assert.rejects(e.conferStage(),/não manteve/);
});
test("Rádios com ID repetido são conferidos pelo grupo e valor, inclusive após recriação",async()=>{
  const e=engine();
  const yes={id:"CompraGovernamental",name:"CompraGovernamental",value:"1",type:"radio",checked:false,labels:[]};
  const no={...yes,value:"0",checked:true};
  e.fields.set(yes.id,yes);e.fields.set("segunda-opcao",no);
  e.remember(no,true);
  await e.conferStage();
  e.fields.set("segunda-opcao",{...no});
  no.checked=false;
  await e.conferStage();
  e.fields.get("segunda-opcao").checked=false;yes.checked=true;
  await assert.rejects(e.conferStage(),/não manteve/);
  e.fields.delete("segunda-opcao");
  await assert.rejects(e.conferStage(),/não manteve/);
});
