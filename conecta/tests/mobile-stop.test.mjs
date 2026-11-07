import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("Celular mantém Parando até receber confirmação e libera nova solicitação depois",async()=>{
  const id=crypto.randomUUID(),elements={},timers=[],calls=[];
  let job={id,state:"running",message:"Preenchendo Pessoas",cancelRequested:0};
  function element(name){
    return elements[name] ||= {value:"",hidden:false,disabled:false,dataset:{},children:[],addEventListener(){},classList:{toggle(){}}};
  }
  const saved=new Map([["nfsePair",JSON.stringify({mobileToken:"a".repeat(64),name:"Teste"})]]);
  const session=new Map([["nfseRequest",id]]);
  const storage=(map)=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
  vm.runInNewContext(fs.readFileSync("web/app.js","utf8"),{
    document:{hidden:false,getElementById:element,addEventListener(){}},
    window:{addEventListener(){}},localStorage:storage(saved),sessionStorage:storage(session),
    location:{hash:""},history:{replaceState(){}},setInterval(fn){timers.push(fn);return 1;},clearInterval(){},crypto,
    async fetch(path,options){
      assert.equal(options.headers.authorization,"Bearer "+"a".repeat(64));
      if(path==="/api/jobs/cancel"){
        assert.equal(JSON.parse(options.body).id,id);calls.push(path);
        job={...job,cancelRequested:1,message:"Parada solicitada"};
        return {ok:true,json:async()=>({state:"running"})};
      }
      assert.equal(path,"/api/status");
      return {ok:true,json:async()=>({online:true,job:{...job}})};
    },
  });
  await new Promise(setImmediate);
  assert.equal(element("stop-fill").hidden,false);
  await element("stop-fill").onclick();
  assert.equal(element("stop-fill").textContent,"Parando…");
  assert.equal(element("send").disabled,true);
  job={...job,state:"cancelled",message:"Preenchimento interrompido"};
  await timers[0]();
  assert.equal(element("stop-fill").hidden,true);
  assert.equal(element("progress-title").textContent,"Preenchimento interrompido");
  assert.equal(element("send").disabled,false);
  assert.equal(session.has("nfseRequest"),false);
  assert.equal(calls.length,1);
});
