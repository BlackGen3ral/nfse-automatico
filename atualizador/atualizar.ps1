$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$headers = @{ 'User-Agent' = 'NFSe-Automatico-Updater'; Accept = 'application/vnd.github+json' }
$api = 'https://api.github.com/repos/BlackGen3ral/nfse-automatico'
$versionPattern = '^\d{1,5}\.\d{1,5}\.\d{1,5}$'

# Atualize somente com os navegadores fechados para evitar versões misturadas.
if (Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue) { exit 0 }
$local = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$head = Invoke-RestMethod "$api/git/ref/heads/main" -Headers $headers -TimeoutSec 25
$sha = $head.object.sha
if ($sha -cnotmatch '^[0-9a-f]{40}$') { throw 'Referência inválida no GitHub.' }
$manifestResponse = Invoke-WebRequest "https://raw.githubusercontent.com/BlackGen3ral/nfse-automatico/$sha/manifest.json" -UseBasicParsing -Headers $headers -TimeoutSec 25
$remote = $manifestResponse.Content | ConvertFrom-Json
if ($local.version -notmatch $versionPattern -or $remote.version -notmatch $versionPattern) { throw 'Versão inválida.' }
if ([version]$remote.version -le [version]$local.version) { exit 0 }
if ($remote.manifest_version -ne 3 -or $remote.name -cne 'NFS-e Automático') { throw 'O pacote recebido não é o esperado.' }

$commit = Invoke-RestMethod "$api/git/commits/$sha" -Headers $headers -TimeoutSec 25
$tree = $commit.tree.sha
if ($tree -cnotmatch '^[0-9a-f]{40}$') { throw 'Árvore do commit inválida.' }
$entries = Invoke-RestMethod "$api/git/trees/${tree}?recursive=1" -Headers $headers -TimeoutSec 25
if ($entries.truncated) { throw 'O GitHub retornou uma lista incompleta de arquivos.' }
$paths = @(
  'background.js', 'content.js', 'popup.css', 'popup.html', 'popup.js',
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png', 'manifest.json'
)
$entryPoints = @($remote.action.default_popup, $remote.background.service_worker) + @($remote.content_scripts | ForEach-Object { $_.js; $_.css })
if ($entryPoints | Where-Object { $_ -and $_ -cnotin $paths }) { throw 'Esta versão exige um atualizador mais recente.' }

$staged = @{}
foreach ($path in $paths) {
    $entry = $entries.tree | Where-Object { $_.path -ceq $path -and $_.type -eq 'blob' -and $_.mode -eq '100644' }
    if (!$entry -or $entry.sha -cnotmatch '^[0-9a-f]{40}$' -or $entry.size -gt 524288) { throw "Arquivo inválido: $path" }
    $blob = Invoke-RestMethod "$api/git/blobs/$($entry.sha)" -Headers $headers -TimeoutSec 25
    if ($blob.encoding -ne 'base64') { throw "Resposta inválida: $path" }
    $bytes = [Convert]::FromBase64String($blob.content)
    if ($bytes.Length -ne $entry.size) { throw "Tamanho inválido: $path" }
    $prefix = [Text.Encoding]::ASCII.GetBytes("blob $($bytes.Length)" + [char]0)
    $hash = [Security.Cryptography.SHA1]::Create()
    try { $actual = [BitConverter]::ToString($hash.ComputeHash([byte[]]($prefix + $bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
    if ($actual -cne $entry.sha) { throw "O arquivo não corresponde ao commit: $path" }
    $staged[$path] = $bytes
}

if (Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue) { exit 0 }
$current = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ([version]$current.version -ge [version]$remote.version) { exit 0 }
$backup = @{}
$started = [System.Collections.Generic.List[string]]::new()
try {
    foreach ($path in $paths) {
        $target = Join-Path $root $path
        $backup[$path] = if (Test-Path -LiteralPath $target -PathType Leaf) { [IO.File]::ReadAllBytes($target) }
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        $started.Add($path)
        [IO.File]::WriteAllBytes($target, [byte[]]$staged[$path])
    }
}
catch {
    foreach ($path in $started) {
        $target = Join-Path $root $path
        if ($null -eq $backup[$path]) { Remove-Item -LiteralPath $target -ErrorAction SilentlyContinue }
        else { [IO.File]::WriteAllBytes($target, [byte[]]$backup[$path]) }
    }
    throw
}
Write-Output "NFS-e Automático atualizado para $($remote.version)."
