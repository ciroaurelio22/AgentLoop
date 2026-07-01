@echo off
setlocal
cd /d "%~dp0..\.."

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js non trovato. Installa Node 22 LTS da https://nodejs.org/
  pause
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm non trovato nel PATH. Installalo e riapri il terminale.
  pause
  exit /b 1
)

node tools\agent-gui\server.mjs
