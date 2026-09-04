#!/usr/bin/env bash
# 游戏设计助手 — macOS / Linux 一键安装启动
# 用法：./start.sh  （或 bash start.sh）
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 检查 Node.js ..."
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装（>= 20.19，建议 LTS 22）：https://nodejs.org" >&2
  exit 1
fi
NODE_OK=$(node -p '(()=>{const [ma,mi]=process.versions.node.split(".").map(Number);return (ma>20||(ma===20&&mi>=19))?1:0})()')
if [ "$NODE_OK" != "1" ]; then
  echo "Node.js 版本过低（当前 $(node -v)），需要 >= 20.19：https://nodejs.org" >&2
  exit 1
fi
echo "    Node $(node -v) ✓"

echo "==> 安装依赖（npm install，重复运行很快）..."
npm install --no-fund --no-audit

echo "==> 构建前端（仅首次较慢）..."
npm run build

echo ""
echo "==> 启动服务：http://localhost:8787 （Ctrl+C 停止）"
# 3 秒后自动打开浏览器（服务就绪前打开会自动重试）
( sleep 3
  if command -v open >/dev/null 2>&1; then open http://localhost:8787
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:8787
  fi ) &

npm start
