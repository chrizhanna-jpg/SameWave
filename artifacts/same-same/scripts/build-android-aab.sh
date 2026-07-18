#!/usr/bin/env bash
# Build a Play-ready .aab on Linux/macOS (EAS --local alternative).
# Prereqs: Android SDK (ANDROID_HOME), Java 17+, credentials.json from EAS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAME_SAME="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$SAME_SAME/android"
CREDENTIALS_JSON="$SAME_SAME/credentials.json"

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "ANDROID_HOME is not set. Install the Android SDK or export ANDROID_HOME."
  exit 1
fi

if [[ ! -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
  echo "Android platform-tools not found under ANDROID_HOME=$ANDROID_HOME"
  exit 1
fi

if [[ ! -f "$CREDENTIALS_JSON" ]]; then
  echo ""
  echo "Signing credentials required (same keystore as Play uploads)."
  echo "Run once (interactive):"
  echo "  cd \"$SAME_SAME\""
  echo "  pnpm exec eas login"
  echo "  pnpm exec eas credentials -p android"
  echo "  # Download credentials to credentials.json + keystore (gitignored)"
  echo ""
  echo "Or set EXPO_TOKEN and run: pnpm exec eas build --platform android --profile production"
  exit 1
fi

export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")}"
export PATH="$JAVA_HOME/bin:${ANDROID_HOME}/platform-tools:$PATH"
export EXPO_NO_METRO_WORKSPACE_ROOT=1
export EXPO_USE_METRO_WORKSPACE_ROOT=0
export NODE_ENV=production

cd "$SAME_SAME"

echo "=== SameWave local Android AAB (Linux) ==="
java -version

if [[ ! -d "$ANDROID_DIR" ]] || [[ "${SKIP_ANDROID_PREBUILD:-}" != "1" ]]; then
  echo "Generating native android/ (expo prebuild)..."
  pnpm exec expo prebuild --platform android --no-install
fi

patch_react_root() {
  local gradle="$ANDROID_DIR/app/build.gradle"
  [[ -f "$gradle" ]] || return 0
  if grep -q 'root = file("../../")' "$gradle"; then return 0; fi
  python3 - "$gradle" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text()
needle = "    /* Folders */"
if needle not in text or 'root = file("../../")' in text:
    sys.exit(0)
patch = needle + "\n    // Expo app root (artifacts/same-same/package.json), not android/.\n    root = file(\"../../\")\n"
text = re.sub(re.escape(needle) + r"[\s\S]*?(?=    /\* Variants \*/)", patch, text, count=1)
p.write_text(text)
print("Patched react.root in android/app/build.gradle")
PY
}

patch_package() {
  local gradle="$ANDROID_DIR/app/build.gradle"
  local pkg
  pkg="$(python3 -c "import json; print(json.load(open('app.json'))['expo']['android']['package'])")"
  [[ -f "$gradle" ]] || return 0
  python3 - "$gradle" "$pkg" <<'PY'
import pathlib, re, sys
p, pkg = pathlib.Path(sys.argv[1]), sys.argv[2]
text = p.read_text()
updated = re.sub(r"namespace\s+['\"][^'\"]+['\"]", f'namespace "{pkg}"', text)
updated = re.sub(r"applicationId\s+['\"][^'\"]+['\"]", f'applicationId "{pkg}"', updated)
if updated != text:
    p.write_text(updated)
    print(f"Patched android package -> {pkg}")
PY
}

patch_architectures() {
  local props="$ANDROID_DIR/gradle.properties"
  [[ -f "$props" ]] || return 0
  if grep -q '^reactNativeArchitectures=arm64-v8a$' "$props"; then return 0; fi
  sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a/' "$props" \
    || echo "reactNativeArchitectures=arm64-v8a" >> "$props"
  echo "Patched reactNativeArchitectures=arm64-v8a"
}

patch_signing() {
  local gradle="$ANDROID_DIR/app/build.gradle"
  [[ -f "$gradle" && -f "$CREDENTIALS_JSON" ]] || return 0
  python3 - "$gradle" "$CREDENTIALS_JSON" <<'PY'
import json, pathlib, re, sys
gradle = pathlib.Path(sys.argv[1])
creds = json.load(open(sys.argv[2]))
ks = creds.get("android", {}).get("keystore")
if not ks:
    sys.exit(0)
store_rel = ks["keystorePath"].replace("\\", "/").lstrip("/")
text = gradle.read_text()
text = re.sub(
    r"\s*release\s*\{\s*storeFile file\(\"../../[^\"]+\"\)\s*storePassword \"[^\"]*\"\s*keyAlias \"[^\"]*\"\s*keyPassword \"[^\"]*\"\s*\}",
    "",
    text,
    flags=re.S,
)
block = f'''
        release {{
            storeFile file("../../{store_rel}")
            storePassword "{ks["keystorePassword"]}"
            keyAlias "{ks["keyAlias"]}"
            keyPassword "{ks["keyPassword"]}"
        }}'''
if not re.search(r"signingConfigs\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?storeFile", text):
    text = re.sub(r"(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\})", r"\1" + block, text, count=1, flags=re.S)
text = re.sub(
    r"(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug",
    r"\1signingConfig signingConfigs.release",
    text,
    count=1,
    flags=re.S,
)
gradle.write_text(text)
print("Patched release signing from credentials.json")
PY
}

patch_react_root
patch_package
patch_architectures
patch_signing

echo "Running Gradle bundleRelease (may take several minutes)..."
cd "$ANDROID_DIR"
./gradlew --stop 2>/dev/null || true
./gradlew bundleRelease

aab="$(find app/build/outputs/bundle/release -name '*.aab' -print -quit)"
if [[ -z "$aab" ]]; then
  echo "No .aab found under app/build/outputs/bundle/release"
  exit 1
fi

OUT_DIR="${SW_AAB_OUTPUT_DIR:-$SAME_SAME/aab}"
mkdir -p "$OUT_DIR"
vc="$(python3 -c "import json; print(json.load(open('$SAME_SAME/app.json'))['expo']['android']['versionCode'])")"
cp "$aab" "$OUT_DIR/SameWave-vc${vc}.aab"
cp "$aab" "$OUT_DIR/SameWave-latest.aab"
echo ""
echo "AAB built:"
echo "  $OUT_DIR/SameWave-latest.aab"
echo "  $OUT_DIR/SameWave-vc${vc}.aab"
