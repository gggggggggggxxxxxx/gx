@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   推送到 GitHub: gggggggggggxxxxxx/gx
echo ========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 git 命令。
  echo 请先安装 Git for Windows: https://git-scm.com/download/win
  echo 安装时勾选 "Git from the command line and also from 3rd-party software"
  echo 安装完成后关闭本窗口，重新双击运行本脚本。
  pause
  exit /b 1
)

git --version

if not exist ".git" (
  echo [1/5] 初始化仓库...
  git init
  git branch -M main
) else (
  echo [1/5] 已存在 .git，跳过 init。
)

echo [2/5] 设置远程 origin...
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/gggggggggggxxxxxx/gx.git
) else (
  git remote set-url origin https://github.com/gggggggggggxxxxxx/gx.git
)

echo [3/5] 检查是否误含 server\.env ...
if exist "server\.env" (
  findstr /R /N "^" "server\.env" >nul 2>&1
  echo 提示: server\.env 存在但已被 .gitignore 忽略，不会上传。
)

echo [4/5] 添加文件并提交...
git add -A
git status

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Initial commit: programming planning assessment"
  if errorlevel 1 (
    echo.
    echo [提示] 若提示需设置身份，请先在本机任意目录执行一次:
    echo   git config --global user.email "你的邮箱"
    echo   git config --global user.name "你的名字"
    echo 然后重新运行本脚本。
    pause
    exit /b 1
  )
) else (
  echo 没有新变更可提交；若从未推送过，将直接尝试 push。
)

echo [5/5] 推送到 GitHub...
git push -u origin main
if errorlevel 1 (
  echo.
  echo ----------------------------------------
  echo 推送失败时常见处理:
  echo 1. 浏览器登录 github.com，确认仓库 gx 已创建且你有写入权限。
  echo 2. HTTPS 推送时，密码处填写「Personal Access Token」而非登录密码。
  echo    创建令牌: GitHub - Settings - Developer settings - Personal access tokens
  echo 3. 若远程已有 README 导致拒绝，可先执行:
  echo    git pull origin main --allow-unrelated-histories
  echo    解决冲突后再 git push -u origin main
  echo ----------------------------------------
  pause
  exit /b 1
)

echo.
echo 完成。仓库地址: https://github.com/gggggggggggxxxxxx/gx
pause
