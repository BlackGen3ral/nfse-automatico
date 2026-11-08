(()=>{
 let config=null,lastFetch=0,sending=false;
 const requests=new Map(),choice=$('wake-before-submit');
 const nativeReady=()=>{try{return window.NfseAndroid?.wakeSupported?.()===true;}catch{return false;}};
 const ready=()=>!!config?.enabled&&nativeReady();
 const canSubmit=()=>choice.checked&&ready()&&config.autoStart===true;
 function draw(){
  const panel=$('wake-panel');panel.hidden=!pairing;
  choice.disabled=busy||!ready()||config.autoStart!==true;
  $('wake-pc').disabled=!ready()||sending||online;
  $('wake-pc').textContent=sending?'Enviando comando…':online?'PC já conectado':'Ligar PC no mesmo Wi-Fi';
  $('wake-status').textContent=!nativeReady()?'Instale o Android 1.4.0 ou superior para enviar o comando de despertar.':
   !config?.enabled?'No app do PC 1.6.0, abra Configurar ligar PC pela rede e salve o adaptador conectado por cabo.':
   !config.autoStart?'Ative Iniciar com o Windows no app do PC para receber as notas após entrar na sua conta.':
   'Rede preparada para enviar o comando. O despertar ainda depende do teste neste PC.';
 }
 async function refresh(force=false){
  if(!pairing || !force&&Date.now()-lastFetch<15000)return;
  const current=pairing;lastFetch=Date.now();
  try{const result=await api('/api/wake');if(pairing!==current)return;config=result.config;render();}catch{if(pairing===current){config=null;render();}}
 }
 async function sendWake(){
  if(!ready())throw Error('Configure a rede no app do PC e atualize o Android primeiro.');
  if(sending)throw Error('Aguarde o envio do comando anterior.');
  const id=crypto.randomUUID(),current=pairing;sending=true;render();
  try{
   return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{requests.delete(id);reject(Error('O Android não confirmou o envio. Confira a versão instalada.'));},8000);
    requests.set(id,{resolve,reject,timer,current});
    try{window.NfseAndroid.wakeComputer(JSON.stringify({id,mac:config.mac,broadcast:config.broadcast}));}catch(error){clearTimeout(timer);requests.delete(id);reject(error);}
   });
  }finally{sending=false;render();}
 }
 window.addEventListener('nfse-wake-result',event=>{
  const result=event.detail,pending=requests.get(result?.id);if(!pending)return;
  requests.delete(result.id);clearTimeout(pending.timer);
  if(pairing!==pending.current){pending.reject(Error('O pareamento mudou. Tente novamente.'));return;}
  result.ok?pending.resolve(result.message):pending.reject(Error(result.message||'Não foi possível enviar o comando.'));
 });
 choice.addEventListener('change',render);
 $('wake-pc').onclick=async()=>{try{feedback(await sendWake());}catch(error){feedback(error.message);}};
 window.nfseWake={
  get canSubmit(){return canSubmit();},
  render:draw,refresh,
  async prepare(){if(online)return false;if(!canSubmit())throw Error('Conecte o PC ou marque Ligar e aguardar estando no mesmo Wi-Fi dele.');feedback(await sendWake());return true;},
  reset(){config=null;choice.checked=false;lastFetch=0;draw();}
 };
 render();refresh(true);
})();

