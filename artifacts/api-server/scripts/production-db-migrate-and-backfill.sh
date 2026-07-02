#!/usr/bin/env bash
# Run on a machine that has production DATABASE_URL (e.g. your Windows PC
# with artifacts/api-server/.env pointing at Neon).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/artifacts/api-server/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^DATABASE_URL=' "$ENV_FILE" | sed 's/\r$//')
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL missing — set it in $ENV_FILE or export it."
  exit 1
fi

echo "==> Drizzle push (deck preview columns)…"
(cd "$ROOT/lib/db" && DATABASE_URL="$DATABASE_URL" pnpm push)

echo "==> Deck preview backfill dry-run…"
(cd "$ROOT/artifacts/api-server" && node ./scripts/backfill-deck-previews.mjs)

echo "==> Deck preview backfill apply…"
(cd "$ROOT/artifacts/api-server" && node ./scripts/backfill-deck-previews.mjs --apply)

echo "Done. Redeploy Render from latest main if the API is not already updated."
