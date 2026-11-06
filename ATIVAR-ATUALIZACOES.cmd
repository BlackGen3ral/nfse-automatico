@echo off
setlocal
if not exist "%~dp0manifest.json" goto missing
if not exist "%~dp0atualizador\ativar.ps1" goto missing
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizador\ativar.ps1"
if errorlevel 1 goto failed
echo.
echo Atualizacao automatica ativada neste PC para esta pasta.
echo Mantenha a extensao nesta mesma pasta.
echo As proximas verificacoes acontecem em segundo plano, sem janelas.
echo Feche Chrome e Edge completamente para aplicar atualizacoes prontas.
echo.
pause
exit /b 0
:missing
echo Extraia o ZIP completo e execute este arquivo na pasta NFSe-Automatico,
echo junto do arquivo manifest.json. Nao execute de dentro do ZIP.
pause
exit /b 1
:failed
echo.
echo Nao foi possivel ativar. Envie a mensagem de erro mostrada acima.
pause
exit /b 1
