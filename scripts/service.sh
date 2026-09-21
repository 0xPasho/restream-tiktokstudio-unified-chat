#!/usr/bin/env bash
#
# Corre el chat como un proceso de node suelto, fuera del repo y bajo launchd.
#
# Por qué no `next dev` ni `next start`:
#   - la línea de comando no contiene «next», así que los agentes que limpian
#     puertos con `pkill -f next` no lo encuentran;
#   - launchd lo relanza solo si algo igual lo mata (KeepAlive);
#   - no es hijo de ninguna terminal, así que cerrar la sesión no lo tumba;
#   - `next dev` reescribe el bloque de AGENTS.md; esto no.
#
# Uso: ./scripts/service.sh {install|update|start|stop|restart|status|logs|uninstall}

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${UNIFIED_CHAT_HOME:-$HOME/.local/share/unified-live-chat}"
APP="$HOME_DIR/app"
LOGS="$HOME_DIR/logs"
LABEL="com.pasho.unified-live-chat"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
TARGET="gui/$(id -u)/$LABEL"

PORT="${PORT:-7637}"
# La base se queda en el repo: el daemon y `npm run dev` comparten historial.
CHAT_DB_PATH="${CHAT_DB_PATH:-$REPO/data/chat.db}"
# launchd arranca con un PATH mínimo, así que el binario va absoluto.
NODE="${NODE_BIN:-$(command -v node)}"

say() { printf '\033[1;36m›\033[0m %s\n' "$1"; }

build() {
  say "next build"
  ( cd "$REPO" && npm run build >/dev/null )

  say "copiando a $APP"
  mkdir -p "$APP" "$LOGS"
  rsync -a --delete "$REPO/.next/standalone/" "$APP/"
  # server.js no sirve estos dos por su cuenta; hay que ponerlos a mano.
  rsync -a "$REPO/.next/static/" "$APP/.next/static/"
  [ -d "$REPO/public" ] && rsync -a "$REPO/public/" "$APP/public/"

  # El bundle de standalone no incluye .next/server/instrumentation.js, y el
  # servidor lo carga con un require envuelto en try/catch que se traga el
  # MODULE_NOT_FOUND: sin este paso el chat levanta perfecto y sin colectores,
  # sin un solo error en los logs. Copiamos el hook y lo que su traza pida.
  say "copiando el hook de instrumentation (colectores)"
  REPO="$REPO" APP="$APP" python3 - <<'PY'
import json, os, shutil, sys

repo, app = os.environ['REPO'], os.environ['APP']
server = os.path.join(repo, '.next', 'server')
trace = os.path.join(server, 'instrumentation.js.nft.json')

wanted = [os.path.join(server, 'instrumentation.js')]
with open(trace) as fh:
    wanted += [os.path.normpath(os.path.join(server, f)) for f in json.load(fh)['files']]

copied = 0
for src in wanted:
    rel = os.path.relpath(src, repo)
    if rel.startswith('..') or rel.startswith('data/') or not os.path.isfile(src):
        continue          # la base de datos y cualquier cosa fuera del repo no van
    dst = os.path.join(app, rel)
    if os.path.exists(dst):
        continue          # el trazado de standalone ya lo trajo
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    copied += 1

if not os.path.exists(os.path.join(app, '.next/server/instrumentation.js')):
    sys.exit('no se pudo copiar instrumentation.js: los colectores no arrancarian')
print(f'  {copied} archivos copiados')
PY

  # El wrapper existe para renombrar el proceso. Vive fuera de app/ para que el
  # --delete del rsync no se lo lleve en cada actualización.
  cat > "$HOME_DIR/start.js" <<'JS'
// Entrada del servicio: fija el nombre del proceso y cede a server.js de Next.
//
// Next se renombra solo a «next-server (vX)» al levantar el servidor, y con ese
// nombre un `pkill -f next` lo encuentra — que es justo lo que queremos evitar.
// Así que ponemos el título con el setter real y después lo sellamos con un
// accessor que ignora escrituras: el rename de Next se vuelve un no-op.
process.title = 'unified-live-chat';
Object.defineProperty(process, 'title', {
  get: () => 'unified-live-chat',
  set: () => {},
  configurable: true,
});

require('./app/server.js');
JS
  chmod 700 "$HOME_DIR"
}

write_plist() {
  say "escribiendo $PLIST"
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$HOME_DIR/start.js</string>
  </array>
  <key>WorkingDirectory</key><string>$APP</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
    <key>PORT</key><string>$PORT</string>
    <key>HOSTNAME</key><string>127.0.0.1</string>
    <key>CHAT_DB_PATH</key><string>$CHAT_DB_PATH</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>$LOGS/out.log</string>
  <key>StandardErrorPath</key><string>$LOGS/err.log</string>
</dict>
</plist>
PLIST_EOF
}

# El puerto lo puede tener ocupado un `next dev` olvidado: los dos se quedan
# escuchando (uno en IPv6, otro en IPv4) y acabas con dos colectores sobre la
# misma base, duplicando conexiones a TikTok.
preflight() {
  local busy
  busy="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u)"
  for pid in $busy; do
    if [ "$(launchctl print "$TARGET" 2>/dev/null | awk '/^\tpid = /{print $3}')" = "$pid" ]; then
      continue   # es el propio servicio, lo vamos a reiniciar
    fi
    printf '\033[1;31m✗\033[0m el puerto %s ya lo tiene el pid %s:\n  %s\n' \
      "$PORT" "$pid" "$(ps -o command= -p "$pid" | cut -c1-100)"
    echo "  ciérralo (o usa PORT=otro) antes de seguir."
    exit 1
  done
}

case "${1:-}" in
  install)
    preflight
    build
    write_plist
    launchctl bootout "$TARGET" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    say "arriba en http://localhost:$PORT"
    say "no corras «npm run dev» a la vez: serían dos colectores sobre el mismo chat"
    ;;
  update)
    build
    launchctl kickstart -k "$TARGET"
    say "actualizado y reiniciado"
    ;;
  start)   preflight; launchctl bootstrap "gui/$(id -u)" "$PLIST"; say "arriba en http://localhost:$PORT" ;;
  stop)    launchctl bootout "$TARGET"; say "detenido (y no se relanza hasta un start)" ;;
  restart) launchctl kickstart -k "$TARGET"; say "reiniciado" ;;
  status)
    launchctl print "$TARGET" 2>/dev/null | grep -E '^\s+(state|pid|last exit code) ' || say "no está cargado"
    curl -sS -o /dev/null -w "HTTP %{http_code} en :$PORT\n" "http://localhost:$PORT/api/status" || true
    ;;
  logs)      tail -f "$LOGS/out.log" "$LOGS/err.log" ;;
  uninstall)
    launchctl bootout "$TARGET" 2>/dev/null || true
    rm -f "$PLIST"
    say "servicio quitado. La copia de la app sigue en $HOME_DIR (bórrala tú si quieres)"
    ;;
  *) sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
