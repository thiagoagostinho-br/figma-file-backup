#!/bin/bash
set -e

HELPER_DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.figmabackup.helper"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_PATH="$HOME/Library/Logs/figma-backup-helper.log"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js nao encontrado nesta maquina."
  echo "Instale em https://nodejs.org/ e rode este script de novo."
  read -p "Pressione Enter para fechar..." || true
  exit 1
fi

NODE_BIN="$(command -v node)"

cd "$HELPER_DIR"

if [ ! -d node_modules ]; then
  echo "Instalando dependencias..."
  npm install
fi

if [ ! -d "$HOME/Library/Caches/ms-playwright" ]; then
  echo "Baixando navegador do Playwright..."
  npx playwright install chromium
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$HELPER_DIR/src/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$HELPER_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_PATH</string>
  <key>StandardErrorPath</key>
  <string>$LOG_PATH</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"

READY=false
for i in $(seq 1 15); do
  sleep 1
  if curl -s http://localhost:8722/status >/dev/null 2>&1; then
    READY=true
    break
  fi
done

if [ "$READY" = true ]; then
  echo ""
  echo "Helper instalado e rodando em segundo plano (http://localhost:8722)."
  echo "Ele vai iniciar sozinho sempre que voce ligar o Mac. Pode fechar esta janela"
  echo "e nunca mais precisa rodar este script de novo."
else
  echo ""
  echo "Instalado, mas ainda nao respondeu apos alguns segundos. Verifique o log em: $LOG_PATH"
fi

read -p "Pressione Enter para fechar..." || true
