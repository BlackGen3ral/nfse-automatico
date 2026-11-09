(()=>{
 let notes=[],batchId=null,jobs=[];
 try{const stored=JSON.parse(sessionStorage.getItem('nfseBatch')||'null');if(stored){notes=stored.notes||[];batchId=stored.id||null;}}catch{}
 const mode=$('batch-mode'),draft=$('batch-draft');
 const save=()=>sessionStorage.setItem('nfseBatch',JSON.stringify({id:batchId,notes}));
 const activeState=job=>['queued','claimed','running'].includes(job.state);
 function draw(){
  const enabled=mode.checked;
  draft.hidden=!enabled;mode.disabled=busy||!!batchId;
  $('send').textContent=enabled?'Adicionar nota ao lote ('+notes.length+'/5)':!online&&window.nfseWake?.canSubmit?'Ligar PC e preencher →':'Preencher no PC →';
  if(enabled&&notes.length>=5)$('send').disabled=true;
  $('send-batch').disabled=(!online&&!window.nfseWake?.canSubmit)||busy||!!batchId||notes.length<2;
  if(batchId)$('send').disabled=true;
  $('send-batch').textContent='Enviar '+notes.length+' notas simultaneamente';
  $('batch-notes').replaceChildren();
  notes.forEach((note,index)=>{const row=document.createElement('p');row.textContent='Nota '+(index+1)+' · '+note.invoice.cnpj+' · R$ '+note.invoice.amount+' · '+note.invoice.description.slice(0,80)+' ';const remove=document.createElement('button');remove.type='button';remove.className='text-link';remove.textContent='Remover';remove.disabled=busy||!!batchId;remove.onclick=()=>{notes.splice(index,1);save();render();};row.append(remove);$('batch-notes').append(row);});
 }
 function add(invoice){if(notes.length>=5){feedback('O lote já tem cinco notas.');return;}notes.push({id:crypto.randomUUID(),invoice});save();render();feedback('Nota adicionada. Edite os campos para adicionar a próxima ou envie o lote.');}
 async function refreshBatch(){
  if(polling||!pairing||!batchId)return;const currentPair=pairing;polling=true;
  try{const data=await api('/api/batches/status?id='+encodeURIComponent(batchId));if(pairing!==currentPair)return;jobs=data.jobs;online=data.online;busy=jobs.some(activeState);$('online').textContent=online?'PC conectado':'PC sem conexão';$('online').dataset.online=String(online);$('progress').hidden=false;$('step-track').hidden=true;$('stop-fill').hidden=true;$('stop-batch').hidden=!busy;$('new-note').hidden=busy;$('progress-title').textContent=jobs.filter(job=>job.state==='review').length+' de '+notes.length+' notas na revisão';$('progress-message').textContent=busy?(!online?'Aguardando o PC conectar. Você pode parar o lote enquanto ele inicia.':'Cada guia trabalha em uma nota. A emissão permanece manual.'):'Lote encerrado. Confira o resultado de cada nota no PC.';
   const list=$('batch-progress');list.hidden=false;list.replaceChildren();
   for(const job of jobs){const index=notes.findIndex(note=>note.id===job.id);const card=document.createElement('article');card.className='app-card';const title=document.createElement('strong');title.textContent='Nota '+(index+1)+' · '+({queued:online?'Na fila':'Aguardando PC',claimed:'Abrindo guia',running:'Preenchendo',review:'Pronta para revisar',error:'Requer atenção',cancelled:'Interrompida'}[job.state]||job.state);const text=document.createElement('p');text.textContent=job.message;card.append(title,text);if(activeState(job)){const stop=document.createElement('button');stop.type='button';stop.className='button secondary';stop.textContent=job.cancelRequested?'Parando…':'Parar esta nota';stop.disabled=!!job.cancelRequested;stop.onclick=async()=>{stop.disabled=true;try{await api('/api/jobs/cancel',{method:'POST',body:JSON.stringify({id:job.id})});await refreshBatch();}catch(error){feedback(error.message);stop.disabled=false;}};card.append(stop);}list.append(card);}
   render();
  }catch(error){online=false;feedback(error.message);render();}finally{polling=false;}
 }
 mode.checked=!!notes.length||!!batchId;
 mode.onchange=()=>{render();};
 $('send-batch').onclick=async()=>{if((!online&&!window.nfseWake?.canSubmit)||busy||notes.length<2)return;busy=true;render();const id=batchId||notes[0].id;batchId=id;save();try{const waitForPc=await window.nfseWake?.prepare()||false;await api('/api/batches',{method:'POST',body:JSON.stringify({id,notes,waitForPc})});await refreshBatch();}catch(error){feedback(error.message);busy=false;batchId=null;save();render();}};
 $('stop-batch').onclick=async()=>{const stop=$('stop-batch');stop.disabled=true;try{await Promise.all(jobs.filter(activeState).map(job=>api('/api/jobs/cancel',{method:'POST',body:JSON.stringify({id:job.id})})));feedback('Parada solicitada para todo o lote. Aguarde a confirmação de cada guia.');await refreshBatch();}catch(error){feedback(error.message);}finally{stop.disabled=false;}};
 window.nfseBatch={get enabled(){return mode.checked;},get active(){return !!batchId;},add,render:draw,refresh:refreshBatch,reset(){batchId=null;notes=[];jobs=[];save();$('batch-progress').hidden=true;$('stop-batch').hidden=true;$('step-track').hidden=false;render();}};
 render();if(batchId)refreshBatch();
})();
