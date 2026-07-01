#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Expo Go asks to log in; pick "Proceed anonymously" (second option).
{
  sleep 20
  printf '\033[B\r'
} | pnpm exec expo start --go --tunnel --clear
