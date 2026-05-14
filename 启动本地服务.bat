@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  编程规划智能考核系统 — 本地服务
echo  地址: http://127.0.0.1:8765/
echo  按 Ctrl+C 停止服务
echo.
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8765/"
py -3 -m http.server 8765 2>nul
if errorlevel 1 python -m http.server 8765
pause
