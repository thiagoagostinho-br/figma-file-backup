#!/bin/bash
cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js nao encontrado nesta maquina."
  echo "Instale em https://nodejs.org/ e rode este script de novo."
  read -p "Pressione Enter para fechar..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Primeira vez: instalando dependencias..."
  npm install
fi

if [ ! -d "$HOME/Library/Caches/ms-playwright" ]; then
  echo "Primeira vez: baixando navegador do Playwright..."
  npx playwright install chromium
fi

echo "Iniciando helper em http://localhost:8722 ..."
echo "Deixe esta janela aberta enquanto usar o backup no plugin."
npm start
