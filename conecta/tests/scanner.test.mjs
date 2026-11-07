import fs from "node:fs";
import vm from "node:vm";
import {test} from "node:test";
import assert from "node:assert/strict";
const source=fs.readFileSync("web/qr-scanner.js","utf8");
function scanner(value) {
  let submitted=0, stopped=0;
  const elements={};
  for(const id of ["qr-dialog","qr-video","qr-feedback","scan-qr","close-scanner","pair-code","pair-form","installed-version","check-updates"])
    elements[id]={addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};
  Object.assign(elements["qr-video"],{readyState:2,videoWidth:100,videoHeight:100,async play(){}});
  elements["pair-form"].requestSubmit=()=>submitted++;
  const context={drawImage(){},getImageData(){return {data:new Uint8ClampedArray(16),width:2,height:2};}};
  vm.runInNewContext(source,{
    document:{getElementById:id=>elements[id],createElement:()=>({getContext:()=>context}),addEventListener(){}},
    window:{addEventListener(){}},
    navigator:{mediaDevices:{async getUserMedia(options){assert.equal(options.audio,false);return {getTracks:()=>[{stop(){stopped++;}}]};}}},
    location:{origin:"https://nfse-conecta.pages.dev"},URL,jsQR:()=>({data:value}),
    setTimeout:()=>1,clearTimeout(){},
  });
  return {elements,get submitted(){return submitted;},get stopped(){return stopped;}};
}
test("Leitor conecta somente QR do serviço e encerra a câmera",async()=>{
  const s=scanner("https://nfse-conecta.pages.dev/app#pair=ABCDEF123456");
  await s.elements["scan-qr"].onclick();
  assert.equal(s.elements["pair-code"].value,"ABCDEF123456");
  assert.equal(s.submitted,1);assert.equal(s.stopped,1);
});
test("Leitor rejeita QR externo e permite fechar a câmera",async()=>{
  const s=scanner("https://example.com/app#pair=ABCDEF123456");
  await s.elements["scan-qr"].onclick();
  assert.equal(s.submitted,0);
  s.elements["close-scanner"].onclick();
  assert.equal(s.stopped,1);
});
