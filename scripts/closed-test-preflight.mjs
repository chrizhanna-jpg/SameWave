/**
 * Closed-test readiness checks (no secrets printed).
 * Run from workspace root: pnpm preflight:closed-test
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sameSame = path.join(root, "artifacts", "same-same");
const apiServer = path.join(root, "artifacts", "api-server");

const failures = [];
const warnings = [];

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

function envSet(env, key) {
  return !!(env?.[key]?.trim());
}

const appJson = JSON.parse(
  readFileSync(path.join(sameSame, "app.json"), "utf8"),
);
const easJson = JSON.parse(
  readFileSync(path.join(sameSame, "eas.json"), "utf8"),
);
const androidPackage = appJson.expo?.android?.package;
const versionCode = appJson.expo?.android?.versionCode;
const prodEnv = easJson.build?.production?.env ?? {};

const requiredProdKeys = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_DOMAIN",
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_CLERK_PROXY_URL",
];
for (const key of requiredProdKeys) {
  if (!prodEnv[key]?.trim()) {
    failures.push(`eas.json production.env missing ${key}`);
  }
}

if (androidPackage !== "app.echo.samesame") {
  failures.push(
    `app.json android.package is ${androidPackage ?? "?"} (expected app.echo.samesame)`,
  );
}

if (!versionCode || versionCode < 1) {
  failures.push("app.json android.versionCode missing or invalid");
}

const mobileEnv = parseEnvFile(path.join(sameSame, ".env"));
const apiEnv = parseEnvFile(path.join(apiServer, ".env"));

const pkMobile = mobileEnv?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const pkEas = prodEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const pkApi = apiEnv?.CLERK_PUBLISHABLE_KEY?.trim();

if (pkMobile && pkEas && pkMobile !== pkEas) {
  warnings.push(
    "same-same/.env pk_test differs from eas.json production — closed-test AAB uses eas.json",
  );
}
if (pkMobile && pkApi && pkMobile !== pkApi) {
  warnings.push(
    "same-same/.env pk_test differs from api-server/.env CLERK_PUBLISHABLE_KEY — run pnpm sync:clerk-publishable",
  );
}

if (!envSet(apiEnv, "CLERK_SECRET_KEY")) {
  warnings.push(
    "api-server/.env CLERK_SECRET_KEY empty (local dev only — Render must have sk_test for testers)",
  );
}
if (!envSet(apiEnv, "DATABASE_URL")) {
  warnings.push("api-server/.env DATABASE_URL empty");
}
if (!envSet(apiEnv, "OPENAI_API_KEY") && !envSet(apiEnv, "AI_INTEGRATIONS_OPENAI_API_KEY")) {
  warnings.push(
    "api-server/.env OPENAI_API_KEY empty — photo analysis may fail until set on Render",
  );
}

const apiOrigin =
  prodEnv.EXPO_PUBLIC_API_URL?.trim() ||
  (prodEnv.EXPO_PUBLIC_DOMAIN?.trim()
    ? `https://${prodEnv.EXPO_PUBLIC_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
    : "");

if (apiOrigin) {
  const urls = [
    `${apiOrigin}/api/healthz`,
    `${apiOrigin}/api/public/backend-status`,
    `${apiOrigin}/api/privacy`,
  ];
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45_000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        failures.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      if (url.endsWith("backend-status")) {
        const body = await res.json();
        if (!body.databaseReachable) {
          failures.push("Render: databaseReachable is false");
        }
        if (!body.clerkSecretConfigured) {
          failures.push(
            "Render: CLERK_SECRET_KEY not set (sign-in / uploads will fail for testers)",
          );
        }
        if (!body.clerkPublishableConfigured) {
          failures.push("Render: CLERK_PUBLISHABLE_KEY not set");
        }
        if (!body.openAiConfigured) {
          warnings.push(
            "Render: OPENAI_API_KEY not set — analyze/upload AI may fail",
          );
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 120) : String(err);
      failures.push(`${url} unreachable (${msg})`);
    }
  }
}

console.log("SameWave closed-test preflight\n");
console.log(`Android package: ${androidPackage}`);
console.log(`versionCode (next AAB): ${versionCode}`);
console.log(`Production API origin: ${apiOrigin || "(not set)"}\n`);

if (warnings.length) {
  console.log("Warnings:");
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
}

if (failures.length) {
  console.log("Must fix before closed test:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}

console.log("Repo + deployed API checks passed.");
console.log(
  "\nOnly you can fix (not in git): Play signing SHA in Google Cloud, Clerk allowlist app.echo.samesame://callback, RevenueCat Play credentials, Play tester list, Render cold-start if service sleeps.",
);
