@echo off
chcp 65001 >nul
cd /d "%~dp0server"
if not exist "package.json" (
  echo 未找到 server\package.json
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo 正在执行 npm install ...
  call npm install
  if errorlevel 1 (
    echo 失败：请确认已安装 Node.js 且 npm 在 PATH 中。
    pause
    exit /b 1
  )
)
if not exist ".env" (
  echo 请先复制 server\.env.example 为 server\.env 并填写 Turso 变量。
  pause
  exit /b 1
)
echo.
echo  Turso 模式：静态页 + API 同端口
echo  地址: http://127.0.0.1:3847/
echo  按 Ctrl+C 停止
echo.
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:3847/"
call npm start
pause
