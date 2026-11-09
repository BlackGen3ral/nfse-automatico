import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('Palmas só inicia após confirmação explícita e usa a credencial do PC pareado',()=>{
 const elements={},calls=[],timers=[];
 const element=id=>elements[id]||={hidden:false,disabled:false,textContent:''};let allowed=false,active=false;
 const context={window:{NfseAndroid:{clapSupported:()=>true,clapStatus:()=>JSON.stringify({active,message:active?'Ouvindo':'Desativado'}),startClapMode:data=>{calls.push(JSON.parse(data));active=true;},stopClapMode:()=>{calls.push('stop');active=false;}}},pairing:{mobileToken:'a'.repeat(64),name:'PC teste'},online:true,busy:false,document:{hidden:false},$:element,confirm:()=>allowed,setInterval:()=>1,setTimeout:fn=>timers.push(fn)};
 vm.runInNewContext(fs.readFileSync('web/claps.js','utf8'),context);
 element('clap-start').onclick();assert.equal(calls.length,0);
 allowed=true;element('clap-start').onclick();assert.equal(calls.length,1);assert.equal(calls[0].token,context.pairing.mobileToken);
 timers.shift()();assert.equal(element('clap-stop').hidden,false);
 context.window.nfseClaps.reset();assert.equal(active,false);assert.equal(calls.at(-1),'stop');
});

