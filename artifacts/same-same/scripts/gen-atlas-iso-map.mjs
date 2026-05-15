import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const codesPath = require.resolve("i18n-iso-countries/codes.json");
const codes = JSON.parse(fs.readFileSync(codesPath, "utf8"));
const lines = [];
lines.push(
  "/** ISO 3166-1 numeric (3-digit string) -> alpha-2. Static map for Metro (avoids i18n-iso-countries resolution issues). */",
);
lines.push("export const ISO3166_NUMERIC_3_TO_ALPHA2: Record<string, string> = {");
for (const row of codes) {
  const a2 = row[0];
  const num = String(row[2]).padStart(3, "0");
  lines.push(`  "${num}": "${a2}",`);
}
lines.push("};");
lines.push("");
const out = path.join(__dirname, "..", "data", "atlasIso3166NumericToAlpha2.ts");
fs.writeFileSync(out, lines.join("\n"));
console.log("wrote", out, "entries", codes.length);
