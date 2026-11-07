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
 }
 @Override protected void onNewIntent(Intent intent) {
  super.onNewIntent(intent);
  setIntent(intent);
  if(intent.getData()!=null) {
   String link=pairingUrl(intent);
   if(link.contains("#pair=")) web.loadUrl(link);
  }
 }
 @Override protected void onPause(){updates.pause();web.onPause();super.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();if(updates!=null)updates.resume();}
 @Override public void onWindowFocusChanged(boolean focused){
  super.onWindowFocusChanged(focused);
  if(focused && web!=null && !web.hasFocus()) web.requestFocus();
 }
 @Override protected void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);
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
