package com.artho.nfseconecta;
import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.graphics.Color;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import org.json.JSONObject;
import java.net.URL;
import java.net.HttpURLConnection;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
public class MainActivity extends Activity {
 private static final String ORIGIN="https://nfse-conecta.pages.dev";
 private WebView web;
 private UpdateController updates;
 private String pendingClap;
 private boolean foreground;
 private android.webkit.PermissionRequest cameraRequest;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setStatusBarColor(Color.rgb(241,248,244));
  getWindow().setNavigationBarColor(Color.WHITE);
  getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
  getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  android.widget.FrameLayout root=new android.widget.FrameLayout(this);
  web=new WebView(this);
  web.setBackgroundColor(Color.rgb(241,248,244));
  web.setFocusable(true);
  web.setFocusableInTouchMode(true);
  web.setOnTouchListener((view,event)->{
   if(event.getActionMasked()==android.view.MotionEvent.ACTION_DOWN && !web.hasFocus()) web.requestFocus();
   return false;
  });
  root.addView(web,new android.widget.FrameLayout.LayoutParams(
   android.view.ViewGroup.LayoutParams.MATCH_PARENT,android.view.ViewGroup.LayoutParams.MATCH_PARENT));
  if(android.os.Build.VERSION.SDK_INT>=30) root.setOnApplyWindowInsetsListener((view,insets)->{
   int handled=android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout();
   android.graphics.Insets bars=insets.getInsets(handled);
   view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
   return new android.view.WindowInsets.Builder(insets).setInsets(handled,android.graphics.Insets.NONE).build();
  });
  updates=new UpdateController(this);
  web.addJavascriptInterface(new AndroidBridge(),"NfseAndroid");
  web.setWebChromeClient(new android.webkit.WebChromeClient(){
   @Override public void onPermissionRequest(android.webkit.PermissionRequest request){
    Uri origin=request.getOrigin();
    String[] resources=request.getResources();
    if(!"https".equals(origin.getScheme()) || !"nfse-conecta.pages.dev".equals(origin.getHost()) ||
       (origin.getPort()!=-1 && origin.getPort()!=443) || resources.length!=1 ||
       !android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0])){request.deny();return;}
    if(checkSelfPermission(android.Manifest.permission.CAMERA)==android.content.pm.PackageManager.PERMISSION_GRANTED){
     request.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});return;
    }
    if(cameraRequest!=null){request.deny();return;}
    cameraRequest=request;
    requestPermissions(new String[]{android.Manifest.permission.CAMERA},41);
   }
   @Override public void onPermissionRequestCanceled(android.webkit.PermissionRequest request){
    if(cameraRequest==request)cameraRequest=null;
   }
  });
  web.getSettings().setJavaScriptEnabled(true);
  web.getSettings().setDomStorageEnabled(true);
  web.getSettings().setAllowFileAccess(false);
  web.getSettings().setAllowContentAccess(false);
  web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();
    if("https".equals(uri.getScheme())&&"nfse-conecta.pages.dev".equals(uri.getHost())&&!uri.getPath().startsWith("/downloads/"))return false;
    if("https".equals(uri.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}}
    return true;
   }
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
    if(request.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setTitle("Sem conexão")
     .setMessage("Confira a internet e tente novamente.")
     .setPositiveButton("Tentar novamente",(dialog,which)->web.loadUrl(ORIGIN+"/app")).setNegativeButton("Fechar",null).show();
   }
  });
  setContentView(root);
  if(state==null || web.restoreState(state)==null) web.loadUrl(pairingUrl(getIntent()));

 }
 private String pairingUrl(Intent intent) {
  Uri uri=intent.getData();
  if(uri!=null && "https".equals(uri.getScheme()) && "nfse-conecta.pages.dev".equals(uri.getHost()) && "/app".equals(uri.getPath()) && uri.getFragment()!=null && uri.getFragment().matches("pair=[A-F0-9]{12}")) return ORIGIN+"/app#"+uri.getFragment();
  return ORIGIN+"/app";
 }
 public final class AndroidBridge {
  @android.webkit.JavascriptInterface public String version(){return updates.version();}
  @android.webkit.JavascriptInterface public void checkUpdates(){runOnUiThread(()->updates.check(true));}
  @android.webkit.JavascriptInterface public boolean clapSupported(){return true;}
  @android.webkit.JavascriptInterface public String clapStatus(){try{return new JSONObject().put("active",ClapService.active).put("message",ClapService.message).toString();}catch(Exception e){return "{}";}}
  @android.webkit.JavascriptInterface public void stopClapMode(){runOnUiThread(()->{pendingClap=null;stopService(new Intent(MainActivity.this,ClapService.class));ClapService.message="Modo duas palmas desativado.";});}
  @android.webkit.JavascriptInterface public void startClapMode(String input){runOnUiThread(()->{
   String current=web.getUrl();if(!foreground||current==null||!current.split("[?#]",2)[0].equals(ORIGIN+"/app")||input==null||input.length()>1024)return;
   try{JSONObject data=new JSONObject(input);if(!data.getString("token").matches("[a-f0-9]{64}")||data.optString("name").length()>100)return;
    if(checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED||(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)){pendingClap=input;requestPermissions(android.os.Build.VERSION.SDK_INT>=33?new String[]{android.Manifest.permission.RECORD_AUDIO,android.Manifest.permission.POST_NOTIFICATIONS}:new String[]{android.Manifest.permission.RECORD_AUDIO},42);return;}
    launchClaps(input);
   }catch(Exception error){ClapService.message="Não consegui ativar o microfone. Confira a permissão do aplicativo.";}
  });}
  @android.webkit.JavascriptInterface public boolean wakeSupported(){return true;}
  @android.webkit.JavascriptInterface public void wakeComputer(String request){
   if(request==null || request.length()>1024)return;
   runOnUiThread(()->{
    String current=web.getUrl();if(current==null || !current.split("[?#]",2)[0].equals(ORIGIN+"/app"))return;
    String id="";
    try{
     JSONObject data=new JSONObject(request);id=data.getString("id");
     if(!id.matches("[a-f0-9-]{36}"))return;
     final String requestId=id,mac=data.getString("mac"),broadcast=data.getString("broadcast");
     android.net.ConnectivityManager manager=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
     android.net.Network network=manager.getActiveNetwork();
     android.net.NetworkCapabilities capabilities=manager.getNetworkCapabilities(network);
     if(network==null || capabilities==null || !capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI))throw new Exception("Conecte o celular ao Wi-Fi da mesma rede do PC. O acesso de fora ainda precisa ser configurado.");
     new Thread(()->{try{WakeOnLan.send(network,mac,broadcast);wakeResult(requestId,true,"Comando enviado. Aguardando o PC conectar; isso ainda não confirma que ele ligou.");}catch(Exception error){wakeResult(requestId,false,"Não foi possível enviar o comando. Confira se o celular está no mesmo Wi-Fi do PC.");}},"nfse-wake").start();
    }catch(Exception error){wakeResult(id,false,error.getMessage());}
   });
  }
 }
 private void launchClaps(String input)throws Exception{
  android.app.NotificationManager manager=(android.app.NotificationManager)getSystemService(NOTIFICATION_SERVICE);android.app.NotificationChannel channel=manager.getNotificationChannel("clap-mode");
  if(!manager.areNotificationsEnabled()||(channel!=null&&channel.getImportance()==android.app.NotificationManager.IMPORTANCE_NONE))throw new Exception("Ative as notificações para poder parar a escuta e cancelar pedidos.");
  JSONObject data=new JSONObject(input);Intent intent=new Intent(this,ClapService.class).putExtra("token",data.getString("token")).putExtra("name",data.optString("name","PC")).putExtra("pocket",data.optBoolean("pocket",true));
  startForegroundService(intent);
 }
 private void wakeResult(String id,boolean ok,String message){
  runOnUiThread(()->{if(web==null || isFinishing())return;String current=web.getUrl();if(current==null || !current.split("[?#]",2)[0].equals(ORIGIN+"/app"))return;
   try{JSONObject data=new JSONObject();data.put("id",id);data.put("ok",ok);data.put("message",message);web.evaluateJavascript("window.dispatchEvent(new CustomEvent('nfse-wake-result',{detail:"+data.toString()+"}))",null);}catch(Exception ignored){}
  });
 }
 @Override protected void onNewIntent(Intent intent) {
  super.onNewIntent(intent);
  setIntent(intent);
  if(intent.getData()!=null) {
   String link=pairingUrl(intent);
   if(link.contains("#pair=")) web.loadUrl(link);
  }
 }
 @Override protected void onPause(){foreground=false;updates.pause();web.onPause();super.onPause();}
 @Override protected void onResume(){super.onResume();foreground=true;if(web!=null)web.onResume();if(updates!=null)updates.resume();}
 @Override public void onWindowFocusChanged(boolean focused){
  super.onWindowFocusChanged(focused);
  if(focused && web!=null && !web.hasFocus()) web.requestFocus();
 }
 @Override protected void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);
  if(code==42&&pendingClap!=null){String input=pendingClap;pendingClap=null;if(results.length>0&&results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED&&(android.os.Build.VERSION.SDK_INT<33||checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED)){try{launchClaps(input);}catch(Exception e){ClapService.message="Não consegui iniciar a escuta. Abra o app e tente novamente.";}}else ClapService.message="Microfone ou notificações não autorizados. O modo permanece desativado.";}
  if(code==41 && cameraRequest!=null){
   if(results.length==1 && results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED)
    cameraRequest.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});
   else cameraRequest.deny();
   cameraRequest=null;
  }
 }
 @Override protected void onDestroy(){
  if(cameraRequest!=null){cameraRequest.deny();cameraRequest=null;}
  if(updates!=null)updates.close();
  if(web!=null)web.destroy();
  super.onDestroy();
 }
}
