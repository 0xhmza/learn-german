@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or later, then run this launcher again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4180 in your browser.
echo Keep this window open while you learn.
node server.js
pause
