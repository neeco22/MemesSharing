@echo off
title MemesSharing Launcher
cd /d D:\MemeSharing

echo [1/2] Starting Node image server...
start "" /b "D:\nodejs\node.exe" "D:\MemeSharing\server.js"
timeout /t 2 /nobreak >nul

echo [2/2] Starting Cloudflare tunnel...
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run memesharing

echo.
echo Tips:
echo   Keep this window open = tunnel online. Closing it stops the site.
echo   Node server runs in background.
echo   Site: https://memesharing.online
pause
