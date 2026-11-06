$ErrorActionPreference = 'Stop'
$updater = Join-Path $PSScriptRoot 'atualizar.ps1'
if (!(Test-Path -LiteralPath $updater -PathType Leaf)) { throw 'Atualizador não encontrado.' }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$task = 'NFSe-Automatico-Atualizar-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $updater + '"'
$action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Verifica atualizações da extensão NFS-e Automático no GitHub.' -Force | Out-Null
Write-Output 'Atualização pelo GitHub ativada para a pasta atual.'
