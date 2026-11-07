using System;
using System.Collections.Generic;
using System.Drawing;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;
[assembly: AssemblyTitle("NFS-e Conecta")]
[assembly: AssemblyVersion(Program.CurrentVersion)]
[assembly: AssemblyFileVersion(Program.CurrentVersion)]
internal static class Program {
 public const string CurrentVersion="1.2.0";
 public const string Site="https://nfse-conecta.pages.dev";
 public static readonly string Folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"NFSeConecta");
 [STAThread] static void Main(string[] args) {
  Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
  if(Array.IndexOf(args,"--configure-certificate")>=0) {
   try{CertificatePolicy.Configure(null);}
   catch(Exception error){MessageBox.Show(error.Message,"Configuração do certificado",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
   return;
  }
  bool created; using(var mutex=new Mutex(false,"Local\\NFSeConecta-"+Environment.UserName,out created)) {
   bool acquired; try { acquired=mutex.WaitOne(0); } catch(AbandonedMutexException) { acquired=true; }
   if(!acquired){MessageBox.Show("O NFS-e Conecta já está aberto. Procure o ícone perto do relógio do Windows.","NFS-e Conecta");return;}
   Directory.CreateDirectory(Folder);
   Application.Run(new ConectaForm(Array.IndexOf(args,"--background")>=0));
  }
 }
}
internal sealed class ConectaForm:Form {
 readonly HttpClient http=new HttpClient(new HttpClientHandler { AllowAutoRedirect=false }) { Timeout=TimeSpan.FromSeconds(15) };
 readonly object gate=new object();
 readonly SemaphoreSlim executionGate=new SemaphoreSlim(1,1);
 Dictionary<string,object> config=new Dictionary<string,object>();
 Dictionary<string,object> job;
 bool delivered;
 volatile bool exit,updating;
 string lastId="",pendingState="",pendingText="",announcedVersion="";
 DateTime jobStarted;
 NotifyIcon tray;
 Label status,code;
 PictureBox pairingQr;
 DateTime qrExpires;
 System.Windows.Forms.Timer qrTimer;
 Button pair,open,updates;
 CheckBox startup;
 TcpListener listener;
 readonly bool background;
 static string Str(Dictionary<string,object> data,string key){return data.ContainsKey(key)&&data[key]!=null?Convert.ToString(data[key]):"";}
 static string Json(object value){return new JavaScriptSerializer().Serialize(value);}
 static Dictionary<string,object> Parse(string value){return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(value);}
 static string RandomKey(){var b=new byte[32];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(b);return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
 public ConectaForm(bool hidden){
  background=hidden;Text="NFS-e Conecta";ClientSize=new Size(480,748);MinimumSize=new Size(496,787);BackColor=Color.FromArgb(245,251,247);Font=new Font("Segoe UI",10);StartPosition=FormStartPosition.CenterScreen;
  try{using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("logo")){var bitmap=new Bitmap(s);Icon=Icon.FromHandle(bitmap.GetHicon());}}catch{}
  var heading=new Label(){Text="NFS-e Conecta",Font=new Font("Segoe UI",22,FontStyle.Bold),ForeColor=Color.FromArgb(19,111,64),AutoSize=true,Location=new Point(28,25)};Controls.Add(heading);
  Controls.Add(new Label(){Text="Seu Android conectado a este computador",AutoSize=true,Location=new Point(30,72),ForeColor=Color.FromArgb(82,113,93)});
  status=new Label(){Text="Conectando ao serviço…",Location=new Point(30,112),Size=new Size(420,58)};Controls.Add(status);
  Controls.Add(new Label(){Text="CÓDIGO DE PAREAMENTO",Font=new Font("Segoe UI",8,FontStyle.Bold),AutoSize=true,Location=new Point(30,183),ForeColor=Color.FromArgb(65,125,83)});
  code=new Label(){Text="…",Font=new Font("Consolas",25,FontStyle.Bold),Location=new Point(26,207),Size=new Size(428,48),TextAlign=ContentAlignment.MiddleCenter,BackColor=Color.White};Controls.Add(code);
  pairingQr=new PictureBox(){Location=new Point(134,265),Size=new Size(212,212),SizeMode=PictureBoxSizeMode.CenterImage,BackColor=Color.White};Controls.Add(pairingQr);
  Controls.Add(new Label(){Text="Leia o QR com a câmera do celular para conectar.",AutoSize=true,Location=new Point(31,487)});
  pair=Button("Gerar novo QR code",518);pair.Click+=async delegate{try{await Pair();}catch(Exception){SetStatus("Não foi possível gerar o código. Confira a conexão.");}};
  open=Button("Abrir portal e conectar extensão",568);open.Click+=delegate{OpenPortal();};
  updates=Button("Verificar atualizações",618);updates.Click+=async delegate{await CheckUpdates(true);};
  updates.Width=200;
  var certificate=Button("Configurar certificado",618);
  certificate.Location=new Point(240,618);certificate.Width=210;
  certificate.Click+=delegate{
   try{CertificatePolicy.Configure(this);}
   catch(UnauthorizedAccessException){
    try{Process.Start(new ProcessStartInfo(Application.ExecutablePath,"--configure-certificate"){UseShellExecute=true,Verb="runas"});}
    catch(System.ComponentModel.Win32Exception){SetStatus("A configuração do certificado precisa da autorização do Windows.");}
   }
   catch(Exception error){MessageBox.Show(this,error.Message,"Configuração do certificado",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
  };
  startup=new CheckBox(){Text="Iniciar com o Windows",AutoSize=true,Location=new Point(31,674)};Controls.Add(startup);
  using(var key=Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")){startup.Checked=key!=null&&key.GetValue("NFSeConecta")!=null;}
  startup.CheckedChanged+=delegate{try{using(var key=Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")){if(startup.Checked)key.SetValue("NFSeConecta","\""+Application.ExecutablePath+"\" --background");else key.DeleteValue("NFSeConecta",false);}}catch{SetStatus("Não foi possível alterar o início automático.");}};
  Controls.Add(new Label(){Text="Versão "+Program.CurrentVersion+" · Ao fechar, continua perto do relógio.",AutoSize=true,Location=new Point(31,714),Font=new Font("Segoe UI",8),ForeColor=Color.Gray});
  qrTimer=new System.Windows.Forms.Timer(){Interval=1000};
  qrTimer.Tick+=delegate{if(pairingQr.Image!=null && DateTime.UtcNow>=qrExpires){pairingQr.Image.Dispose();pairingQr.Image=null;code.Text="QR expirado";}};
  qrTimer.Start();
  tray=new NotifyIcon(){Icon=Icon,Text="NFS-e Conecta",Visible=true};var menu=new ContextMenuStrip();menu.Items.Add("Abrir",null,delegate{ShowWindow();});menu.Items.Add("Sair",null,delegate{exit=true;Application.Exit();});tray.ContextMenuStrip=menu;tray.DoubleClick+=delegate{ShowWindow();};
  FormClosing+=delegate(object sender,FormClosingEventArgs e){if(!exit){e.Cancel=true;Hide();}};
  Shown+=async delegate{if(background)Hide();await Initialize();};
 }
 Button Button(string text,int top){var b=new Button(){Text=text,Location=new Point(30,top),Size=new Size(420,40),FlatStyle=FlatStyle.Flat,BackColor=Color.White,ForeColor=Color.FromArgb(17,118,64)};b.FlatAppearance.BorderColor=Color.FromArgb(186,222,198);Controls.Add(b);return b;}
 void ShowWindow(){Show();WindowState=FormWindowState.Normal;Activate();}
 void SetStatus(string value){if(IsDisposed||!IsHandleCreated)return;if(InvokeRequired){BeginInvoke(new Action<string>(SetStatus),value);return;}status.Text=value;}
 void Save(){var bytes=Encoding.UTF8.GetBytes(Json(config));File.WriteAllBytes(Path.Combine(Program.Folder,"settings.bin"),ProtectedData.Protect(bytes,null,DataProtectionScope.CurrentUser));}
 async Task<Dictionary<string,object>> Api(string path,object data,bool authenticated){
  using(var message=new HttpRequestMessage(HttpMethod.Post,Program.Site+path)){
   if(authenticated)message.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",Str(config,"pcToken"));
   message.Content=new StringContent(Json(data),Encoding.UTF8,"application/json");using(var response=await http.SendAsync(message)){var parsed=Parse(await response.Content.ReadAsStringAsync());if(!response.IsSuccessStatusCode)throw new Exception("Serviço indisponível.");return parsed;}
  }
 }
 async Task Initialize(){
  try {
   var file=Path.Combine(Program.Folder,"settings.bin");if(File.Exists(file))config=Parse(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(file),null,DataProtectionScope.CurrentUser)));
   if(!config.ContainsKey("pcToken")){config=await Api("/api/register",new{name=Environment.MachineName},false);config["bridgeKey"]=RandomKey();Save();ShowPairCode(Str(config,"pairCode"));}
   else {code.Text="Já configurado";}
   if(!config.ContainsKey("bridgeKey")){config["bridgeKey"]=RandomKey();Save();}
   lastId=Str(config,"lastJob");
   if(lastId!="")try{await Api("/api/pc/progress",new{id=lastId,state="error",message="O programa do PC foi reiniciado. Confira o portal antes de enviar novamente."},true);}catch{}
   listener=new TcpListener(IPAddress.Loopback,17846);listener.Start();RunBackground(() => { AcceptLoop(); return Task.FromResult(0); });
   SetStatus("Conectado. Pareie o Android e mantenha a extensão instalada no Chrome.");RunBackground(PollLoop);
  }catch{SetStatus("Não foi possível conectar. Confira a internet e abra novamente. Se houver outra conexão local na porta 17846, feche-a.");}
 }
 void RunBackground(Func<Task> action) {
  Task.Run(action).ContinueWith(task => {
   if(task.Exception != null) SetStatus("A conexão em segundo plano foi interrompida. Feche pelo ícone e abra novamente.");
  },TaskContinuationOptions.OnlyOnFaulted);
 }
 async Task Pair(){pair.Enabled=false;try{var data=await Api("/api/pc/pair",new{},true);ShowPairCode(Str(data,"pairCode"));SetStatus("Leia o QR com a câmera do celular em até 5 minutos. Gerar outro QR desconecta o pareamento anterior.");}finally{pair.Enabled=true;}}
 void ShowPairCode(string value) {
  code.Text=value;
  using(var generator=new QRCoder.QRCodeGenerator())
  using(var data=generator.CreateQrCode(Program.Site+"/app#pair="+value,QRCoder.QRCodeGenerator.ECCLevel.M)) {
   int scale=212/data.ModuleMatrix.Count;
   var image=new Bitmap(data.ModuleMatrix.Count*scale,data.ModuleMatrix.Count*scale);
   using(var graphics=Graphics.FromImage(image)) {
    graphics.Clear(Color.White);
    for(int y=0;y<data.ModuleMatrix.Count;y++)
     for(int x=0;x<data.ModuleMatrix.Count;x++)
      if(data.ModuleMatrix[y][x])graphics.FillRectangle(Brushes.Black,x*scale,y*scale,scale,scale);
   }
   if(pairingQr.Image!=null)pairingQr.Image.Dispose();
   pairingQr.Image=image;
   qrExpires=DateTime.UtcNow.AddMinutes(5);
  }
 }
 void OpenPortal(){
  var bridgeKey=Str(config,"bridgeKey");
  if(!Regex.IsMatch(bridgeKey,@"\A[a-f0-9]{64}\z")) {
   SetStatus("A conexão com o navegador ainda não está pronta.");
   return;
  }
  var url="https://www.nfse.gov.br/EmissorNacional/#nfse-connect="+bridgeKey;
  var chrome=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Google\\Chrome\\Application\\chrome.exe");
  if(!File.Exists(chrome))chrome=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Google\\Chrome\\Application\\chrome.exe");
  if(!File.Exists(chrome)){SetStatus("Instale o Google Chrome e a extensão NFS-e Automático para continuar.");return;}
  try {
   Process.Start(new ProcessStartInfo(chrome,"--new-tab \""+url+"\"") { UseShellExecute=false });
  } catch (System.ComponentModel.Win32Exception) {
   SetStatus("Não foi possível abrir o Google Chrome.");
  }
 }
 async Task ClaimJob() {
  await executionGate.WaitAsync();
  try {
   if(updating || exit) return;
   var data=await Api("/api/pc/poll",new{},true);
   if(!data.ContainsKey("job") || data["job"]==null) return;
   var incoming=(Dictionary<string,object>)data["job"];
   var id=Str(incoming,"id");
   bool accept;
   lock(gate) {
    accept=job==null && id!=lastId;
    if(accept) {
     lastId=id;
     config["lastJob"]=id;
     Save();
     job=incoming;
     delivered=false;
     jobStarted=DateTime.UtcNow;
    }
   }
   if(accept) {
    SetStatus("Solicitação recebida. Entrando no portal com certificado e preparando a etapa Pessoas. Se o certificado pedir PIN, confirme no PC.");
    BeginInvoke(new Action(OpenPortal));
   } else {
    await Api("/api/pc/progress",new{id=id,state="error",message="Uma execução anterior foi interrompida. Confira o PC antes de enviar novamente."},true);
   }
  } finally { executionGate.Release(); }
 }
 async Task PollLoop() {
  DateTime nextUpdate=DateTime.UtcNow.AddMinutes(1);
  while(!exit) {
   try {
    await ClaimJob();
    string state,text,idCurrent;
    lock(gate) {
     if(job!=null && (DateTime.UtcNow-jobStarted).TotalMinutes>9) {
      pendingState="error";
      pendingText="O preenchimento não terminou no prazo. Confira o portal antes de enviar outra solicitação.";
     }
     state=pendingState;
     text=pendingText;
     idCurrent=job==null?"":Str(job,"id");
    }
    if(state!="" && idCurrent!="") {
     await Api("/api/pc/progress",new{id=idCurrent,state=state,message=text},true);
     lock(gate) {
      if(pendingState==state && pendingText==text) {
       pendingState="";
       pendingText="";
       if(state=="review" || state=="error") job=null;
      }
     }
     SetStatus(text);
    }
    if(DateTime.UtcNow>=nextUpdate) {
     await CheckUpdates(false);
     nextUpdate=DateTime.UtcNow.AddHours(1);
    }
   } catch { SetStatus("Reconectando ao serviço. Os dados da solicitação atual continuam preservados."); }
   await Task.Delay(3000);
  }
 }
 void AcceptLoop(){while(!exit){try{var client=listener.AcceptTcpClient();Task.Run(()=>ProcessConnection(client));}catch{if(exit)return;}}}
 void ProcessConnection(TcpClient client){using(client){try{
  var stream=client.GetStream();stream.ReadTimeout=5000;stream.WriteTimeout=5000;var header=new List<byte>();int value;while(header.Count<8192&&(value=stream.ReadByte())>=0){header.Add((byte)value);var n=header.Count;if(n>=4&&header[n-4]==13&&header[n-3]==10&&header[n-2]==13&&header[n-1]==10)break;}
  var lines=Encoding.ASCII.GetString(header.ToArray()).Split(new[]{"\r\n"},StringSplitOptions.None);var parts=lines[0].Split(' ');if(parts.Length<2)return;var map=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(var line in lines){var colon=line.IndexOf(':');if(colon>0)map[line.Substring(0,colon)]=line.Substring(colon+1).Trim();}
  var auth=map.ContainsKey("Authorization")?map["Authorization"]:"";var expected="Bearer "+Str(config,"bridgeKey");int diff=auth.Length^expected.Length;for(int i=0;i<Math.Min(auth.Length,expected.Length);i++)diff|=auth[i]^expected[i];if(diff!=0){Respond(stream,401,new{error="Não autorizado"});return;}
  int length=0;if(map.ContainsKey("Content-Length"))Int32.TryParse(map["Content-Length"],out length);if(length<0||length>16384){Respond(stream,413,new{error="Dados grandes"});return;}
  var bytes=new byte[length];int offset=0;while(offset<length){var read=stream.Read(bytes,offset,length-offset);if(read<=0)return;offset+=read;}
  object result=new{ok=true};if(parts[0]=="GET"&&parts[1]=="/job"){lock(gate){result=new{job=job!=null&&!delivered?job:null};}if(job==null)SetStatus("Extensão conectada. Você já pode enviar uma nota pelo celular.");}
  else if(parts[0]=="POST"&&(parts[1]=="/ack"||parts[1]=="/progress")){var data=Parse(Encoding.UTF8.GetString(bytes));lock(gate){if(job!=null&&Str(data,"id")==Str(job,"id")){if(parts[1]=="/ack"){delivered=true;pendingState="running";pendingText="Conferindo a sessão e os dados no portal…";}else{var phase=Str(data,"phase");pendingState=phase=="review-ready"?"review":phase=="error"?"error":"running";pendingText=Str(data,"text");}}}}
  else {Respond(stream,404,new{error="Endereço inválido"});return;}
  Respond(stream,200,result);
 }catch{} }}
 void Respond(NetworkStream stream,int statusCode,object result){var bytes=Encoding.UTF8.GetBytes(Json(result));var h=Encoding.ASCII.GetBytes("HTTP/1.1 "+statusCode+" OK\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: "+bytes.Length+"\r\nConnection: close\r\n\r\n");stream.Write(h,0,h.Length);stream.Write(bytes,0,bytes.Length);}
 async Task CheckUpdates(bool manual) {
  await executionGate.WaitAsync();
  try {
   lock(gate) {
    if(job!=null) {
     if(manual) SetStatus("Conclua a solicitação atual antes de verificar atualizações.");
     return;
    }
    updating=true;
   }
   var manifest=Parse(await http.GetStringAsync(Program.Site+"/updates.json"));
   var pc=(Dictionary<string,object>)manifest["pc"];
   if(pc.ContainsKey("available") && !Convert.ToBoolean(pc["available"])) {
    if(manual) SetStatus("A versão Windows está em revisão.");
    return;
   }
   var latest=Str(pc,"version");
   if(new Version(latest)<=new Version(Program.CurrentVersion)) {
    if(manual) SetStatus("Você está usando a versão mais recente.");
    return;
   }
   SetStatus("Versão "+latest+" disponível na central de downloads.");
   if(manual) {
    if(MessageBox.Show(this,"A versão "+latest+" está disponível. Abrir a central de downloads?","Atualização disponível",MessageBoxButtons.YesNo,MessageBoxIcon.Information)==DialogResult.Yes) {
     Process.Start(new ProcessStartInfo(Program.Site+"/#downloads") {UseShellExecute=true});
    }
   } else if(announcedVersion!=latest && IsHandleCreated && !IsDisposed) {
    announcedVersion=latest;
    BeginInvoke(new Action(() => tray.ShowBalloonTip(5000,"NFS-e Conecta","Nova versão disponível. Abra o programa e clique em Verificar atualizações.",ToolTipIcon.Info)));
   }
  } catch {
   if(manual) SetStatus("Não foi possível verificar a atualização. Tente novamente mais tarde.");
  } finally {
   updating=false;
   executionGate.Release();
  }
 }
 protected override void OnFormClosed(FormClosedEventArgs e){exit=true;qrTimer.Dispose();if(pairingQr.Image!=null)pairingQr.Image.Dispose();if(listener!=null)listener.Stop();tray.Visible=false;tray.Dispose();http.Dispose();base.OnFormClosed(e);}
}
