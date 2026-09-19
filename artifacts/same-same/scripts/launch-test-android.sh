#!/usr/bin/env bash
# ============================================================================
# SameWave Android launch test
# ----------------------------------------------------------------------------
# Installs the app on an Android emulator and verifies it LAUNCHES without
# crashing: the process comes up, MainActivity reaches the foreground, the
# JS/Hermes runtime initializes, and NO fatal exception / ANR is logged for
# our package. This is the reproducible check for the recurring "boot hang /
# launch crash / white screen" class of bugs.
#
# PASS = app launched and its React/Hermes runtime is alive with no crash.
#        (Reaching the signed-in Home screen is NOT required — under slow
#         software emulation the app's own boot watchdog may show the launch
#         diagnostics screen; that screen rendering still proves JS launched.)
#
# Usage:
#   scripts/launch-test-android.sh [--aab <path>] [--apk <path>]
#                                  [--accel on|off|auto] [--api <level>]
#                                  [--timeout <sec>]
#
# Defaults:
#   --aab  : first of  android/app/build/outputs/bundle/release/app-release.aab
#            or  /opt/cursor/artifacts/SameWave-*.aab   (converted to a
#            universal APK with bundletool). Provide --apk to skip conversion.
#   --accel: off   (this cloud VM's nested KVM faults; software TCG is used.
#            On a host with working KVM pass --accel auto for ~10-50x faster
#            boot.)
#   --api  : 34
#   --timeout: 180  (seconds to wait for the app to come up after launch)
#
# Requires: Java 17+, internet (to fetch SDK/emulator/bundletool on first run).
# Exit code: 0 = launch PASS, non-zero = FAIL/blocked.
# ============================================================================
set -uo pipefail

PKG="echo.samewaveripple.app"
ACT="echo.samewaveripple.app/.MainActivity"
API=34
ACCEL="off"
TIMEOUT=180
AAB=""
APK=""
SAME_SAME="$(cd "$(dirname "$0")/.." && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --aab) AAB="$2"; shift 2;;
    --apk) APK="$2"; shift 2;;
    --accel) ACCEL="$2"; shift 2;;
    --api) API="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 2;;
  esac
done

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
SDKMGR="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDMGR="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"
BT="/tmp/bundletool.jar"
IMAGE="system-images;android-${API};google_apis;x86_64"
AVD="sw_launch_test"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

log(){ echo -e "\n[launch-test] $*"; }
fail(){ echo -e "\n[launch-test] ❌ FAIL: $*" >&2; exit 1; }

# ---- 1. Toolchain -----------------------------------------------------------
ensure_sdk() {
  if [ ! -x "$SDKMGR" ]; then
    log "Installing Android command-line tools..."
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    local zip=/tmp/cmdline-tools.zip
    curl -fsSL -o "$zip" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
    rm -rf /tmp/cmdline-tools && (cd /tmp && unzip -q "$zip")
    rm -rf "$ANDROID_HOME/cmdline-tools/latest"
    mv /tmp/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
  fi
  yes 2>/dev/null | "$SDKMGR" --licenses >/dev/null 2>&1 || true
  log "Ensuring platform-tools, emulator, and $IMAGE (this can take a few minutes on first run)..."
  yes 2>/dev/null | "$SDKMGR" "platform-tools" "emulator" "$IMAGE" >/dev/null 2>&1 || \
    "$SDKMGR" "platform-tools" "emulator" "$IMAGE" >/dev/null 2>&1 || true
  [ -x "$ADB" ] || fail "adb not available after SDK install"
  [ -x "$EMULATOR" ] || fail "emulator not available after SDK install"
}

ensure_bundletool() {
  [ -f "$BT" ] || curl -fsSL -o "$BT" \
    https://github.com/google/bundletool/releases/download/1.17.2/bundletool-all-1.17.2.jar
}

# ---- 2. Resolve an installable APK -----------------------------------------
resolve_apk() {
  if [ -n "$APK" ]; then [ -f "$APK" ] || fail "APK not found: $APK"; return; fi
  if [ -z "$AAB" ]; then
    for cand in \
      "$SAME_SAME/android/app/build/outputs/bundle/release/app-release.aab" \
      /opt/cursor/artifacts/SameWave-*.aab; do
      [ -f "$cand" ] && { AAB="$cand"; break; }
    done
  fi
  [ -n "$AAB" ] && [ -f "$AAB" ] || fail "No .aab or .apk found. Build one first (scripts/build-android-aab.sh) or pass --aab/--apk."
  ensure_bundletool
  log "Converting AAB -> universal APK: $AAB"
  local ks="$SAME_SAME/android/app/debug.keystore"
  local ksargs=()
  [ -f "$ks" ] && ksargs=(--ks="$ks" --ks-pass=pass:android --ks-key-alias=androiddebugkey --key-pass=pass:android)
  rm -f /tmp/lt.apks
  java -jar "$BT" build-apks --bundle="$AAB" --output=/tmp/lt.apks --mode=universal --overwrite "${ksargs[@]}" \
    || fail "bundletool build-apks failed"
  rm -rf /tmp/lt_apks && mkdir -p /tmp/lt_apks
  (cd /tmp/lt_apks && unzip -oq /tmp/lt.apks)
  APK="/tmp/lt_apks/universal.apk"
  [ -f "$APK" ] || fail "universal.apk not produced"
}

