#!/bin/bash

LABEL="com.figmabackup.helper"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl unload "$PLIST_PATH" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "Helper removido. Ele nao vai mais iniciar automaticamente."
read -p "Pressione Enter para fechar..." || true
