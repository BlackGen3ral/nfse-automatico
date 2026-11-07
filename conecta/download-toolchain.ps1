$ErrorActionPreference='Stop'
$root=Join-Path (Get-Location) 'toolchain'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$jdk=Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows'
$package=$jdk[0].binary.package
Invoke-WebRequest $package.link -OutFile (Join-Path $root 'jdk.zip')
if((Get-FileHash (Join-Path $root 'jdk.zip') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.checksum){throw 'JDK inválido'}
& 'C:/Program Files/7-Zip/7z.exe' x (Join-Path $root 'jdk.zip') ('-o'+(Join-Path $root 'jdk')) -y | Out-Null
[xml]$repo=(Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-1.xml').Content
foreach($name in @('build-tools;35.0.0','platforms;android-35')){
 $item=$repo.SelectNodes('//*[local-name()="remotePackage"]') | Where-Object {$_.path -eq $name} | Select-Object -First 1
 $archive=$item.archives.archive | Where-Object {(!$_.('host-os')) -or $_.('host-os') -eq 'windows'} | Select-Object -First 1
 $url='https://dl.google.com/android/repository/'+$archive.complete.url
 $zip=Join-Path $root (($name -replace '[;.]','-')+'.zip')
 Invoke-WebRequest $url -OutFile $zip
 & 'C:/Program Files/7-Zip/7z.exe' x $zip ('-o'+(Join-Path $root 'sdk')) -y | Out-Null
}
Write-Output 'Ferramentas Android prontas.'

New-Item -ItemType Directory -Force -Path (Join-Path $root 'roslyn') | Out-Null
Invoke-WebRequest 'https://api.nuget.org/v3-flatcontainer/microsoft.net.compilers.toolset/4.8.0/microsoft.net.compilers.toolset.4.8.0.nupkg' -OutFile (Join-Path $root 'roslyn/compiler.zip')
Expand-Archive -LiteralPath (Join-Path $root 'roslyn/compiler.zip') -DestinationPath (Join-Path $root 'roslyn') -Force