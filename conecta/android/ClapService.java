package com.artho.nfseconecta;
import android.app.*;
import android.content.*;
import android.media.*;
import android.os.*;
import android.speech.tts.TextToSpeech;
import java.util.*;
import java.util.concurrent.*;
import java.net.*;
import java.io.*;
import org.json.*;
public class ClapService extends Service {
 public static volatile boolean active=false;public static volatile String message="Modo duas palmas desativado.";
 private static final int NOTIFICATION=73;private volatile boolean stopped;private volatile String token="",pending="";private String name="";
 private volatile AudioRecord recorder;private PowerManager.WakeLock lock;private TextToSpeech speech;private volatile boolean speechReady;
 private ClapDetector detector;private final ExecutorService network=Executors.newSingleThreadExecutor();
 private final java.util.concurrent.atomic.AtomicBoolean requesting=new java.util.concurrent.atomic.AtomicBoolean();
 private long until,lastPoll;
 @Override public void onCreate(){super.onCreate();speech=new TextToSpeech(this,status->{speechReady=status==TextToSpeech.SUCCESS;if(speechReady)speech.setLanguage(new Locale("pt","BR"));});}
 @Override public int onStartCommand(Intent intent,int flags,int id){
  if(intent==null){stopSelf();return START_NOT_STICKY;}
  if("STOP".equals(intent.getAction())){message="Modo duas palmas desativado.";stopSelf();return START_NOT_STICKY;}
  if("CANCEL".equals(intent.getAction())){new Thread(()->cancel(),"nfse-clap-cancel").start();return START_NOT_STICKY;}
  if(active)return START_NOT_STICKY;
  token=intent.getStringExtra("token");name=intent.getStringExtra("name");
  if(token==null||!token.matches("[a-f0-9]{64}")){stopSelf();return START_NOT_STICKY;}
  detector=new ClapDetector(intent.getBooleanExtra("pocket",true));
  until=SystemClock.elapsedRealtime()+1800000;
  NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
  manager.createNotificationChannel(new NotificationChannel("clap-mode","Modo duas palmas",NotificationManager.IMPORTANCE_LOW));
  startForeground(NOTIFICATION,notification("Ouvindo duas palmas para "+name+". Escuta por até 30 minutos."));
  active=true;message="Ouvindo duas palmas · tela pode ser apagada · limite de 30 minutos.";
  lock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"NFSeConecta:claps");lock.acquire(1800000);
  detector.reset(SystemClock.elapsedRealtime()+2000);
  new Thread(()->listen(),"nfse-clap-audio").start();return START_NOT_STICKY;
 }
 private Notification notification(String text){
  PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,ClapService.class).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  PendingIntent cancel=PendingIntent.getService(this,2,new Intent(this,ClapService.class).setAction("CANCEL"),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  return new Notification.Builder(this,"clap-mode").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("NFS-e Conecta · duas palmas").setContentText(text).setContentIntent(open).setOngoing(true).addAction(0,"Parar escuta",stop).build();
 }
 private void report(String text){if(stopped)return;message=text;((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION,notification(text));}
 private void speak(String text){new Handler(Looper.getMainLooper()).post(()->{if(speechReady&&!stopped)speech.speak(text,TextToSpeech.QUEUE_FLUSH,null,"nfse-clap");});}
 private void listen(){
  try{
   int buffer=Math.max(AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)*2,4096);
   recorder=new AudioRecord(MediaRecorder.AudioSource.MIC,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,buffer);
   if(recorder.getState()!=AudioRecord.STATE_INITIALIZED)throw new Exception();
   recorder.startRecording();short[] samples=new short[512];
   while(!stopped&&SystemClock.elapsedRealtime()<until){
    int n=recorder.read(samples,0,samples.length);if(n<0)throw new Exception();
    long now=SystemClock.elapsedRealtime();
    if(detector.frame(samples,n,now)&&requesting.compareAndSet(false,true))network.execute(()->requestShutdown());
   }
   if(!stopped)message="Escuta encerrada após 30 minutos. Ative novamente no app.";stopSelf();
  }catch(Exception error){message="Microfone indisponível. Feche outros apps que usam áudio e ative novamente.";stopSelf();}
  finally{AudioRecord audio=recorder;recorder=null;if(audio!=null){try{audio.stop();}catch(Exception ignored){}audio.release();}}
 }
 private JSONObject api(String path,JSONObject body)throws Exception{
  HttpURLConnection connection=(HttpURLConnection)new URL("https://nfse-conecta.pages.dev"+path).openConnection();
  try{connection.setConnectTimeout(7000);connection.setReadTimeout(7000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Content-Type","application/json");
   if(body!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);try(OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes("UTF-8"));}}
   int code=connection.getResponseCode();InputStream stream=code>=400?connection.getErrorStream():connection.getInputStream();if(stream==null)throw new IOException();
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=stream){byte[] chunk=new byte[1024];int n;while((n=in.read(chunk))!=-1){if(bytes.size()+n>16384)throw new IOException();bytes.write(chunk,0,n);}}
   JSONObject data=new JSONObject(bytes.toString("UTF-8"));if(code>=400){if(code==401)stopSelf();throw new IOException(data.optString("error","Pedido recusado."));}return data;
  }finally{connection.disconnect();}
 }
 private void requestShutdown(){
  try{
   if(stopped)return;
   JSONObject wake=api("/api/wake",null);
   if(!wake.optBoolean("online")){
    JSONObject config=wake.optJSONObject("config");if(config==null||!config.optBoolean("enabled"))throw new IOException("Configure Ligar PC pela rede no computador primeiro.");
    android.net.ConnectivityManager manager=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);android.net.Network connection=manager.getActiveNetwork();android.net.NetworkCapabilities caps=manager.getNetworkCapabilities(connection);
    if(connection==null||caps==null||!caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI))throw new IOException("Para ligar por palmas, use o mesmo Wi-Fi do PC.");
    if(stopped)return;WakeOnLan.send(connection,config.getString("mac"),config.getString("broadcast"));report("PC sem conexão. Comando de ligar enviado pela rede local; aguarde o Conecta responder.");speak("Comando de ligar enviado.");return;
   }
   JSONObject status=api("/api/power",null);JSONObject command=status.optJSONObject("command");
   if(command!=null&&Arrays.asList("queued","scheduled","executed").contains(command.optString("state"))&&command.optLong("expires")>status.optLong("serverNow",System.currentTimeMillis())){report("O PC ainda está desligando. Aguarde o Conecta desconectar antes de pedir para ligar.");return;}
   if(stopped)return;String id=UUID.randomUUID().toString();pending=id;
   api("/api/power/shutdown",new JSONObject().put("id",id));report("Duas palmas reconhecidas. Aguardando confirmação de desligamento imediato.");speak("Pedido de desligamento enviado.");
   while(!stopped&&SystemClock.elapsedRealtime()<until){
    Thread.sleep(600);JSONObject response=api("/api/power",null);JSONObject state=response.optJSONObject("command");
    if(state==null||!id.equals(state.optString("id")))break;
    String phase=state.optString("state");
    if("scheduled".equals(phase)){if(!id.equals(announced)){announced=id;speak("Desligamento confirmado.");}report("PC confirmou o desligamento imediato.");}
    else if(!"queued".equals(phase)){report(state.optString("message"));pending="";break;}
   }
  }catch(Exception error){report(error instanceof IOException&&error.getMessage()!=null?error.getMessage():"Não consegui confirmar o pedido. Confira o app antes de tentar novamente.");speak("Não consegui confirmar. Confira o aplicativo.");}
  finally{requesting.set(false);}
 }
 private String announced="";
 private void cancel(){try{String id=pending;if(id.isEmpty()){JSONObject c=api("/api/power",null).optJSONObject("command");if(c!=null)id=c.optString("id");}if(id.isEmpty()){report("Não há pedido para cancelar.");return;}api("/api/power/cancel",new JSONObject().put("id",id));pending="";report("Desligamento cancelado. Escuta continua ativa.");speak("Desligamento cancelado.");}catch(Exception error){report("Não consegui cancelar. Confira o estado do PC no app.");}}
 @Override public void onDestroy(){stopped=true;active=false;token="";if(lock!=null&&lock.isHeld())lock.release();if(speech!=null){speech.stop();speech.shutdown();}network.shutdownNow();super.onDestroy();}
 @Override public IBinder onBind(Intent intent){return null;}
}

