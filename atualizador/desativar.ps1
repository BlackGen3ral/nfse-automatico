$ErrorActionPreference = 'Stop'
$task = 'NFSe-Automatico-Atualizar-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false
}
Write-Output 'Atualização automática desativada.'
