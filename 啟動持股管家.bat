@echo off
chcp 65001 >nul
title 持股管家 — 本地伺服器
echo 正在啟動「持股管家」並開啟瀏覽器 (http://localhost:8080)...
start "" "http://localhost:8080"
node "%~dp0server.js"
pause
