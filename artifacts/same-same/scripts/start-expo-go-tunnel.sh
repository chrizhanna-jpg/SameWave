#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Expo Go asks to log in; pick "Proceed anonymously" (second option).
# Repeat while Metro runs — Expo can re-prompt after config reloads.
# Outer loop restarts Metro when the ngrok tunnel drops (common cause of
# Expo Go stuck on "Loading…").
while true; do
  {
    while true; do
      sleep 3
      printf '\033[B\r'
    done
  } | pnpm exec expo start --go --tunnel --clear || true
  echo "[expo] Dev server exited — restarting tunnel in 5s…" >&2
  sleep 5
done
