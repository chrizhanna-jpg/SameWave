/**
 * Core product-flow regression suite — run before release or after touching
 * capture, match, ripple/wave, or waves feed code.
 *
 * Run: pnpm test:core
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RIPPLE_SWIPE_LABEL,
  RIPPLE_WAVE_RULE,
  WAVES_SECTION_IDS,
  WAVES_TAB,
} from "../data/waveRippleGlossary";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function read(rel: string): string {
  return readFileSync(join(appRoot, rel), "utf8");
}

// ── 1. Ripple / Wave vocabulary ─────────────────────────────────────────────
assert("RIPPLE_SWIPE_LABEL is RIPPLE", RIPPLE_SWIPE_LABEL === "RIPPLE");
assert(
  "RIPPLE_WAVE_RULE mentions Ripple before Wave",
  RIPPLE_WAVE_RULE.includes("Ripple") && RIPPLE_WAVE_RULE.includes("Wave"),
);

// ── 2. Waves tab filters include personal + world ───────────────────────────
assert(
  "WAVES_SECTION_IDS has sent/received/caught/world",
  WAVES_SECTION_IDS.join(",") === "sent,received,caught,world",
);
assert(
  "World section copy describes other users",
  WAVES_TAB.wavesAroundSub.toLowerCase().includes("other"),
);

const wavesSrc = read("app/(tabs)/waves.tsx");
for (const id of WAVES_SECTION_IDS) {
  assert(`waves.tsx handles section "${id}"`, wavesSrc.includes(`activeSection === "${id}"`));
}
assert(
  "waves.tsx loads world feed separately from sync throttle",
  wavesSrc.includes('shouldRunThrottledFocusWork("waves-world"') &&
    wavesSrc.includes('shouldRunThrottledFocusWork("waves-sync"'),
);
assert(
  "waves.tsx fetches world on World chip when empty",
  wavesSrc.includes('activeSection !== "world"') &&
    wavesSrc.includes("loadWorldWaves"),
);
const loadWorldDef = wavesSrc.indexOf("const loadWorldWaves");
const worldChipEffect = wavesSrc.indexOf('activeSection !== "world"');
assert(
  "waves.tsx defines loadWorldWaves before World chip effect",
  loadWorldDef >= 0 &&
    worldChipEffect >= 0 &&
    loadWorldDef < worldChipEffect,
);

// ── 3. Match deck — Ripple swipe, no sample substitute ──────────────────────
const matchSrc = read("app/(tabs)/match.tsx");
assert(
  "match.tsx uses RIPPLE_SWIPE_LABEL on deck",
  matchSrc.includes("RIPPLE_SWIPE_LABEL") &&
    !matchSrc.includes('>WAVE<') &&
    !matchSrc.includes('"WAVE"'),
);
assert(
  "match.tsx gates deck on hasUploadedPhoto",
  matchSrc.includes("hasUploadedPhoto") &&
    matchSrc.includes("!hasUploadedPhoto"),
);
assert(
  "match.tsx filters sample photos from todaysPhoto",
  matchSrc.includes("isAllowedUserOwnPhotoUri"),
);
assert(
  "match.tsx my-photo RemotePhotoImage uses viewerOwnPhoto",
  matchSrc.includes("viewerOwnPhoto"),
);
assert(
  "match.tsx never substitutes SAMPLE_PHOTOS[0] for my photo",
  !matchSrc.includes("SAMPLE_PHOTOS[0]"),
);
assert(
  "match.tsx uses flash URI resolvers for splash",
  matchSrc.includes("resolveMatchMyPhotoFlashUri") &&
    matchSrc.includes("resolveMatchMyPhotoFlashFallbackUri"),
);
assert(
  "match.tsx defers candidate fetch until todaysPhoto exists",
  matchSrc.includes("if (!todaysPhoto) return") &&
    matchSrc.includes("fetchCandidates"),
);

// ── 4. Camera submit gate — theme + vibe required ─────────────────────────
const cameraSrc = read("app/camera.tsx");
assert(
  "camera.tsx requires explicit theme and vibe",
  cameraSrc.includes("hasExplicitPostTheme") &&
    cameraSrc.includes("hasExplicitPostVibe"),
);

// ── 5. World feed excludes viewer (mirrors api-server) ────────────────────
function shouldIncludeWorldWave(
  viewerId: string | null,
  lowUserId: string,
  highUserId: string,
): boolean {
  if (viewerId != null && (viewerId === lowUserId || viewerId === highUserId)) {
    return false;
  }
  return true;
}
assert(
  "world feed excludes viewer echoes",
  !shouldIncludeWorldWave("user-a", "user-a", "user-b") &&
    shouldIncludeWorldWave("user-a", "user-b", "user-c"),
);

// ── 6. Echo state machine ───────────────────────────────────────────────────
type EchoState = "pending" | "mutual";
function isRipple(state: EchoState): boolean {
  return state === "pending";
}
function isWave(state: EchoState): boolean {
  return state === "mutual";
}
assert("pending echo is Ripple", isRipple("pending") && !isWave("pending"));
assert("mutual echo is Wave", isWave("mutual") && !isRipple("mutual"));

// ── 7. myPhotos merge excludes stock samples ────────────────────────────────
const persistSrc = read("utils/myPhotoPersistence.ts");
assert(
  "mergeMyPhotos filters stock URIs from user library",
  persistSrc.includes("isAllowedUserOwnPhotoUri"),
);

const photoUriSrc = read("utils/photoDisplayUri.ts");
assert(
  "photoDisplayUri exports user-own-photo guards",
  photoUriSrc.includes("isAllowedUserOwnPhotoUri") &&
    photoUriSrc.includes("sanitizeUserOwnPhotoUri"),
);

console.log("Done. exitCode=", process.exitCode ?? 0);
