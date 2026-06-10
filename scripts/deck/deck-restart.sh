#!/usr/bin/env bash
# Deck-side (re)start, invoked by deckDeploy.mjs over ssh.
#
# Runs the game server + llama-server as TRANSIENT SYSTEMD USER UNITS
# (pt-game-server / pt-llama), not nohup'd session children: SteamOS
# tears down an ssh session's children when the session closes (live
# finding 2026-06-10 — llama-server died 2.2s into its model load, the
# moment the deploy's ssh returned; nohup+disown did not save it). The
# user manager persists (the Deck is always logged into its graphical
# session), so user units survive.
#
# Output stays in ~/projecttakeover/{serve,llama}.log via exec
# redirection inside the unit, so log-reading habits and the docs stay
# true; `journalctl --user -u pt-llama` works too.
#
# A real script rather than an inline ssh one-liner: one quoting layer,
# debuggable by hand on the Deck.
#
# Usage: deck-restart.sh [--llama] [PORT]
set -u

cd "$HOME/projecttakeover"

PORT=8000
DO_LLAMA=0
for arg in "$@"; do
  case "$arg" in
    --llama) DO_LLAMA=1 ;;
    *) PORT="$arg" ;;
  esac
done

systemctl --user stop pt-game-server 2>/dev/null
systemctl --user reset-failed pt-game-server 2>/dev/null
systemd-run --user --unit pt-game-server --collect \
  --property=WorkingDirectory="$HOME/projecttakeover" \
  bash -c "exec python3 deckServe.py --dir \"$HOME/projecttakeover/dist\" --port $PORT > serve.log 2>&1"
sleep 1
if systemctl --user is-active --quiet pt-game-server; then
  echo "game server up (port $PORT, unit pt-game-server)"
else
  echo "game server FAILED - serve.log:"
  tail -5 serve.log 2>/dev/null
  exit 1
fi

if [[ "$DO_LLAMA" == "1" ]]; then
  chmod +x deck-llama.sh
  systemctl --user stop pt-llama 2>/dev/null
  systemctl --user reset-failed pt-llama 2>/dev/null
  systemd-run --user --unit pt-llama --collect \
    --property=WorkingDirectory="$HOME/projecttakeover" \
    bash -c "exec ./deck-llama.sh > llama.log 2>&1"
  sleep 2
  if systemctl --user is-active --quiet pt-llama; then
    echo "llama-server starting (E4B cold load ~30s - watch llama.log, unit pt-llama)"
  else
    echo "llama-server FAILED - llama.log:"
    tail -5 llama.log 2>/dev/null
    exit 1
  fi
fi
