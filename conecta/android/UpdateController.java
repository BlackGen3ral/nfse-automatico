package com.artho.nfseconecta;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.*;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.Settings;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;

final class UpdateController {
 private static final String ORIGIN="https://nfse-conecta.pages.dev";
 private final Activity activity;
 private final SharedPreferences preferences;
 private final DownloadManager downloads;
 private volatile boolean checking, verifying, foreground, offered, waitingPermission;
 private long lastCheck;
 private final BroadcastReceiver receiver=new BroadcastReceiver(){
  @Override public void onReceive(Context context,Intent intent){
   if(intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1)==preferences.getLong("id",-2)) inspectDownload();
  }
 };
 UpdateController(Activity activity){
  this.activity=activity;
  preferences=activity.getSharedPreferences("updates",Context.MODE_PRIVATE);
  downloads=(DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE);
  IntentFilter filter=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
  if(android.os.Build.VERSION.SDK_INT>=33)activity.registerReceiver(receiver,filter,Context.RECEIVER_EXPORTED);
  else activity.registerReceiver(receiver,filter);
 }
 String version(){
  try{return activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).versionName;}
  catch(Exception error){return "";}
 }
 void resume(){
  foreground=true;
  if(waitingPermission && activity.getPackageManager().canRequestPackageInstalls()){waitingPermission=false;offered=false;}
  inspectDownload();
  check(false);
 }
 void pause(){foreground=false;}
 void close(){activity.unregisterReceiver(receiver);}
 void check(boolean manual){
  if(checking || verifying || (!manual && System.currentTimeMillis()-lastCheck<900000))return;
  checking=true;lastCheck=System.currentTimeMillis();
  if(manual)offered=false;
  new Thread(()->{
   try{
    HttpURLConnection connection=(HttpURLConnection)new URL(ORIGIN+"/updates.json").openConnection();
    connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    try(InputStream input=connection.getInputStream()){
     byte[] buffer=new byte[2048];int count;
     while((count=input.read(buffer))!=-1){bytes.write(buffer,0,count);if(bytes.size()>32768)throw new IOException("Manifesto inválido");}
    }finally{connection.disconnect();}
    JSONObject item=new JSONObject(bytes.toString("UTF-8")).getJSONObject("android");
    int next=item.getInt("versionCode");
    PackageInfo installed=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0);
    if(next<=installed.versionCode){if(manual)message("Você está usando a versão mais recente.");return;}
    String link=item.getString("url"),hash=item.getString("sha256");
    if(!link.equals(ORIGIN+"/downloads/NFSe-Conecta.apk") || !hash.matches("[a-f0-9]{64}"))throw new IOException("Atualização inválida");
    activity.runOnUiThread(()->{
     try {
     if(verifying)return;
     if(preferences.getInt("version",0)==next && preferences.getLong("id",-1)!=-1){inspectDownload();return;}
     long old=preferences.getLong("id",-1);
     if(old!=-1)downloads.remove(old);
     File directory=activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
     if(directory==null){message("O armazenamento está indisponível. Tente novamente.");return;}
     File file=new File(directory,"update.apk");
     if(file.exists()&&!file.delete()){message("Não foi possível preparar a atualização.");return;}
     DownloadManager.Request request=new DownloadManager.Request(Uri.parse(link))
      .setTitle("Atualização do NFS-e Conecta").setDescription("Baixando a nova versão")
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      .setDestinationInExternalFilesDir(activity,Environment.DIRECTORY_DOWNLOADS,"update.apk");
     long id=downloads.enqueue(request);
     preferences.edit().putLong("id",id).putInt("version",next).putString("sha256",hash).apply();
     if(manual)message("Atualização em download. O Android pedirá a confirmação da instalação.");
     } catch(Exception error){message("Não foi possível iniciar o download da atualização.");}
    });
   }catch(Exception error){if(manual)message("Não foi possível verificar a atualização. Confira a conexão.");}
   finally{checking=false;}
  }).start();
 }
 private void inspectDownload(){
  final long id=preferences.getLong("id",-1);
  if(id==-1 || verifying || offered || !foreground)return;
  try(Cursor cursor=downloads.query(new DownloadManager.Query().setFilterById(id))){
   if(!cursor.moveToFirst()){preferences.edit().clear().apply();return;}
   int state=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
   if(state==DownloadManager.STATUS_FAILED){preferences.edit().clear().apply();message("O download falhou. Toque em Verificar atualização para tentar novamente.");return;}
   if(state!=DownloadManager.STATUS_SUCCESSFUL)return;
  } catch(Exception error){message("Não foi possível consultar o download da atualização.");return;}
  verifying=true;
  new Thread(()->{
   try{
    File file=new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),"update.apk");
    if(file.length()>50*1024*1024)throw new IOException("Arquivo muito grande");
    MessageDigest digest=MessageDigest.getInstance("SHA-256");
    try(InputStream input=new FileInputStream(file)){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)digest.update(buffer,0,n);}
    StringBuilder hash=new StringBuilder();for(byte value:digest.digest())hash.append(String.format("%02x",value&255));
    if(!hash.toString().equals(preferences.getString("sha256","")))throw new IOException("Integridade inválida");
    PackageInfo archive=activity.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(),android.content.pm.PackageManager.GET_SIGNATURES);
    PackageInfo installed=activity.getPackageManager().getPackageInfo(activity.getPackageName(),android.content.pm.PackageManager.GET_SIGNATURES);
    if(archive==null || !archive.packageName.equals(installed.packageName) || archive.versionCode!=preferences.getInt("version",0) ||
      !java.util.Arrays.equals(archive.signatures,installed.signatures))throw new IOException("Assinatura inválida");
    if(archive.versionCode<=installed.versionCode){preferences.edit().clear().apply();return;}
    activity.runOnUiThread(()->{
     if(!foreground || activity.isFinishing())return;
     if(!activity.getPackageManager().canRequestPackageInstalls()){
      offered=true;
      new AlertDialog.Builder(activity).setTitle("Atualização pronta")
       .setMessage("Autorize o NFS-e Conecta a solicitar a instalação. O Android ainda pedirá sua confirmação.")
       .setPositiveButton("Autorizar",(dialog,which)->{
        waitingPermission=true;
        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));
       }).setNegativeButton("Depois",null).show();
      return;
     }
     Uri uri=downloads.getUriForDownloadedFile(id);
     if(uri==null)return;
     offered=true;
     try{
      activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive")
       .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
     }catch(Exception error){offered=false;message("Não foi possível abrir o instalador do Android.");}
    });
   }catch(Exception error){if(preferences.getLong("id",-1)==id)preferences.edit().clear().apply();message("A atualização não passou na verificação. Tente baixar novamente.");}
   finally{verifying=false;}
  }).start();
 }
 private void message(String text){activity.runOnUiThread(()->{if(!activity.isFinishing())android.widget.Toast.makeText(activity,text,android.widget.Toast.LENGTH_LONG).show();});}
}
