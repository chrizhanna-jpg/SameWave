/**
 * Wire EAS credentials.json into the generated android/app/build.gradle release
 * signing config (the Play upload key). Cross-platform Node port of
 * patch-android-signing.ps1. Idempotent and a no-op when credentials.json is
 * absent (the build then falls back to the debug key — launch-testable, but NOT
 * accepted by Google Play).
 *
 * credentials.json shape (as downloaded by `eas credentials -p android`):
 *   { "android": { "keystore": {
 *       "keystorePath": "keystore.jks",
 *       "keystorePassword": "…", "keyAlias": "…", "keyPassword": "…" } } }
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sameSame = process.env.SW_SAME_SAME || path.join(here, "..");
const credsFile = path.join(sameSame, "credentials.json");
const buildGradle = path.join(sameSame, "android", "app", "build.gradle");

if (!fs.existsSync(credsFile) || !fs.existsSync(buildGradle)) {
  console.log(
    "[signing] no credentials.json — leaving default (debug) signing. " +
      "Download the upload key with `eas credentials -p android` for a Play-ready AAB.",
  );
  process.exit(0);
}

const creds = JSON.parse(fs.readFileSync(credsFile, "utf8"));
const ks = creds?.android?.keystore;
if (!ks?.keystorePath) {
  console.log("[signing] credentials.json has no android.keystore; skipping.");
  process.exit(0);
}

const storeRel = String(ks.keystorePath).replace(/\\/g, "/").replace(/^\/+/, "");
let content = fs.readFileSync(buildGradle, "utf8");

// Drop any previously injected release block so repeated runs stay idempotent.
content = content.replace(
  /\s*release\s*\{\s*storeFile file\("\.\.\/\.\.\/[^"]+"\)\s*storePassword "[^"]*"\s*keyAlias "[^"]*"\s*keyPassword "[^"]*"\s*\}/gms,
  "",
);

const releaseBlock =
  `\n        release {` +
  `\n            storeFile file("../../${storeRel}")` +
  `\n            storePassword "${ks.keystorePassword}"` +
  `\n            keyAlias "${ks.keyAlias}"` +
  `\n            keyPassword "${ks.keyPassword}"` +
  `\n        }`;

// Add a release signingConfig next to the debug one (only if not already there).
if (!/signingConfigs\s*\{[\s\S]*?\brelease\s*\{[\s\S]*?storeFile/m.test(content)) {
  content = content.replace(
    /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\})/m,
    `$1${releaseBlock}`,
  );
}

// Point the release build type at signingConfigs.release.
content = content.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/m,
  "$1signingConfig signingConfigs.release",
);

fs.writeFileSync(buildGradle, content);
console.log("[signing] patched release signing from credentials.json (upload key)");
