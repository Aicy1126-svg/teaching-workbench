@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   教培工作台 - 一键上传到 GitHub
echo   （部署到 Railway 前的准备步骤）
echo ============================================
echo.
echo 你需要准备：
echo   1. GitHub 用户名
echo   2. 访问令牌(token，见部署教程-无脑版.md 第2步)
echo   3. 仓库名(如 teaching-workbench-sync)
echo.

set /p GH_USER=请输入 GitHub 用户名：
set /p GH_TOKEN=请输入 访问令牌(token)：
set /p GH_REPO=请输入 仓库名：

if "%GH_USER%"=="" goto :err
if "%GH_TOKEN%"=="" goto :err
if "%GH_REPO%"=="" goto :err

REM 自动把前端页面/样式/脚本复制到 public/，确保云平台部署后公网地址能直接打开工作台
if not exist "..\index.html" (
  echo [警告] 未找到父目录的 index.html，请确认本文件在 sync-server/ 目录内
  goto :err
)
if not exist "public" mkdir "public"
xcopy /E /I /Y "..\index.html" "public\" >nul
xcopy /E /I /Y "..\css" "public\css\" >nul
xcopy /E /I /Y "..\js" "public\js\" >nul
xcopy /E /I /Y "..\icons" "public\icons\" >nul
xcopy /E /I /Y "..\manifest.json" "public\" >nul
xcopy /E /I /Y "..\sw.js" "public\" >nul
echo [准备] 已把前端资源复制到 sync-server/public/，确保云平台能直接访问页面

REM 配置 git 身份（仅本仓库）
git config user.name "%GH_USER%"
git config user.email "%GH_USER%@users.noreply.github.com"

REM 暂存并提交（.gitignore 已排除 data/log/cloudflared.exe）
git add -A
git commit -q -m "deploy: teaching-workbench sync server" 2>nul

REM 设置远程并推送（用令牌做密码，免交互）
git remote remove origin 2>nul
git remote add origin https://%GH_USER%:%GH_TOKEN%@github.com/%GH_USER%/%GH_REPO%.git
git branch -M main
echo.
echo [正在推送...] 若提示输入密码，把 token 粘贴进去即可
git push -u origin main
if %errorlevel%==0 (
  echo.
  echo ============================================
  echo   上传成功！
  echo   接着打开 https://railway.app 连这个仓库部署
  echo   详见「部署教程-无脑版.md」第5步
  echo ============================================
) else (
  echo.
  echo [失败] 常见原因：仓库名不对 / token 无 repo 权限 / 仓库已存在内容
  echo   请核对后重跑本脚本。
)
echo.
pause
goto :eof

:err
echo [错误] 三项都不能为空，请重跑脚本。
pause
