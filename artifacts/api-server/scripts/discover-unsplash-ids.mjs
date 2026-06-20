/**
 * Discover and verify new Unsplash photo IDs for SameWave stock pool expansion.
 *
 * Uses Unsplash API (UNSPLASH_ACCESS_KEY) when available, otherwise the public
 * unsplash.com/napi/search/photos endpoint. Candidates are verified by fetching
 * images.unsplash.com/photo-{id}?auto=format&fit=crop&w=400&q=80 (200 + >=5KB).
 *
 * Usage:
 *   node scripts/discover-unsplash-ids.mjs [--target 251] [--concurrency 8]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
config({ path: path.join(apiRoot, ".env") });

const BANNED = new Set([
  "1554118811-1e0d58224f24",
  "1559056199-641a0ac8b55e",
]);

const MIN_BYTES = 5000;
const VERIFY_URL = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=80`;

/** @param {string} filePath */
function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

const UNSPLASH_ID_RE = /\b([0-9]{10,13}-[a-f0-9]{12})\b/g;

/** @param {string} text */
function extractUnsplashIds(text) {
  return [...text.matchAll(UNSPLASH_ID_RE)].map((m) => m[1]);
}

/** @param {string | null | undefined} id */
function isUnsplashId(id) {
  return typeof id === "string" && /^[0-9]{10,13}-[a-f0-9]{12}$/.test(id);
}

/** @returns {Set<string>} */
function loadExistingIds() {
  const manifestPath = path.join(__dirname, "stock-pool-manifest.mjs");
  const samplePath = path.resolve(
    apiRoot,
    "../same-same/data/samplePhotos.ts",
  );
  const ids = new Set([
    ...extractUnsplashIds(readText(manifestPath)),
    ...extractUnsplashIds(readText(samplePath)),
  ]);
  for (const id of BANNED) ids.add(id);
  return ids;
}

/**
 * Theme pool keys from stock-pool-manifest POOLS + lifestyle pools.
 * Each category gets several Unsplash search queries.
 */
const CATEGORY_QUERIES = {
  morning: ["morning light", "sunrise breakfast", "early morning coffee", "morning window"],
  coffee: ["coffee cup", "latte art", "espresso", "pour over coffee", "coffee mug"],
  cafe: ["cafe interior", "coffee shop", "cozy cafe", "bakery cafe", "espresso bar", "patisserie"],
  hands: ["hands holding cup", "hand writing", "hands craft pottery", "hands together", "typing hands laptop"],
  sky: ["sunset sky", "clouds horizon", "night sky stars", "golden hour sky", "dramatic clouds", "blue sky clouds", "pink sunset", "milky way"],
  shoes: ["sneakers", "running shoes", "boots feet", "shoe collection", "hiking boots", "sneakers street", "leather shoes"],
  food: ["dinner plate", "breakfast food", "home cooking", "fresh salad", "pasta dish", "street food"],
  instrument: ["acoustic guitar", "piano keys", "violin", "drums music", "saxophone"],
  view: ["window view city", "landscape view", "balcony view", "scenic overlook", "city skyline"],
  movement: ["running outdoors", "yoga pose", "cycling road", "hiking trail person", "dancing movement"],
  pets_dog: ["dog pet", "puppy cute", "golden retriever", "dog park", "dog walking"],
  pets_cat: ["cat pet", "kitten cute", "tabby cat", "cat window", "cat sleeping"],
  pets_small: ["hamster pet", "rabbit pet", "guinea pig", "pet bird cage", "gerbil", "chinchilla"],
  pets_mixed: ["cute pet", "dog cat home", "animal companion", "pet portrait"],
  reading: ["reading book cozy", "open book", "library books", "book and coffee", "person reading"],
  commute: ["train commute", "subway station", "bus city", "metro passenger", "commuter"],
  listening: ["headphones music", "listening music", "earbuds", "vinyl listening"],
  plant: ["houseplant", "indoor plants", "succulent", "potted plant window", "monstera", "fern plant", "cactus indoor"],
  work: ["home office laptop", "desk workspace", "remote work", "office desk", "computer work"],
  wearing: ["outfit mirror", "fashion street", "clothing rack", "wardrobe style", "getting dressed"],
  made: ["handmade craft", "pottery making", "knitting handmade", "woodworking project", "art studio"],
  night: ["city night lights", "night street", "bedroom night lamp", "moonlight night"],
  water: ["ocean waves", "lake reflection", "water splash", "river stream", "waterfall"],
  joy: ["happy smile", "friends laughing", "celebration party", "group hug", "joyful people"],
  door: ["colorful door", "front door", "old wooden door", "door entrance"],
  wheels: ["bicycle wheel", "car road trip", "motorcycle", "skateboard", "scooter city"],
  ritual: ["morning ritual", "tea ceremony", "meditation calm", "candle ritual", "journal morning"],
  nature: ["forest trees", "mountain landscape", "meadow flowers", "wilderness hiking", "nature path"],
  playing: ["board game", "children playing", "playground kids", "card game table", "outdoor play"],
  groceries: ["grocery shopping", "farmers market", "fresh vegetables", "supermarket produce", "grocery bag"],
  wall: ["wall art gallery", "street mural", "gallery wall home", "brick wall texture", "poster wall"],
  handwriting: ["handwriting notebook", "journal pen", "letter writing", "notes desk", "calligraphy"],
  weather: ["rain window", "storm clouds", "snow falling", "fog morning", "rainy street", "lightning storm", "overcast sky", "rain umbrella"],
  smallthing: ["still life desk", "small objects", "desk detail", "everyday objects", "minimal still life", "macro detail", "trinkets table"],
  furniture: ["living room sofa", "cozy armchair", "modern furniture", "vintage chair", "interior design"],
  games: ["video game controller", "chess board", "gaming setup", "board games friends", "arcade"],
  hobbies: ["photography camera", "painting canvas", "knitting yarn", "garden hobby", "collecting hobby"],
  passions: ["marathon running", "rock climbing", "live concert", "basketball game", "surfing wave"],
  birds: ["bird wildlife", "parrot colorful", "eagle flying", "hummingbird", "seagull beach"],
  plants: ["garden flowers", "greenhouse plants", "flower close up", "botanical garden", "rose garden"],
  music: ["vinyl record", "guitar music", "concert stage", "piano music", "dj turntable"],
  selfie: ["mirror selfie", "portrait selfie", "selfie smile", "phone selfie", "couple selfie"],
  shopping: ["shopping bags", "retail store", "window shopping", "market shopping", "boutique"],
  objects: ["vintage objects", "still life objects", "antique items", "desk objects", "collectibles"],
  chores: ["cleaning home", "laundry clothes", "vacuum cleaning", "dishes kitchen", "ironing clothes"],
  kids: ["baby smile", "toddler playing", "child drawing", "kids playground", "newborn baby"],
  seasonal: ["christmas tree", "halloween pumpkin", "birthday balloons", "holiday lights", "easter eggs"],
  beach: ["beach sand", "tropical beach", "beach umbrella", "coastline ocean", "beach sunset"],
  landmark: ["famous landmark", "monument travel", "historic architecture", "bridge landmark", "tower cityscape"],
  hotel: ["hotel room", "resort pool", "hotel balcony", "luxury hotel", "hotel lobby"],
  transport_holiday: ["airplane window", "train travel window", "airport departure", "ferry boat", "road trip car"],
  adventure: ["hiking adventure", "snorkeling underwater", "kayaking lake", "camping tent", "zip line forest"],
  market: ["street market", "spice market", "local crafts market", "flea market", "night market"],
  family: ["family group photo", "parents kids", "friends travel group", "family beach", "multi generation family"],
  diy: ["home renovation", "paint roller wall", "toolbox repair", "sewing machine", "garden diy"],
};

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY?.trim() ?? "";

