import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function reactions() {
  const source=fs.readFileSync(fs.existsSync('../content.js')?'../content.js':'../nfse-git/content.js','utf8');
  const start=source.indexOf('    function react(next)');
  const end=source.indexOf('    const reduced =',start);
  let now=10000, sequence=0;
  const timers=new Map(), changes=[];
  const dataset=new Proxy({}, {set(object,key,value){if(key==='reaction'&&object[key]!==value)changes.push(value);object[key]=value;return true;}});
  const context={worker:{dataset},ring:{dataset:{}},Date:{now:()=>now},setTimeout(fn,delay){const id=++sequence;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext('let reactionTimer,celebrationUntil=0,lastCelebration=-Infinity,pendingReaction="casting";'+source.slice(start,end)+'globalThis.react=react;',context);
  return {react:context.react,changes,dataset,advance(ms){now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}};
}

test('Confirmações rápidas preservam uma reação contínua sem alternar o rosto a cada campo',()=>{
  const e=reactions();e.react('casting');e.react('confirmed');
  for(let i=0;i<10;i++){e.advance(20);e.react('casting');e.react('confirmed');}
  assert.deepEqual(e.changes,['casting','confirmed']);
  e.react('waiting');e.advance(1000);assert.equal(e.dataset.reaction,'waiting');
  e.react('confirmed');assert.equal(e.dataset.reaction,'waiting');
  e.advance(1600);e.react('confirmed');assert.equal(e.dataset.reaction,'confirmed');
});
test('Erro e conclusão encerram imediatamente a comemoração e seu temporizador',()=>{
  for(const terminal of ['error','review']){
    const e=reactions();e.react('confirmed');e.react(terminal);e.advance(2000);
    assert.equal(e.dataset.reaction,terminal);
  }
});
