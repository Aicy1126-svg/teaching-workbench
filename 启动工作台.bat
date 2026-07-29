@echo off
chcp 65001 >nul
cd /d "%~dp0sync-server"

echo ============================================
echo   教培备考工作台 - 一键启动（自愈常驻）
echo   手机/平板连同一WiFi，打开 http://电脑IP:8080
echo   关闭此窗口不会停止服务（后台运行中）
echo ============================================
echo.

REM 优先使用 WorkBuddy 自带的 Node
set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if exist "%NODE_EXE%" goto :run
where node >nul 2>nul
if %errorlevel%==0 ( set "NODE_EXE=node" & goto :run )
echo [错误] 未检测到 Node.js，请先安装 Node.js (https://nodejs.org) 后重试。
pause
exit /b

:run
if not exist "log" mkdir "log"

REM 启动本地同步服务器（后台 + 崩溃自动重启循环）
start "" cmd /c "for /L %%i in (1,0,1) do ( echo [%date% %time%] 启动服务器 >> "%~dp0sync-server\log\server.log" & "%NODE_EXE%" server.js >> "%~dp0sync-server\log\server.log" 2>&1 & echo [%date% %time%] 服务器退出，3秒后自动重启 >> "%~dp0sync-server\log\server.log" & timeout /t 3 /nobreak >nul )"

REM 启动内网穿透（若有 cloudflared，自动生成公网地址）
REM 若已配置固定公网地址（sync-server\fixed_url.txt），则跳过临时隧道，直接用固定地址
set "FIXED_URL="
if exist "%~dp0sync-server\fixed_url.txt" (
  for /f "usebackq delims=" %%u in ("%~dp0sync-server\fixed_url.txt") do (
    echo %%u | findstr /r "https\?://" >nul && set "FIXED_URL=%%u"
  )
)
if defined FIXED_URL (
  echo [固定公网] 检测到 fixed_url.txt：%FIXED_URL%
  echo [固定公网] 手机/平板用此固定地址即可永久同步（无需临时穿透）
  > "%~dp0sync-server\public_url.txt" echo %FIXED_URL%
) else if exist "%~dp0sync-server\cloudflared.exe" (
  start "" cmd /c ""%~dp0sync-server\cloudflared.exe" tunnel --url http://localhost:8080 >> "%~dp0sync-server\log\tunnel.log" 2>&1"
  echo [内网穿透] 正在生成临时公网地址...
  timeout /t 18 /nobreak >nul
  for /f "delims=" %%u in ('findstr /r "https://[a-z0-9-]*\.trycloudflare\.com" "%~dp0sync-server\log\tunnel.log"') do (
    echo %%u | findstr /r "trycloudflare\.com" > "%~dp0sync-server\public_url.txt"
    goto :found_url
  )
  :found_url
  echo [公网地址] 已写入 sync-server\public_url.txt（手机/平板用此地址可在任何网络同步）
  echo [提示] 此地址为临时地址，电脑重启会变。要固定地址见 sync-server\DEPLOY.md（部署到 Railway/Render）。
) else (
  echo [提示] 未检测到 cloudflared，仅本机/同WiFi可用。要任何网络同步见 DEPLOY.md。
)

REM 打开浏览器
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080"

echo.
echo [已启动] 服务器在后台运行；可直接关闭本窗口。
echo   彻底停止：任务管理器结束 node.exe，或在 log\server.log 查看运行记录。
echo.
pause
