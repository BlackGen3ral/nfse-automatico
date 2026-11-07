using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

internal sealed class PcApiException : Exception {
 internal readonly HttpStatusCode Status;
 internal PcApiException(HttpStatusCode status,string message):base(String.IsNullOrWhiteSpace(message)?"O serviço está indisponível.":message){Status=status;}
}
internal static class PcUpdates {
 internal static async Task<string> Stage(HttpClient client,Dictionary<string,object> item,string origin,string folder) {
  Version version;
  if(!Version.TryParse(Convert.ToString(item["version"]),out version))throw new InvalidDataException("Versão inválida.");
  var expected=Convert.ToString(item["sha256"]);
  if(!Regex.IsMatch(expected??"","^[a-fA-F0-9]{64}$"))throw new InvalidDataException("Hash inválido.");
  var uri=new Uri(Convert.ToString(item["url"]));
  if(uri.GetLeftPart(UriPartial.Authority)!=origin || uri.AbsolutePath!="/downloads/NFSe-Conecta-PC.exe" || uri.Query!="" || uri.Fragment!="")
   throw new InvalidDataException("Endereço de atualização inválido.");
  var directory=Path.Combine(folder,"versions",version.ToString());
  Directory.CreateDirectory(directory);
  var target=Path.Combine(directory,"NFSe-Conecta-PC.exe");
  if(File.Exists(target) && Matches(target,expected))return target;
  var temporary=Path.Combine(directory,Guid.NewGuid().ToString("N")+".tmp");
  try {
   using(var response=await client.GetAsync(uri,HttpCompletionOption.ResponseHeadersRead)) {
    response.EnsureSuccessStatusCode();
    using(var input=await response.Content.ReadAsStreamAsync())
    using(var output=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
     var bytes=new byte[65536];int count;long total=0;
     while((count=await input.ReadAsync(bytes,0,bytes.Length))>0) {
      total+=count;if(total>32*1024*1024)throw new InvalidDataException("Atualização muito grande.");
      await output.WriteAsync(bytes,0,count);
     }
    }
   }
   if(!Matches(temporary,expected))throw new InvalidDataException("O download não passou na verificação de integridade.");
   if(File.Exists(target))File.Delete(target);
   File.Move(temporary,target);
   return target;
  } finally {if(File.Exists(temporary))File.Delete(temporary);}
 }
 internal static bool Matches(string path,string expected) {
  using(var input=File.OpenRead(path))
  using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(input)).Replace("-","").Equals(expected,StringComparison.OrdinalIgnoreCase);
 }
}