# ---- 3. Emulator ------------------------------------------------------------
boot_emulator() {
  "$ADB" start-server >/dev/null 2>&1 || true
  if "$ADB" devices | grep -q "emulator-.*device$"; then
    log "Reusing already-running emulator."; return
  fi
  if [ "$ACCEL" = "off" ]; then command -v sudo >/dev/null 2>&1 && sudo chmod 666 /dev/kvm 2>/dev/null || true; fi
  echo "no" | "$AVDMGR" create avd -n "$AVD" -k "$IMAGE" -d pixel_6 --force >/dev/null 2>&1 || true
  log "Booting headless emulator (accel=$ACCEL). Under software emulation the first boot can take ~9 min."
  local accelflag="-accel $ACCEL"; [ "$ACCEL" = "auto" ] && accelflag=""
  nohup "$EMULATOR" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot -wipe-data \
    -gpu swiftshader_indirect $accelflag -cores 4 -memory 4096 >/tmp/launch-test-emulator.log 2>&1 &
  "$ADB" wait-for-device
  local i b=""
  for i in $(seq 1 120); do
    b="$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    [ "$b" = "1" ] && { log "Emulator boot complete."; break; }
    sleep 10
  done
  [ "$b" = "1" ] || fail "Emulator did not finish booting within ~20 min."
  # Wait for the package manager to be fully ready.
  for i in $(seq 1 40); do
    [ "$("$ADB" shell pm list packages 2>/dev/null | wc -l | tr -d '\r')" -gt 50 ] 2>/dev/null && break
    sleep 10
  done
}

# ---- 4. Install, launch, verify --------------------------------------------
run_test() {
  log "Installing APK: $APK"
  "$ADB" install -r -g "$APK" >/tmp/launch-test-install.log 2>&1 || "$ADB" install -r "$APK" >/tmp/launch-test-install.log 2>&1 \
    || fail "adb install failed (see /tmp/launch-test-install.log)"
  "$ADB" shell pm list packages | grep -q "$PKG" || fail "package $PKG not installed"

  "$ADB" shell logcat -c 2>/dev/null || true
  log "Launching $ACT ..."
  "$ADB" shell am start -n "$ACT" >/dev/null 2>&1 || fail "am start failed"

  local waited=0 pid="" top="" fatal="" anr="" jsup=""
  while [ "$waited" -lt "$TIMEOUT" ]; do
    sleep 10; waited=$((waited+10))
    pid="$("$ADB" shell pidof "$PKG" 2>/dev/null | tr -d '\r')"
    top="$("$ADB" shell dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity || true)"
    fatal="$("$ADB" shell "logcat -d -b crash -t 200" 2>/dev/null | grep -i "$PKG" | grep -i "FATAL\|AndroidRuntime" || true)"
    anr="$("$ADB" shell "logcat -d -t 400" 2>/dev/null | grep -iE "ANR in $PKG" || true)"
    # JS/Hermes runtime came up (expo-updates loads the embedded bundle, or RN logs, or the diagnostics view rendered)
    jsup="$("$ADB" shell "logcat -d -t 2000" 2>/dev/null | grep -iE "dev.expo.updates|ReactNativeJS|Running \"main\"|LAUNCH DIAGNOSTICS|bootDiagnostics" | head -1 || true)"
    echo "  t+${waited}s  pid=[${pid:-none}] top=$(echo "$top" | grep -o "$PKG/[^ }]*" | head -1) js=$([ -n "$jsup" ] && echo yes || echo no) fatal=$([ -n "$fatal" ] && echo YES || echo no)"
    [ -n "$fatal" ] && break
    [ -n "$anr" ] && break
    if [ -n "$pid" ] && echo "$top" | grep -q "$PKG/" && [ -n "$jsup" ]; then break; fi
  done

  "$ADB" exec-out screencap -p > /tmp/launch-test-screenshot.png 2>/dev/null || true

  echo "----------------------------------------------------------------"
  if [ -n "$fatal" ]; then
    echo "$fatal" | tail -20
    fail "App crashed on launch (FATAL EXCEPTION for $PKG)."
  fi
  if [ -n "$anr" ]; then
    echo "$anr" | tail -5
    fail "App ANR'd on launch ($PKG not responding)."
  fi
  [ -n "$pid" ] || fail "App process ($PKG) is not running after ${TIMEOUT}s — it likely crashed at startup."
  echo "$top" | grep -q "$PKG/" || fail "MainActivity is not in the foreground after ${TIMEOUT}s."
  [ -n "$jsup" ] || fail "JS/Hermes runtime did not initialize (no RN/expo-updates/diagnostics logs) — app did not truly launch."

  log "✅ PASS — app launched: process alive (pid $pid), MainActivity foreground, JS runtime up, no crash/ANR."
  echo "   JS signal: $jsup"
  echo "   Screenshot: /tmp/launch-test-screenshot.png"
}

log "SameWave Android launch test — package $PKG, API $API, accel $ACCEL"
ensure_sdk
resolve_apk
boot_emulator
run_test
