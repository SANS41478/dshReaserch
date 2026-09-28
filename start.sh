#!/usr/bin/env bash
# dsh atlas — 架构解构站 + 源码浏览器 (macOS / Linux)
cd "$(dirname "$0")" || exit 1

echo
echo "  dsh atlas"
echo "  ============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  [错误] 没找到 node。请安装 Node.js 22 或更高版本。"
  echo "         下载: https://nodejs.org/"
  echo
  exit 1
fi

# 从 config.json 读端口
PORT=$(node -e "try{const c=require('./config.json');process.stdout.write(String(c.port||5319))}catch{process.stdout.write('5319')}")
export PORT

# 端口已被占用时，只开浏览器
if command -v lsof >/dev/null 2>&1 && lsof -i :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  端口 $PORT 已在服务中，只打开浏览器。"
  echo "  （如果是上次没关干净的进程，先关掉它再运行本脚本。）"
  echo
  URL="http://127.0.0.1:${PORT}/"
  case "$(uname -s)" in
    Darwin) open "$URL" 2>/dev/null || true ;;
    *)      xdg-open "$URL" 2>/dev/null || true ;;
  esac
  exit 0
fi

echo "  正在启动服务，端口 $PORT ..."
echo

URL="http://127.0.0.1:${PORT}/"
case "$(uname -s)" in
  Darwin) (sleep 1; open "$URL" 2>/dev/null || true) & ;;
  *)      (sleep 1; xdg-open "$URL" 2>/dev/null || true) & ;;
esac

node server.mjs

echo
echo "  服务已停止。"
