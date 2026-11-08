using System;
using System.Diagnostics;
using System.IO;
internal static class PowerShutdown {
 internal static ProcessStartInfo Command(){
  return new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"shutdown.exe"),"/s /t 0"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
 }
 internal static void Request(){using(var process=Process.Start(Command())){if(process==null)throw new InvalidOperationException("Não foi possível solicitar o desligamento.");if(process.WaitForExit(5000)&&process.ExitCode!=0)throw new InvalidOperationException("O Windows recusou o pedido de desligamento.");}}
}