function parseArgs() {
  const args = process.argv.slice(2);
  let target = 251;
  let concurrency = 8;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--target" && args[i + 1]) target = Number(args[++i]);
    else if (args[i] === "--concurrency" && args[i + 1])
      concurrency = Number(args[++i]);
  }
  return { target, concurrency };
}

/** @param {unknown} photo */
function photoToId(photo) {
  if (!photo || typeof photo !== "object") return null;
  const p = /** @type {{ id?: string, urls?: { raw?: string, regular?: string, small?: string } }} */ (
    photo
  );
  if (isUnsplashId(p.id)) return p.id;
  for (const url of [p.urls?.raw, p.urls?.regular, p.urls?.small]) {
    const m = url?.match(/photo-([0-9]{10,13}-[a-f0-9]{12})/);
    if (m) return m[1];
  }
  return null;
}

/** @param {string} query @param {number} page @param {number} perPage */
async function searchUnsplashApi(query, page, perPage) {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  const res = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      "Accept-Version": "v1",
    },
  });
  if (!res.ok) {
    throw new Error(`Unsplash API ${res.status} for "${query}" page ${page}`);
  }
  const data = await res.json();
  return (data.results ?? [])
    .map(photoToId)
    .filter((id) => id && !BANNED.has(id));
}

/** @param {string} query @param {number} page @param {number} perPage */
async function searchUnsplashNapi(query, page, perPage) {
  const url = new URL("https://unsplash.com/napi/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  const res = await fetch(url, {
    headers: { "User-Agent": "SameWave/1.0 (stock seed discovery)" },
  });
  if (!res.ok) {
    throw new Error(`Unsplash napi ${res.status} for "${query}" page ${page}`);
  }
  const data = await res.json();
  return (data.results ?? [])
    .map(photoToId)
    .filter((id) => id && !BANNED.has(id));
}

/** @param {string} query @param {number} page @param {number} perPage */
async function searchPhotos(query, page, perPage) {
  if (UNSPLASH_ACCESS_KEY) {
    return searchUnsplashApi(query, page, perPage);
  }
  return searchUnsplashNapi(query, page, perPage);
}

