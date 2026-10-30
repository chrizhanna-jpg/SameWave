#!/usr/bin/env bash
# One command to serve the current branch to a phone running Expo Go.
#
#   artifacts/same-same/scripts/expo-go-preview.sh
#
# It (re)starts Metro and the ngrok tunnel, then refuses to print the link
# unless every check below passes. See AGENTS.md "Expo Go previews".
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

PORT="${PREVIEW_PORT:-8081}"
HOST="${PREVIEW_HOST:-sw6cd7preview.exp.direct}"
NGROK_BIN="${NGROK_BIN:-/tmp/ngrok}"
NGROK_CFG="${NGROK_CFG:-/tmp/ngrok.yml}"
METRO_SESSION="expo-dev"
NGROK_SESSION="ngrok-expo"
TMUX=(tmux -f /exec-daemon/tmux.portal.conf)
[ -f /exec-daemon/tmux.portal.conf ] || TMUX=(tmux)

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok:   $*"; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse --short HEAD)"
echo "Branch $BRANCH @ $COMMIT"

# 1. Project must be on the SDK that the phone's Expo Go supports.
EXPO_VER="$(node -p "require('./package.json').dependencies.expo")"
case "$EXPO_VER" in
  *58.*) ok "expo dependency is $EXPO_VER (SDK 58)" ;;
  *) fail "expo is $EXPO_VER; the phone's Expo Go needs SDK 58 (do not downgrade)" ;;
esac

# 2. Tunnel prerequisites.
[ -x "$NGROK_BIN" ] || fail "$NGROK_BIN missing (ngrok binary)"
[ -f "$NGROK_CFG" ] || fail "$NGROK_CFG missing (ngrok authtoken config)"

# 3. Clerk key comes from .env.example, same as the committed app config.
CLERK_KEY="$(python3 - <<'PY'
import re
m = re.search(r"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=(.+)", open(".env.example").read())
print(m.group(1).strip() if m else "")
PY
)"
[ -n "$CLERK_KEY" ] || fail "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY not found in .env.example"

# 4. Stop any stale Metro on the port (by PID, never by name).
STALE_PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true)"
"${TMUX[@]}" kill-session -t "$METRO_SESSION" 2>/dev/null || true
if [ -n "$STALE_PIDS" ]; then
  # shellcheck disable=SC2086
  kill $STALE_PIDS 2>/dev/null || true
  sleep 2
fi

# 5. Tunnel: keep it if running, otherwise start it.
#    A running ngrok process is not enough: it can stay alive after its
#    session to the public edge drops (e.g. after the VM idles), which makes
#    the public host answer "endpoint is offline" (ERR_NGROK_3200). Restart
#    it whenever the public host reports that.
tunnel_offline() {
  curl -s -m 20 -i "https://$HOST" 2>/dev/null | grep -q "ERR_NGROK_3200"
}
if pgrep -f "ngrok http $PORT --url https://$HOST" >/dev/null && ! tunnel_offline; then
  ok "ngrok tunnel already running for $HOST"
else
  NGROK_PIDS="$(pgrep -f "ngrok http $PORT --url https://$HOST" || true)"
  "${TMUX[@]}" kill-session -t "$NGROK_SESSION" 2>/dev/null || true
  if [ -n "$NGROK_PIDS" ]; then
    # shellcheck disable=SC2086
    kill $NGROK_PIDS 2>/dev/null || true
    sleep 2
  fi
  "${TMUX[@]}" new-session -d -s "$NGROK_SESSION" -c /tmp \
    "$NGROK_BIN http $PORT --url https://$HOST --config $NGROK_CFG --log stdout"
  sleep 5
  pgrep -f "ngrok http $PORT --url https://$HOST" >/dev/null || fail "ngrok did not start; see tmux session $NGROK_SESSION"
  ok "restarted ngrok tunnel for $HOST"
fi

