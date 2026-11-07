$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path downloads | Out-Null
$version=Get-Content versions.json -Raw | ConvertFrom-Json
$source=Join-Path (Get-Location) 'pc/Program.cs'
$text=[IO.File]::ReadAllText($source) -replace 'CurrentVersion="[0-9.]+"',('CurrentVersion="'+$version.pc+'"')
[IO.File]::WriteAllText($source,$text,[Text.UTF8Encoding]::new($false))
$extensionRoot=if(Test-Path '../manifest.json'){'..'}else{'../nfse-git'}
$resource='/resource:'+(Join-Path $extensionRoot 'icons/icon-128.png')+',logo'
& './toolchain/roslyn/tasks/net472/csc.exe' /nologo /target:winexe /win32icon:pc/app.ico /define:NET40,NET35_OR_GREATER /out:.\downloads\NFSe-Conecta-PC.exe /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Security.dll $resource .\pc\Program.cs .\pc\CertificatePolicy.cs .\pc\PcUpdates.cs .\pc\vendor\QRCodeGenerator.cs .\pc\vendor\QRCodeData.cs .\pc\vendor\PayloadGenerator.cs .\pc\vendor\DataTooLongException.cs .\pc\vendor\StreamExtensions.cs .\pc\vendor\StringExtensions.cs
if($LASTEXITCODE -ne 0){throw 'Falha ao compilar programa Windows'}
