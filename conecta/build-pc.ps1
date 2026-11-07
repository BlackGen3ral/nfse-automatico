$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path downloads | Out-Null
$version=Get-Content versions.json -Raw | ConvertFrom-Json
$source=Join-Path (Get-Location) 'pc/Program.cs'
$text=[IO.File]::ReadAllText($source) -replace 'CurrentVersion="[0-9.]+"',('CurrentVersion="'+$version.pc+'"')
[IO.File]::WriteAllText($source,$text,[Text.UTF8Encoding]::new($false))
$extensionRoot=if(Test-Path '../manifest.json'){'..'}else{'../nfse-git'}
$resource='/resource:'+(Join-Path $extensionRoot 'icons/icon-128.png')+',logo'
& 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe' /nologo /target:winexe /out:.\downloads\NFSe-Conecta-PC.exe /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Security.dll $resource .\pc\Program.cs
if($LASTEXITCODE -ne 0){throw 'Falha ao compilar programa Windows'}
