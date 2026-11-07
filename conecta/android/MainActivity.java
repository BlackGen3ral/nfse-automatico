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
 private static final String ORIGIN="https://nfse-conecta.arthurgabrielfera.workers.dev";
 private WebView web;
 private boolean checking=false;
 @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().setStatusBarColor(Color.rgb(241,248,244));getWindow().setNavigationBarColor(Color.WHITE);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);web=new WebView(this);web.setBackgroundColor(Color.rgb(241,248,244));if(android.os.Build.VERSION.SDK_INT>=30)web.setOnApplyWindowInsetsListener((view,insets)->{android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);web.setWebViewClient(new WebViewClient(){
  @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri uri=request.getUrl();if("https".equals(uri.getScheme())&&"nfse-conecta.arthurgabrielfera.workers.dev".equals(uri.getHost())&&!uri.getPath().startsWith("/downloads/"))return false;if("https".equals(uri.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}}return true;}
  @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setTitle("Sem conexão").setMessage("Confira a internet e tente novamente.").setPositiveButton("Tentar novamente",(dialog,which)->web.loadUrl(ORIGIN+"/app")).setNegativeButton("Fechar",null).show();}
 });setContentView(web);if(state==null)web.loadUrl(ORIGIN+"/app");else web.restoreState(state);checkUpdate();}
 @Override protected void onSaveInstanceState(Bundle state){web.saveState(state);super.onSaveInstanceState(state);}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
 private void checkUpdate(){if(checking)return;checking=true;new Thread(()->{try{HttpURLConnection conn=(HttpURLConnection)new URL(ORIGIN+"/updates.json").openConnection();conn.setConnectTimeout(10000);conn.setReadTimeout(10000);conn.setInstanceFollowRedirects(false);ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream input=conn.getInputStream()){byte[] buffer=new byte[2048];int n;while((n=input.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>32768)throw new Exception("Manifesto grande");}}finally{conn.disconnect();}JSONObject item=new JSONObject(bytes.toString("UTF-8")).getJSONObject("android");int version=item.getInt("versionCode");String link=item.getString("url");PackageInfo installed=getPackageManager().getPackageInfo(getPackageName(),0);if(version>installed.versionCode&&link.startsWith(ORIGIN+"/downloads/")&&link.endsWith(".apk"))runOnUiThread(()->new AlertDialog.Builder(this).setTitle("Atualização disponível").setMessage("Uma nova versão do NFS-e Conecta está disponível. Baixe e confirme a instalação no Android.").setPositiveButton("Atualizar",(dialog,which)->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(link)))).setNegativeButton("Depois",null).show());}catch(Exception ignored){}finally{checking=false;}}).start();}
}
