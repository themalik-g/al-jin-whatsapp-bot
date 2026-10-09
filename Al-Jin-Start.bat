@echo off
rem ---------------------------------------------
rem  Al-Jin - one-click start for Windows
rem  Double-click this file. That is all.
rem  - No admin prompt and no winget: if Node.js 20+ is missing, a private copy
rem    is downloaded into the "runtime" folder next to this file.
rem  - No git needed: the bot is downloaded as a zip.
rem  - First run asks your number once and shows the pairing code.
rem  - Later runs resume. Restarts the bot if it stops. Close the window to quit.
rem ---------------------------------------------
setlocal EnableExtensions EnableDelayedExpansion
title Al-Jin
cd /d "%~dp0"

rem Standalone file in a busy folder (Downloads, user folder)? Work in its own folder.
if not exist index.js if not exist start.js (
  if not exist "Al-Jin" mkdir "Al-Jin"
  cd /d "%~dp0Al-Jin"
)

set "NODE_NO_WARNINGS=1"
set "PATH=%CD%\runtime;%PATH%"

set "NODE_OK="
where node >nul 2>nul && node -e "process.exit(parseInt(process.versions.node)>=20?0:1)" >nul 2>nul && set "NODE_OK=1"
if not defined NODE_OK call :get_node || (echo.& pause & exit /b 1)

if not exist index.js (
  echo [Al-Jin] Downloading the launcher...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/index.js' -OutFile index.js" || (echo Download failed - check your internet. & pause & exit /b 1)
  if not exist package.json echo {"type":"module"}>package.json
)

set "NUM="
if exist .aljin-number set /p NUM=<.aljin-number
if defined NUM goto run
call :linked && goto run
:ask
set /p NUM=Your WhatsApp number, digits only with country code (e.g. 923001234567): 
echo !NUM!| findstr /r "^[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]*$" >nul || (echo That does not look right - try again.& goto ask)
>.aljin-number echo !NUM!

:run
call :linked && (set "ARGS=") || (set "ARGS=--phone=!NUM!")
echo.& echo [Al-Jin] Starting... ^(close this window to stop^)
call :now & set "T0=!NOW!"
node index.js !ARGS!
if errorlevel 1 (
  call :now
  set /a "EL=!NOW!-!T0!"
  if !EL! LSS 0 set /a "EL+=86400"
  if !EL! LSS 40 (set /a FAILS+=1) else (set "FAILS=0")
  if !FAILS! GEQ 3 (
    echo.
    echo [Al-Jin] Stopped: the bot failed 3 times in a row. Read the error above, fix it, then run this file again.
    echo          If it says npm or download failed, check your internet and try again.
    pause
    exit /b 1
  )
  echo [Al-Jin] Bot exited - restarting in 5 seconds...
  timeout /t 5 /nobreak >nul
  goto run
)
echo [Al-Jin] Stopped.
pause
exit /b 0

rem Seconds since midnight -> NOW
:now
for /f "tokens=1-3 delims=:., " %%a in ("%time: =0%") do set /a "NOW=(1%%a-100)*3600+(1%%b-100)*60+(1%%c-100)"
exit /b 0

rem Private portable Node.js 22 LTS (verified SHA-256). No admin rights needed.
:get_node
echo [Al-Jin] Setting up Node.js ^(one time, about 30 MB, no admin needed^)...
where tar >nul 2>nul || (echo [Al-Jin] Windows "tar" not found. Install Node.js LTS from nodejs.org, then run this again.& exit /b 1)
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if not exist runtime mkdir runtime
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; $b='https://nodejs.org/dist/latest-v22.x/'; $t=(Invoke-WebRequest -UseBasicParsing ($b+'SHASUMS256.txt')).Content; $m=[regex]::Match($t,'([a-f0-9]{64})\s+(node-v[\d.]+-win-%ARCH%\.zip)'); if(-not $m.Success){throw 'Node zip not listed'}; $f='runtime\node.zip'; Invoke-WebRequest -UseBasicParsing ($b+$m.Groups[2].Value) -OutFile $f; if((Get-FileHash $f -Algorithm SHA256).Hash.ToLower() -ne $m.Groups[1].Value){throw 'Node download hash mismatch'}" || (echo [Al-Jin] Node.js download failed - check your internet and try again.& exit /b 1)
tar -xf runtime\node.zip -C runtime --strip-components=1 || (echo [Al-Jin] Could not unpack Node.js.& exit /b 1)
del runtime\node.zip >nul 2>nul
where node >nul 2>nul || (echo [Al-Jin] Node.js setup failed.& exit /b 1)
echo [Al-Jin] Node.js ready.
exit /b 0

rem A linked session lives in instances\ (bot next to index.js) or wraith\instances\ (bot downloaded by the launcher).
:linked
dir /b instances 2>nul | findstr "." >nul && exit /b 0
dir /b wraith\instances 2>nul | findstr "." >nul && exit /b 0
exit /b 1
