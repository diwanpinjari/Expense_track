@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 or newer from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules call npm.cmd install
start "" http://localhost:3100
node server.js
pause
