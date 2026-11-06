param([switch]$CheckNow)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$statusPath = Join-Path $PSScriptRoot 'status.json'
$pendingPath = Join-Path $PSScriptRoot 'pendente.json'
$headers = @{ 'User-Agent' = 'NFSe-Automatico-Updater'; Accept = 'application/vnd.github+json' }
$api = 'https://api.github.com/repos/BlackGen3ral/nfse-automatico'
$versionPattern = '^\d{1,5}\.\d{1,5}\.\d{1,5}$'
$paths = @(
    'background.js', 'content.js', 'popup.css', 'popup.html', 'popup.js',
    'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png',
    'atualizador/ativar.ps1', 'atualizador/atualizar.ps1', 'atualizador/desativar.ps1',
    'manifest.json'
)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Read-Json($path) {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    }
}

function Write-Json($path, $data) {
    $temp = "$path.tmp"
    [IO.File]::WriteAllText($temp, ($data | ConvertTo-Json -Depth 6 -Compress), [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($path)) { [IO.File]::Replace($temp, $path, [NullString]::Value) }
    else { [IO.File]::Move($temp, $path) }
}

function Write-Status($state, $version, $checkedAt) {
    Write-Json $statusPath ([ordered]@{
        state = $state
        version = $version
        checkedAt = $checkedAt
        updatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    })
}

function Get-BlobHash([byte[]]$bytes) {
    $prefix = [Text.Encoding]::ASCII.GetBytes("blob $($bytes.Length)" + [char]0)
    $hash = [Security.Cryptography.SHA1]::Create()
    try { [BitConverter]::ToString($hash.ComputeHash([byte[]]($prefix + $bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}

function Get-Update($current) {
    $head = Invoke-RestMethod "$api/git/ref/heads/main" -Headers $headers -TimeoutSec 20
    $sha = $head.object.sha
    if ($sha -cnotmatch '^[0-9a-f]{40}$') { throw 'Referência inválida no GitHub.' }
    $response = Invoke-WebRequest "https://raw.githubusercontent.com/BlackGen3ral/nfse-automatico/$sha/manifest.json" -UseBasicParsing -Headers $headers -TimeoutSec 20
    $remote = $response.Content | ConvertFrom-Json
    if ($remote.version -notmatch $versionPattern) { throw 'Versão inválida.' }
    if ([version]$remote.version -le $current) { return }
    if ($remote.manifest_version -ne 3 -or $remote.name -cne 'NFS-e Automático') { throw 'O pacote recebido não é o esperado.' }

    $entryPoints = @($remote.action.default_popup, $remote.background.service_worker) + @($remote.content_scripts | ForEach-Object { $_.js; $_.css })
    if ($entryPoints | Where-Object { $_ -and $_ -cnotin $paths }) { throw 'Esta versão exige um atualizador mais recente.' }
    $commit = Invoke-RestMethod "$api/git/commits/$sha" -Headers $headers -TimeoutSec 20
    $tree = $commit.tree.sha
    if ($tree -cnotmatch '^[0-9a-f]{40}$') { throw 'Árvore do commit inválida.' }
    $entries = Invoke-RestMethod "$api/git/trees/${tree}?recursive=1" -Headers $headers -TimeoutSec 20
    if ($entries.truncated) { throw 'O GitHub retornou uma lista incompleta de arquivos.' }
    $files = [ordered]@{}
    foreach ($path in $paths) {
        $entry = $entries.tree | Where-Object { $_.path -ceq $path -and $_.type -eq 'blob' -and $_.mode -eq '100644' }
        if (!$entry -or $entry.sha -cnotmatch '^[0-9a-f]{40}$' -or $entry.size -gt 524288) { throw "Arquivo inválido: $path" }
        $blob = Invoke-RestMethod "$api/git/blobs/$($entry.sha)" -Headers $headers -TimeoutSec 20
        if ($blob.encoding -ne 'base64') { throw "Resposta inválida: $path" }
        $bytes = [Convert]::FromBase64String($blob.content)
        if ($bytes.Length -ne $entry.size -or (Get-BlobHash $bytes) -cne $entry.sha) { throw "Conteúdo inválido: $path" }
        $files[$path] = @{ hash = $entry.sha; content = [Convert]::ToBase64String($bytes) }
    }
    return @{ version = $remote.version; commit = $sha; files = $files }
}

function Install-Update($package) {
    $files = @{}
    foreach ($path in $paths) {
        $entry = $package.files.PSObject.Properties[$path].Value
        $bytes = [Convert]::FromBase64String($entry.content)
        if ((Get-BlobHash $bytes) -cne $entry.hash) { throw "Pacote local inválido: $path" }
        $files[$path] = $bytes
    }
    $newManifest = [Text.Encoding]::UTF8.GetString($files['manifest.json']).TrimStart([char]0xfeff) | ConvertFrom-Json
    if ($newManifest.version -ne $package.version -or $newManifest.name -cne 'NFS-e Automático') { throw 'Manifesto inválido.' }
    if (Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue) { return $false }

    $backup = @{}
    $started = [System.Collections.Generic.List[string]]::new()
    try {
        foreach ($path in $paths) {
            $target = Join-Path $root $path
            if (Test-Path -LiteralPath $target -PathType Leaf) { $backup[$path] = [IO.File]::ReadAllBytes($target) }
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            $started.Add($path)
            [IO.File]::WriteAllBytes($target, [byte[]]$files[$path])
        }
    } catch {
        foreach ($path in $started) {
            $target = Join-Path $root $path
            if ($backup.ContainsKey($path)) { [IO.File]::WriteAllBytes($target, [byte[]]$backup[$path]) }
            else { Remove-Item -LiteralPath $target -ErrorAction SilentlyContinue }
        }
        throw
    }
    return $true
}

try {
    $lock = [IO.File]::Open((Join-Path $PSScriptRoot '.update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
} catch [IO.IOException] { return }

$checkedAt = $null
try {
    $local = Read-Json $manifestPath
    if ($local.version -notmatch $versionPattern) { throw 'Versão local inválida.' }
    $current = [version]$local.version
    $status = Read-Json $statusPath
    $checkedAt = $status.checkedAt
    $pending = Read-Json $pendingPath
    if ($pending -and ($pending.version -notmatch $versionPattern -or [version]$pending.version -le $current)) {
        Remove-Item -LiteralPath $pendingPath
        $pending = $null
    }
    $last = [DateTimeOffset]::MinValue
    [void][DateTimeOffset]::TryParse($checkedAt, [ref]$last)
    $minutes = if ($status.state -eq 'error') { 5 } else { 60 }
    if (!$pending -and ($CheckNow -or [DateTimeOffset]::UtcNow -ge $last.AddMinutes($minutes))) {
        $checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
        $download = Get-Update $current
        if ($download) {
            Write-Json $pendingPath $download
            $pending = Read-Json $pendingPath
        }
        else { Write-Status 'current' $local.version $checkedAt }
    }
    if ($pending) {
        if (Install-Update $pending) {
            Remove-Item -LiteralPath $pendingPath
            Write-Status 'current' $pending.version $checkedAt
        }
        elseif ($status.state -ne 'waiting-close' -or $status.version -ne $pending.version) {
            Write-Status 'waiting-close' $pending.version $checkedAt
        }
    }
} catch {
    Write-Status 'error' $null $checkedAt
    throw
} finally { $lock.Dispose() }
