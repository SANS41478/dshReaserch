@echo off
cd /d "%~dp0"
title dsh atlas

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Node.js not found.
  echo   Install Node.js 22 or newer: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

REM Port from config.json, fallback 5319
set PORT=5319
for /f "tokens=2 delims=:," %%a in ('findstr /r /c:"\"port\":" config.json 2^>nul') do set PORT=%%a
set PORT=%PORT: =%
if "%PORT%"=="" set PORT=5319

echo.
echo   Starting dsh atlas on port %PORT% ...
echo.

REM If something is already listening on this port, reuse it instead of failing
netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo   Port %PORT% is already serving. Opening browser only.
  echo   If that is a stale process, close it and run this again.
  echo.
  start "" http://127.0.0.1:%PORT%/
  echo   Press any key to close this window.
  pause >nul
  exit /b 0
)

REM Open the browser first (it will retry while the server boots), then serve in foreground
start "" http://127.0.0.1:%PORT%/
node server.mjs

echo.
echo   Server stopped.
pause
