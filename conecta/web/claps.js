(()=>{
 let active=false;
 const bridge=()=>window.NfseAndroid;
 function refresh(){
  try{if(!bridge()?.clapSupported?.()){$('clap-start').disabled=true;$('clap-status').textContent='Instale o Android 1.5.0 para ativar duas palmas.';return;}
   const state=JSON.parse(bridge().clapStatus());active=!!state.active;
   $('clap-status').textContent=state.message;$('clap-stop').hidden=!active;$('clap-start').hidden=active;$('clap-start').disabled=!pairing||busy;
  }catch{$('clap-status').textContent='Não foi possível conferir o modo de escuta.';}
 }
 $('clap-start').onclick=()=>{
  if(!pairing||busy)return;
  if(!confirm('Ativar duas palmas para controlar '+pairing.name+'? O microfone ficará ativo por até 30 minutos, inclusive com a tela apagada. PC conectado: pede desligamento imediato. PC sem conexão: envia o comando de ligar pelo mesmo Wi-Fi. Ruídos podem ativar o comando. Aguarde 15 segundos entre pedidos.'))return;
  bridge().startClapMode(JSON.stringify({token:pairing.mobileToken,name:pairing.name,pocket:$("clap-sensitivity").value!=="normal"}));$('clap-status').textContent='Aguardando permissão do Android…';setTimeout(refresh,1200);
 };
 $('clap-stop').onclick=()=>{bridge()?.stopClapMode?.();setTimeout(refresh,300);};
 window.nfseClaps={reset(){try{bridge()?.stopClapMode?.();}catch{}active=false;refresh();}};
 setInterval(()=>{if(!document.hidden)refresh();},1000);refresh();
})();

