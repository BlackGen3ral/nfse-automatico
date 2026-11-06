$ErrorActionPreference = 'Stop'
$updater = Join-Path $PSScriptRoot 'atualizar.ps1'
if (!(Test-Path -LiteralPath $updater -PathType Leaf)) { throw 'Atualizador não encontrado.' }
$hostPath = Join-Path $env:WINDIR 'System32/wscript.exe'
if (!(Test-Path -LiteralPath $hostPath -PathType Leaf)) { throw 'O Windows Script Host não está disponível.' }
$launcher = Join-Path $PSScriptRoot 'silencioso.vbs'
$launcherCode = @'
Option Explicit
Dim shell, fso, folder, ps, script, command, quote
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
ps = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
script = fso.BuildPath(folder, "atualizar.ps1")
quote = Chr(34)
command = quote & ps & quote & " -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File " & quote & script & quote
If WScript.Arguments.Count = 1 Then
    If LCase(WScript.Arguments(0)) = "-checknow" Then command = command & " -CheckNow"
End If
WScript.Quit shell.Run(command, 0, True)
'@
[IO.File]::WriteAllText($launcher, $launcherCode, [Text.Encoding]::ASCII)
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$task = 'NFSe-Automatico-Atualizar-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$arguments = '//B //NoLogo "' + $launcher + '"'
$action = New-ScheduledTaskAction -Execute $hostPath -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Verifica atualizações da extensão NFS-e Automático no GitHub.' -Force | Out-Null
Start-ScheduledTask -TaskName $task
Write-Output 'Atualização pelo GitHub ativada para a pasta atual.'
