$ErrorActionPreference = 'Stop'
$task = 'NFSe-Automatico-Atualizar-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false
}
Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'status.json') -ErrorAction SilentlyContinue
Write-Output 'Atualização automática desativada.'
