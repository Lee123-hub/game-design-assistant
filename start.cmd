@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==^> 检查 Node.js ...
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装（^>= 20.19，建议 LTS 22^）：https://nodejs.org
  pause
  exit /b 1
)
node -e "const [ma,mi]=process.versions.node.split('.').map(Number);if(!(ma>20||(ma===20&&mi>=19))){console.error('Node.js 版本过低（当前 v'+process.versions.node+'），需要 >= 20.19：https://nodejs.org');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo     Node 版本检查通过

echo ==^> 安装依赖（npm install，重复运行很快）...
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo npm install 失败，请检查网络后重试。
  pause
  exit /b 1
)

echo ==^> 构建前端（仅首次较慢）...
call npm run build
if errorlevel 1 (
  echo 前端构建失败。
  pause
  exit /b 1
)

echo.
echo ==^> 启动服务：http://localhost:8787 （关闭本窗口或 Ctrl+C 停止）
rem 3 秒后自动打开浏览器
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start "" http://localhost:8787"

call npm start

echo.
echo 服务已停止。
pause