# 6. Metro, with the preview-only flags. The skip-sign-in flag is required:
#    Google OAuth redirects to echo.samewaveripple.app://, which an installed
#    SameWave app on the phone steals, so sign-in can never finish in Expo Go.
LABEL="Preview: ${BRANCH#cursor/}"
LABEL="${LABEL%-6cd7}"
"${TMUX[@]}" new-session -d -s "$METRO_SESSION" -c "$APP_DIR" \
  "EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN=1 \
EXPO_PUBLIC_EXPO_GO_PREVIEW_LABEL='$LABEL' \
EXPO_PUBLIC_API_URL=https://samewave.onrender.com \
EXPO_PUBLIC_HOSTED_API_URL=https://samewave.onrender.com \
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY='$CLERK_KEY' \
EXPO_PACKAGER_PROXY_URL=https://$HOST \
pnpm exec expo start --go --localhost --port $PORT --clear"

echo "Waiting for Metro..."
MANIFEST=""
for _ in $(seq 1 60); do
  MANIFEST="$(curl -fsS -m 5 -H 'expo-platform: android' -H 'Accept: application/expo+json' "http://localhost:$PORT" 2>/dev/null || true)"
  [ -n "$MANIFEST" ] && break
  sleep 2
done
[ -n "$MANIFEST" ] || fail "Metro did not answer on :$PORT; see tmux session $METRO_SESSION"
ok "Metro is up"

# 7. Manifest must say SDK 58 and point at the public host.
SDK="$(printf '%s' "$MANIFEST" | python3 -c "import sys,json;print(json.load(sys.stdin)['extra']['expoClient']['sdkVersion'])")"
[ "$SDK" = "58.0.0" ] || fail "manifest sdkVersion is $SDK, expected 58.0.0"
ok "manifest sdkVersion $SDK"
BUNDLE_URL="$(printf '%s' "$MANIFEST" | python3 -c "import sys,json;print(json.load(sys.stdin)['launchAsset']['url'])")"
case "$BUNDLE_URL" in
  https://$HOST/*) ok "bundle URL uses https://$HOST" ;;
  *) fail "bundle URL is $BUNDLE_URL, expected https://$HOST/..." ;;
esac

# 8. The bundle itself must contain this branch's code and the preview flag.
echo "Building Android bundle (first build takes ~1 minute)..."
BUNDLE_FILE="$(mktemp)"
curl -fsS -m 600 "${BUNDLE_URL/https:\/\/$HOST/http://localhost:$PORT}" -o "$BUNDLE_FILE" \
  || fail "could not build the Android bundle; see tmux session $METRO_SESSION"
grep -q 'EXPO_PUBLIC_EXPO_GO_PREVIEW_SKIP_SIGN_IN": { enumerable: true, value: "1" }' "$BUNDLE_FILE" \
  || fail "bundle does not have the skip-sign-in flag inlined"
ok "bundle has the skip-sign-in flag"
grep -q "Send a Ripple" "$BUNDLE_FILE" || fail "bundle is missing the Ripple send screen"
ok "bundle has the Ripple send screen"
rm -f "$BUNDLE_FILE"

# 9. The public tunnel must serve the same manifest.
PUB="$(curl -fsS -m 20 -H 'expo-platform: android' -H 'Accept: application/expo+json' "https://$HOST" 2>/dev/null || true)"
[ -n "$PUB" ] || fail "https://$HOST did not answer; tunnel is down"
printf '%s' "$PUB" | python3 -c "import sys,json;json.load(sys.stdin)['launchAsset']['url']" 2>/dev/null \
  || fail "https://$HOST answered but not with an Expo manifest"
ok "public tunnel serves the Expo manifest"

cat <<EOF

=====================================================================
READY: $BRANCH @ $COMMIT

  Expo Go -> "Enter URL manually" -> exp://$HOST

Expect a gold pill at the top of the screen reading "$LABEL".
No pill means the phone is running a different SameWave (for example the
installed Play app), not this preview. Open the Expo Go app itself.
=====================================================================
EOF
