@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "CF=%~dp0cloudflared.exe"
if not exist "%CF%" set "CF=cloudflared"

where cloudflared >nul 2>&1
if errorlevel 1 if not exist "%~dp0cloudflared.exe" (
  echo [错误] 未找到 cloudflared.exe
  echo 请从下面地址下载 Windows 版，改名为 cloudflared.exe 后放到本 bat 同一文件夹：
  echo https://github.com/cloudflare/cloudflared/releases
  pause
  exit /b 1
)

echo.
echo  请先在本机「另一个」命令行窗口运行：
echo    cd /d "%~dp0server"
echo    npm start
echo  确认出现 PPAIS + Turso: http://127.0.0.1:3847/ 后再继续。
echo.
echo  下面将显示 https://xxxx.trycloudflare.com ，请复制发给学员。
echo  勿关闭本窗口；按 Ctrl+C 停止隧道后链接即失效。
echo.
pause

"%CF%" tunnel --url http://127.0.0.1:3847
if errorlevel 1 (
  echo.
  echo 若失败，请确认 cloudflared 已正确安装，且 3847 端口服务已启动。
)
pause
