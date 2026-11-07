$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path downloads | Out-Null
$version=Get-Content versions.json -Raw | ConvertFrom-Json
$manifestFile=Join-Path (Get-Location) 'android/AndroidManifest.xml'
$manifestText=[IO.File]::ReadAllText($manifestFile) -replace 'android:versionCode="[0-9]+"',('android:versionCode="'+$version.androidCode+'"') -replace 'android:versionName="[0-9.]+"',('android:versionName="'+$version.android+'"')
[IO.File]::WriteAllText($manifestFile,$manifestText,[Text.UTF8Encoding]::new($false))
$jdk=(Get-ChildItem toolchain/jdk -Directory | Select-Object -First 1).FullName
$tools=(Get-ChildItem toolchain/sdk -Filter aapt2.exe -Recurse | Select-Object -First 1).Directory.FullName
$platform=(Get-ChildItem toolchain/sdk -Filter android.jar -Recurse | Select-Object -First 1).FullName
$env:JAVA_HOME=$jdk
$build=Join-Path (Get-Location) 'android/build'
New-Item -ItemType Directory -Force -Path "$build/classes","$build/dex" | Out-Null
$source=Join-Path (Get-Location) 'android/MainActivity.java'
$text=[IO.File]::ReadAllText($source).TrimStart([char]0xfeff)
[IO.File]::WriteAllText($source,$text,[Text.UTF8Encoding]::new($false))
& "$jdk/bin/javac.exe" --release 8 -classpath $platform -d "$build/classes" $source
if($LASTEXITCODE -ne 0){throw 'Falha Java'}
& "$jdk/bin/jar.exe" cf "$build/classes.jar" -C "$build/classes" .
& "$tools/d8.bat" --lib $platform --min-api 26 --output "$build/dex" "$build/classes.jar"
if($LASTEXITCODE -ne 0){throw 'Falha DEX'}
& "$tools/aapt2.exe" compile --dir android/res -o "$build/resources.zip"
& "$tools/aapt2.exe" link -I $platform --manifest android/AndroidManifest.xml -o "$build/unsigned.apk" "$build/resources.zip"
if($LASTEXITCODE -ne 0){throw 'Falha recursos'}
& "$jdk/bin/jar.exe" uf "$build/unsigned.apk" -C "$build/dex" classes.dex
& "$tools/zipalign.exe" -f 4 "$build/unsigned.apk" "$build/aligned.apk"
$key=Join-Path $env:LOCALAPPDATA 'NFSeConectaBuild'
New-Item -ItemType Directory -Force -Path $key | Out-Null
$passwordFile=Join-Path $key 'android-password.bin'
if(!(Test-Path $passwordFile)){$bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes);$password=[Convert]::ToBase64String($bytes);[IO.File]::WriteAllBytes($passwordFile,[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($password),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}
$env:NFSE_ANDROID_KEY_PASSWORD=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($passwordFile),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))
$keystore=Join-Path $key 'nfse-conecta.keystore'
if(!(Test-Path $keystore)){& "$jdk/bin/keytool.exe" -genkeypair -keystore $keystore -alias nfseconecta -keyalg RSA -keysize 3072 -validity 10000 -storepass:env NFSE_ANDROID_KEY_PASSWORD -keypass:env NFSE_ANDROID_KEY_PASSWORD -dname 'CN=NFS-e Conecta, O=Artho, C=BR'}
& "$tools/apksigner.bat" sign --ks $keystore --ks-key-alias nfseconecta --ks-pass env:NFSE_ANDROID_KEY_PASSWORD --out downloads/NFSe-Conecta.apk "$build/aligned.apk"
if($LASTEXITCODE -ne 0){throw 'Falha assinatura'}
& "$tools/apksigner.bat" verify downloads/NFSe-Conecta.apk
if($LASTEXITCODE -ne 0){throw 'APK inválido'}
Remove-Item Env:NFSE_ANDROID_KEY_PASSWORD
Write-Output 'APK compilado e assinatura validada.'
