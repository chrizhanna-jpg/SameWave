#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Expo Go asks to log in; pick "Proceed anonymously" (second option).
# Repeat while Metro runs — Expo can re-prompt after config reloads.
{
  while true; do
    sleep 3
    printf '\033[B\r'
  done
} | pnpm exec expo start --go --tunnel --clear
