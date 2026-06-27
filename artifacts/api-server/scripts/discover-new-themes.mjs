/**
 * Discover + verify 6 Unsplash IDs per NEW SameWave theme using the no-key
 * public path (unsplash.com/napi + images.unsplash.com CDN verification).
 * Writes scripts/new-theme-ids.json: { theme: [6 verified ids] }.
 *
 *   node scripts/discover-new-themes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");

const MIN_BYTES = 5000;
const PER_THEME = 6;
const VERIFY_URL = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=80`;
const UNSPLASH_ID_RE = /\b([0-9]{10,13}-[a-f0-9]{12})\b/g;

const BANNED = new Set([
  "1554118811-1e0d58224f24",
  "1559056199-641a0ac8b55e",
]);

function readText(p) {
  return fs.readFileSync(p, "utf8");
}
function extractIds(text) {
  return [...text.matchAll(UNSPLASH_ID_RE)].map((m) => m[1]);
}

function loadExistingIds() {
  const files = [
    path.join(__dirname, "stock-pool-manifest.mjs"),
    path.join(__dirname, "stock-pool-curation.mjs"),
    path.join(__dirname, "stock-pool-assignments.json"),
    path.resolve(apiRoot, "../same-same/data/samplePhotos.ts"),
  ];
  const ids = new Set(BANNED);
  for (const f of files) {
    if (fs.existsSync(f)) for (const id of extractIds(readText(f))) ids.add(id);
  }
  return ids;
}

const THEME_QUERIES = {
  butterfly: ["butterfly", "butterfly wings", "monarch butterfly", "butterfly flower", "butterfly macro", "blue butterfly"],
  moth: ["moth", "luna moth", "moth wings", "moth macro", "moth insect", "moth night"],
  art: ["painting art", "art gallery", "artist studio", "abstract painting", "art canvas", "mural street art"],
  baking: ["baking bread", "baking cookies", "fresh baked pastry", "homemade cake baking", "bakery oven", "kneading dough"],
  garden: ["gardening", "vegetable garden", "backyard garden", "planting garden soil", "greenhouse plants", "garden watering"],
  fishing: ["fishing rod", "fly fishing river", "fishing lake", "fisherman boat", "fishing reel", "fishing dawn"],
  hiking: ["hiking trail", "mountain hiking", "hiker backpack", "hiking forest path", "trekking mountains", "summit hike view"],
  yoga: ["yoga pose", "yoga mat home", "yoga studio", "yoga outdoors", "yoga meditation", "yoga stretch sunrise"],
  gym: ["gym workout", "weight lifting", "dumbbells gym", "barbell training", "gym equipment", "fitness gym indoor"],
  camping: ["camping tent", "campfire night", "campsite forest", "tent mountains", "camping lake", "camping outdoors"],
  travel: ["travel suitcase", "passport travel map", "airport departure travel", "world travel adventure", "backpacker travel", "travel luggage"],
  beach: ["beach sand", "tropical beach", "beach waves", "beach umbrella", "ocean beach coast", "beach footprints"],
  swimming: ["swimming pool", "swimmer water", "swimming underwater", "pool lane swim", "ocean swim", "diving pool"],
  concert: ["concert crowd", "live concert stage", "concert lights", "band performing concert", "concert audience hands", "rock concert"],
  festival: ["festival crowd", "music festival", "festival lights night", "outdoor festival stage", "carnival festival", "festival celebration"],
  wedding: ["wedding ceremony", "wedding rings", "bride and groom", "wedding bouquet", "wedding reception table", "wedding dress"],
  baby: ["newborn baby", "baby feet", "baby smile", "infant sleeping", "baby tiny hands", "baby crib"],
  graduation: ["graduation cap", "graduation ceremony", "graduate gown", "graduation throwing caps", "diploma graduation", "university graduation"],
  birthday: ["birthday cake candles", "birthday balloons", "birthday party", "birthday gift box", "birthday celebration", "birthday cupcake"],
  newhome: ["new home keys", "moving boxes home", "new house exterior", "house keys hand", "moving day boxes", "empty new apartment"],
  cooking: ["cooking kitchen", "chef cooking pan", "home cooking stove", "preparing food cutting", "cooking vegetables", "cooking sauce pot"],
};

async function searchNapi(query, page, perPage) {
  const url = new URL("https://unsplash.com/napi/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  const res = await fetch(url, { headers: { "User-Agent": "SameWave/1.0 (stock seed discovery)" } });
  if (!res.ok) throw new Error(`napi ${res.status} for "${query}" p${page}`);
  const data = await res.json();
  return (data.results ?? [])
    .map((p) => {
      if (typeof p.id === "string" && /^[0-9]{10,13}-[a-f0-9]{12}$/.test(p.id)) return p.id;
      for (const u of [p.urls?.raw, p.urls?.regular, p.urls?.small]) {
        const m = u?.match(/photo-([0-9]{10,13}-[a-f0-9]{12})/);
        if (m) return m[1];
      }
      return null;
    })
    .filter((id) => id && !BANNED.has(id));
}

async function verifyId(id) {
  try {
    const res = await fetch(VERIFY_URL(id), {
      headers: { "User-Agent": "SameWave/1.0 (stock seed)" },
      redirect: "follow",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return res.ok && buf.length >= MIN_BYTES;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const existing = loadExistingIds();
  const taken = new Set(existing);
  const out = {};
  const report = {};

  for (const [theme, queries] of Object.entries(THEME_QUERIES)) {
    const verified = [];
    const seen = new Set();
    outer: for (const query of queries) {
      for (let page = 1; page <= 4 && verified.length < PER_THEME; page++) {
        let ids;
        try {
          ids = await searchNapi(query, page, 30);
        } catch (e) {
          console.warn(`  [${theme}] "${query}" p${page}: ${e.message}`);
          break;
        }
        if (!ids.length) break;
        for (const id of ids) {
          if (verified.length >= PER_THEME) break outer;
          if (taken.has(id) || seen.has(id)) continue;
          seen.add(id);
          if (await verifyId(id)) {
            verified.push(id);
            taken.add(id);
          }
        }
        await sleep(100);
      }
      if (verified.length >= PER_THEME) break;
    }
    out[theme] = verified;
    report[theme] = verified.length;
    console.log(`${theme}: ${verified.length}/${PER_THEME} -> ${verified.join(", ")}`);
  }

  const outPath = path.join(__dirname, "new-theme-ids.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("\nWrote", outPath);
  const short = Object.entries(report).filter(([, n]) => n < PER_THEME);
  if (short.length) {
    console.warn("UNDERFILLED:", short.map(([t, n]) => `${t}=${n}`).join(", "));
    process.exitCode = 2;
  } else {
    console.log("All themes filled to", PER_THEME);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
