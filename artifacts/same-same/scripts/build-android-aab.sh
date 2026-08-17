#!/usr/bin/env bash
# Build a Play-ready Android App Bundle (.aab) locally on Linux/macOS.
# Bash counterpart of build-android-aab.ps1 (Windows).
#
# Prerequisites:
#   - Android SDK + NDK 27.1.12297006 + cmake (set ANDROID_HOME / ANDROID_SDK_ROOT)
#   - JDK 17+ and pnpm on PATH
#   - For an UPLOAD-signed AAB: download the app's upload key from EAS into
#     artifacts/same-same/credentials.json (+ keystore.jks) via:
#         pnpm exec eas credentials -p android   # choose production → download
#     Without credentials.json the debug key is used: the app still LAUNCHES for
#     testing, but Google Play will reject the file ("signed with the wrong key").
#
# Output: android/app/build/outputs/bundle/release/app-release.aab
set -euo pipefail

SAME_SAME="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SAME_SAME"

: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
if [ -z "${ANDROID_HOME}" ] || [ ! -d "${ANDROID_HOME}" ]; then
  echo "ERROR: set ANDROID_HOME (or ANDROID_SDK_ROOT) to your Android SDK path." >&2
  exit 1
fi
export ANDROID_HOME ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export NODE_ENV=production

echo "== expo prebuild (android) =="
pnpm exec expo prebuild --platform android --no-install

echo "== raise Gradle heap/metaspace (avoids artProfile/lint OOM) =="
GP="android/gradle.properties"
if grep -q '^org.gradle.jvmargs' "$GP"; then
  sed -i 's|^org.gradle.jvmargs=.*|org.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=2g|' "$GP"
else
  printf '\norg.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=2g\n' >> "$GP"
fi

echo "== apply upload signing from credentials.json (if present) =="
SW_SAME_SAME="$SAME_SAME" node scripts/patch-android-signing.mjs

echo "== gradle :app:bundleRelease =="
( cd android && ./gradlew :app:bundleRelease \
    -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease )

AAB="$SAME_SAME/android/app/build/outputs/bundle/release/app-release.aab"
if [ ! -f "$AAB" ]; then
  echo "ERROR: expected AAB not found at $AAB" >&2
  exit 1
fi
echo ""
echo "AAB built: $AAB"
echo "Upload it in Play Console (must be signed with your registered upload key)."
