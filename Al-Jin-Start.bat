@echo off
rem ---------------------------------------------
rem  Al-Jin - one-click start for Windows
rem  Put this file next to index.js (or alone in an empty folder) and double-click it.
rem  First run: installs Node.js + git (via winget), asks your number once, shows the pairing code.
rem  Later runs: resumes. Restarts the bot if it stops. Close the window to quit.
rem ---------------------------------------------
setlocal EnableDelayedExpansion
title Al-Jin
cd /d "%~dp0"

where node >nul 2>nul && where git >nul 2>nul && goto have_tools
echo [Al-Jin] Installing Node.js and git ^(one time^)...
where winget >nul 2>nul || (echo winget not found. Install Node.js LTS and Git from nodejs.org and git-scm.com, then run this again. & pause & exit /b 1)
where node >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
where git  >nul 2>nul || winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements
where node >nul 2>nul && where git >nul 2>nul || (echo.& echo [Al-Jin] Installed. Close this window and double-click the file again.& pause & exit /b 0)
:have_tools

if not exist index.js (
  echo [Al-Jin] Downloading the launcher...
  powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/index.js' -OutFile index.js" || (echo Download failed. & pause & exit /b 1)
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
node index.js !ARGS!
if errorlevel 1 (
  echo [Al-Jin] Bot exited - restarting in 5 seconds...
  timeout /t 5 /nobreak >nul
  goto run
)
echo [Al-Jin] Stopped.
pause
exit /b 0

rem A linked session lives in instances\ (bot next to index.js) or wraith\instances\ (bot downloaded by the launcher).
:linked
dir /b instances 2>nul | findstr "." >nul && exit /b 0
dir /b wraith\instances 2>nul | findstr "." >nul && exit /b 0
exit /b 1
