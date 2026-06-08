@echo off
chcp 65001 >nul
title 记账本服务器
echo 正在启动记账本服务...
start http://localhost:8080
node "%~dp0server.js"
pause
