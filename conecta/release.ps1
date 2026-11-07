$ErrorActionPreference='Stop'
$extensionRoot=if(Test-Path '../manifest.json'){'..'}else{'../nfse-git'}
& ./build-pc.ps1
& ./build-android.ps1
$package=Join-Path (Get-Location) 'work/extension-package/NFSe-Automatico'
New-Item -ItemType Directory -Force -Path $package | Out-Null
foreach($name in @('background.js','content.js','manifest.json','popup.html','popup.css','popup.js','README.md','ATIVAR-ATUALIZACOES.cmd')){Copy-Item -LiteralPath (Join-Path $extensionRoot $name) -Destination (Join-Path $package $name) -Force}
foreach($folder in @('icons','atualizador')){New-Item -ItemType Directory -Force -Path (Join-Path $package $folder) | Out-Null}
Get-ChildItem (Join-Path $extensionRoot 'icons') -File | Where-Object Extension -in '.png','.svg' | Copy-Item -Destination (Join-Path $package 'icons') -Force
Get-ChildItem (Join-Path $extensionRoot 'atualizador') -File -Filter '*.ps1' | Copy-Item -Destination (Join-Path $package 'atualizador') -Force
Compress-Archive -Path $package -DestinationPath downloads/NFSe-Automatico.zip -Force
node prepare-updates.mjs
node build.mjs
node --test tests/api.test.mjs tests/extension.test.mjs
if($LASTEXITCODE -ne 0){throw 'Falha nos testes'}
node build-worker.mjs
if($LASTEXITCODE -ne 0){throw 'Falha no pacote Cloudflare'}
Write-Output 'Pacotes prontos. Para publicar, execute npm run deploy.'