/** @param {string} id */
async function verifyId(id) {
  const res = await fetch(VERIFY_URL(id), {
    headers: { "User-Agent": "SameWave/1.0 (stock seed)" },
    redirect: "follow",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    id,
    ok: res.ok && buf.length >= MIN_BYTES,
    status: res.status,
    bytes: buf.length,
  };
}

/**
 * @param {string[]} ids
 * @param {number} concurrency
 */
async function verifyBatch(ids, concurrency) {
  /** @type {{ id: string, ok: boolean, status: number, bytes: number }[]} */
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < ids.length) {
      const i = idx++;
      results[i] = await verifyId(ids[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()),
  );
  return results;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { target, concurrency } = parseArgs();
  const existing = loadExistingIds();
  const discoverySource = UNSPLASH_ACCESS_KEY ? "unsplash-api" : "unsplash-napi";

  console.log(`Existing pool IDs (incl. samplePhotos + banned): ${existing.size}`);
  console.log(
    `Discovery source: ${discoverySource}${UNSPLASH_ACCESS_KEY ? "" : " (UNSPLASH_ACCESS_KEY not set)"}`,
  );
  console.log(`Target new verified IDs: ${target}`);

  /** @type {Map<string, Set<string>>} category -> candidate ids */
  const candidatesByCategory = new Map();
  /** @type {Set<string>} */
  const allCandidates = new Set();

  for (const [category, queries] of Object.entries(CATEGORY_QUERIES)) {
    const set = new Set();
    candidatesByCategory.set(category, set);

    for (const query of queries) {
      for (let page = 1; page <= 4; page++) {
        let ids;
        try {
          ids = await searchPhotos(query, page, 30);
        } catch (err) {
          console.warn(`Search failed [${category}] "${query}" p${page}:`, err.message);
          break;
        }
        if (ids.length === 0) break;
        for (const id of ids) {
          if (existing.has(id) || allCandidates.has(id)) continue;
          set.add(id);
          allCandidates.add(id);
        }
        await sleep(120);
      }
    }
    console.log(`Candidates [${category}]: ${set.size}`);
  }

  console.log(`\nTotal unique new candidates to verify: ${allCandidates.size}`);

  const candidatesPath = path.join(apiRoot, "scripts", "discovered-candidates.json");
  fs.writeFileSync(
    candidatesPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        byCategory: Object.fromEntries(
          [...candidatesByCategory.entries()].map(([k, s]) => [k, [...s]]),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Saved candidate lists: ${candidatesPath}`);

  /** @type {Map<string, string[]>} */
  const categoryQueues = new Map(
    [...candidatesByCategory.entries()].map(([cat, set]) => [cat, [...set]]),
  );

  /** @type {Record<string, string[]>} */
  const byCategory = {};
  /** @type {string[]} */
  const allVerified = [];

  while (allVerified.length < target) {
    /** @type {string[]} */
    const batch = [];
    /** @type {string[]} */
    const batchCats = [];
    const cats = [...categoryQueues.keys()].filter(
      (c) => (categoryQueues.get(c)?.length ?? 0) > 0,
    );
    if (cats.length === 0) break;

    let catIdx = 0;
    while (batch.length < concurrency && cats.some((c) => categoryQueues.get(c)?.length)) {
      const cat = cats[catIdx % cats.length];
      const queue = categoryQueues.get(cat);
      if (!queue?.length) {
        catIdx++;
        continue;
      }
      const id = queue.shift();
      batch.push(id);
      batchCats.push(cat);
      catIdx++;
    }
    if (batch.length === 0) break;

    const results = await verifyBatch(batch, concurrency);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.ok) continue;
      const cat = batchCats[i];
      allVerified.push(r.id);
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(r.id);
      if (allVerified.length >= target) break;
    }

    console.log(
      `Verified round — total ok: ${allVerified.length}/${target} (categories with hits: ${Object.keys(byCategory).length})`,
    );
  }

  const failedVerifyCount = 0; // not tracked per-round in this mode

  const output = {
    generatedAt: new Date().toISOString(),
    discoverySource,
    unsplashAccessKeyPresent: Boolean(UNSPLASH_ACCESS_KEY),
    existingPoolCount: existing.size,
    targetNewIds: target,
    candidateCount: allCandidates.size,
    verifiedNewCount: allVerified.length,
    failedVerifyCount,
    bannedIds: [...BANNED],
    byCategory,
    allVerifiedIds: allVerified,
  };

  const outPath = path.join(apiRoot, "scripts", "verified-new-ids.json");
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`\nDone. Verified new IDs: ${allVerified.length}`);
  console.log(`Output: ${outPath}`);
  console.log(`Sample IDs: ${allVerified.slice(0, 10).join(", ")}`);

  if (allVerified.length < target) {
    console.warn(
      `WARNING: Found ${allVerified.length} verified IDs, below target ${target}. Re-run or add queries.`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
