using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class PcUpdatesCheck {
 sealed class Handler : HttpMessageHandler {
  public int Calls;
  internal readonly byte[] Bytes=Encoding.UTF8.GetBytes("Test data for updater integrity checks");
  protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken) {
   Calls++;return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new ByteArrayContent(Bytes)});
  }
 }
 public static async Task Run(string folder) {
  var handler=new Handler();
  using(var client=new HttpClient(handler))
  using(var hash=SHA256.Create()) {
   var digest=BitConverter.ToString(hash.ComputeHash(handler.Bytes)).Replace("-","").ToLowerInvariant();
   var item=new Dictionary<string,object>{{"version","1.4.0"},{"sha256",digest},{"url","https://test.local/downloads/NFSe-Conecta-PC.exe"}};
   var staged=await PcUpdates.Stage(client,item,"https://test.local",folder);
   if(!PcUpdates.Matches(staged,digest))throw new Exception("Invalid staged update");
   await PcUpdates.Stage(client,item,"https://test.local",folder);
   if(handler.Calls!=1)throw new Exception("Valid cache was downloaded twice");
   item["sha256"]=new string('0',64);
   bool rejected=false;
   try{await PcUpdates.Stage(client,item,"https://test.local",folder);}catch(System.IO.InvalidDataException){rejected=true;}
   if(!rejected || !PcUpdates.Matches(staged,digest))throw new Exception("Corrupt update changed the valid cache");
   item["url"]="https://untrusted.example/downloads/NFSe-Conecta-PC.exe";
   rejected=false;
   try{await PcUpdates.Stage(client,item,"https://test.local",folder);}catch(System.IO.InvalidDataException){rejected=true;}
   if(!rejected)throw new Exception("External update address accepted");
  }
 }
}
