import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("Parada interrompe esperas e impede escritas e avanços posteriores",async()=>{
  const file=fs.readFileSync(fs.existsSync("../content.js")?"../content.js":"../nfse-git/content.js","utf8");
  const source=file.slice(0,file.indexOf("// Portal certificate entry"))
    .replace("const guide = createGuide();","const guide = testGuide; globalThis.engine = {waitFor,setNativeValue,watchAdvance};");
  let listener;
  const context={
    document:{hidden:false,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}},
    location:{pathname:"/EmissorNacional/DPS/Pessoas",search:"?idr=teste"},
    window:{addEventListener(){}},URLSearchParams,
    chrome:{runtime:{onMessage:{addListener(fn){listener=fn;}},async sendMessage(){return {active:false};}}},
    testGuide:{show(){},point(){},confirm(){},wait(){},restore(){}},
    setTimeout,clearTimeout,setInterval:()=>1,
  };
  vm.runInNewContext(source,context);
  const wait=context.engine.waitFor("Campo aguardado",()=>null);
  let answer;
  listener({type:"nfse:stop",jobId:"test"},{},value=>{answer=value;});
  assert.equal(answer.stopped,true);
  await assert.rejects(wait,error=>error.name==="AbortError");
  const field={disabled:false,value:"preservado"};
  assert.throws(()=>context.engine.setNativeValue(field,"alterado"),error=>error.name==="AbortError");
  assert.equal(field.value,"preservado");
  let clicks=0;
  assert.throws(()=>context.engine.watchAdvance(/Pessoas/,{click(){clicks++;}},"Pessoas"),error=>error.name==="AbortError");
  assert.equal(clicks,0);
});
