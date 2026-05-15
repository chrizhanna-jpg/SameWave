/**
 * Copy EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY from same-same/.env into
 * api-server/.env as CLERK_PUBLISHABLE_KEY (does not touch CLERK_SECRET_KEY).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobileEnv = path.join(root, "..", "same-same", ".env");
const apiEnv = path.join(root, ".env");

function parse(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
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

function setEnvLine(text, key, val) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}=.*$`, "m");
  if (re.test(text)) return text.replace(re, `${key}=${val}`);
  return `${text.trimEnd()}\n${key}=${val}\n`;
}

if (!existsSync(mobileEnv)) {
  console.log("skip: same-same/.env not found");
  process.exit(0);
}
if (!existsSync(apiEnv)) {
  console.log("skip: api-server/.env not found");
  process.exit(1);
}

const pk = parse(readFileSync(mobileEnv, "utf8"))
  .EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
if (!pk) {
  console.log("skip: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY empty in same-same/.env");
  process.exit(0);
}

let text = readFileSync(apiEnv, "utf8");
text = setEnvLine(text, "CLERK_PUBLISHABLE_KEY", pk);
if (!text.endsWith("\n")) text += "\n";
writeFileSync(apiEnv, text, "utf8");

const secret = parse(readFileSync(apiEnv, "utf8")).CLERK_SECRET_KEY?.trim();
console.log("updated CLERK_PUBLISHABLE_KEY from same-same/.env");
console.log(
  secret
    ? "CLERK_SECRET_KEY: already set"
    : "CLERK_SECRET_KEY: still empty — paste sk_test_… from Clerk Dashboard",
);
