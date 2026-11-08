(()=>{
 let command=null,powerReady=false,pending=false,last=0,clockOffset=0;
 const now=()=>Date.now()+clockOffset;
 const active=()=>command&&['queued','scheduled'].includes(command.state)&&command.expires>now();
 function draw(){
  $('power-shutdown').disabled=!online||busy||pending||!powerReady||!!(command&&['queued','scheduled','executed'].includes(command.state)&&command.expires>now());
  $('power-cancel').hidden=!active();$('power-cancel').disabled=pending;
  const seconds=command?.deadline?Math.max(0,Math.ceil((command.deadline-now())/1000)):null;
  $('power-status').textContent=command?.state==='scheduled'?'Desligando em '+seconds+' s. Você pode cancelar.':
   active()?'Aguardando confirmação do PC…':
   command?.message||(!powerReady?'Atualize o app do PC para 1.7.0 para desligar pelo celular.':'Salve seu trabalho antes de desligar. Notas em andamento bloqueiam esta opção.');
 }
 async function refresh(force=false){
  if(!pairing||pending||!force&&Date.now()-last<2000)return;const current=pairing;last=Date.now();
  try{const data=await api('/api/power');if(pairing!==current)return;command=data.command;powerReady=data.ready;if(Number.isFinite(data.serverNow))clockOffset=data.serverNow-Date.now();draw();}catch{powerReady=false;draw();}
 }
 $('power-shutdown').onclick=async()=>{
  if(!online||busy||pending||!powerReady||active())return;
  if(!confirm('Desligar o PC '+pairing.name+'? Salve seu trabalho. Após o PC confirmar, você terá 10 segundos para cancelar.'))return;
  pending=true;draw();try{await api('/api/power/shutdown',{method:'POST',body:JSON.stringify({id:crypto.randomUUID()})});}catch(error){feedback(error.message);}finally{pending=false;await refresh(true);}
 };
 $('power-cancel').onclick=async()=>{
  if(!active()||pending)return;pending=true;draw();
  try{await api('/api/power/cancel',{method:'POST',body:JSON.stringify({id:command.id})});feedback('Desligamento cancelado.');}catch(error){feedback(error.message);}finally{pending=false;await refresh(true);}
 };
 window.nfsePower={refresh,render:draw,reset(){command=null;powerReady=false;last=0;clockOffset=0;draw();}};
 setInterval(()=>{if(!document.hidden){if(active())refresh();draw();}},1000);
 draw();refresh(true);
})();

