// Music library for the "vibe clip" feature. Each photo carries a
// `musicGenre` label (kept as the column name for DB stability) — but
// the dimension is *emotional*, not musical. The user picks how the
// moment FELT and a clip in that emotional register plays for whoever
// matches it. Anonymity-safe: a vibe is what you felt, never who you
// are.
//
// IMPORTANT — clip URLs:
// All URLs below point at Kevin MacLeod's incompetech.com royalty-free
// catalogue. Each track was selected by hand to match the *feeling* of
// its vibe, not as a generic placeholder — that's the whole point of
// this library. MacLeod's tracks are CC-BY licensed; attribution is
// surfaced in Settings → About. Every URL below has been HTTP-checked
// to return 200; any URL that ever 404s is silently skipped by the
// audio player (utils/audio.ts) and the chip still works as a label —
// it just plays nothing for that one slot.
//
// We deliberately reuse some tracks across emotionally-adjacent vibes
// (e.g. Heartbreaking fits both nostalgia and longing). Within a
// single vibe the URLs are all different so the deterministic chooser
// can give two photos in the same vibe two different sounds.

import {
  bestTokenMatchScore,
  tokenMatchesAnyQuery,
} from "@/utils/tokenSearch";
import { getCatalogMusicRef } from "@/utils/serverCatalog";

// We keep the type alias name `MusicGenre` because it's already
// threaded through camera.tsx, match.tsx, AppContext, and the API
// types — renaming would be churn for no semantic gain. Treat it as
// "the music vibe id".
export type MusicGenre =
  | "joy"
  | "excited"
  | "overjoyed"
  | "elated"
  | "amusement"
  | "cheers"
  | "yum"
  | "love"
  | "caring"
  | "romance"
  | "gratitude"
  | "pride"
  | "hope"
  | "wonder"
  | "fascinated"
  | "calm"
  | "content"
  | "chilling"
  | "relaxed"
  | "tired"
  | "nostalgia"
  | "longing"
  | "sad"
  | "heartbroken"
  | "lonely"
  | "grief"
  | "fear"
  | "scared"
  | "afraid"
  | "anger"
  | "stress"
  | "passion";

export interface MusicClip {
  /** Stable id used to persist "which clip" on the photo. */
  id: string;
  /** Short label shown in pickers / debug surfaces. Never identity. */
  label: string;
  /** Remote URL — streamed + cached by expo-av. */
  url: string;
}

export interface GenreMeta {
  id: MusicGenre;
  label: string;
  emoji: string;
  /** One-line vibe description shown in the picker chip's tooltip. */
  vibe: string;
  clips: MusicClip[];
}

// Curated track pool from incompetech.com (Kevin MacLeod, CC-BY 4.0).
// All URLs verified 200. Each constant name describes the *mood* of
// the track so the vibe-to-track mapping below reads like prose.
const KM = "https://incompetech.com/music/royalty-free/mp3-royaltyfree";
const T = {
  // ─── bright + playful ──────────────────────────────────────────────
  carefree: `${KM}/Carefree.mp3`,
  cheeryMonday: `${KM}/Cheery%20Monday.mp3`,
  monkeysSpinning: `${KM}/Monkeys%20Spinning%20Monkeys.mp3`,
  happyBoy: `${KM}/Happy%20Boy%20End%20Theme.mp3`,
  lifeOfRiley: `${KM}/Life%20of%20Riley.mp3`,
  beachParty: `${KM}/Beach%20Party.mp3`,
  wallpaper: `${KM}/Wallpaper.mp3`,
  fluffingDuck: `${KM}/Fluffing%20a%20Duck.mp3`,
  lobbyTime: `${KM}/Lobby%20Time.mp3`,
  aretes: `${KM}/Aretes.mp3`,
  // ─── triumphant + heroic ───────────────────────────────────────────
  heroDown: `${KM}/Hero%20Down.mp3`,
  achilles: `${KM}/Achilles.mp3`,
  ouroboros: `${KM}/Ouroboros.mp3`,
  fanfareSpace: `${KM}/Fanfare%20for%20Space.mp3`,
  inspired: `${KM}/Inspired.mp3`,
  onMyWay: `${KM}/On%20My%20Way.mp3`,
  takeAChance: `${KM}/Take%20a%20Chance.mp3`,
  voltaic: `${KM}/Voltaic.mp3`,
  martyGotsAPlan: `${KM}/Marty%20Gots%20a%20Plan.mp3`,
  // ─── playful, comedic, mischievous ─────────────────────────────────
  sneakySnitch: `${KM}/Sneaky%20Snitch.mp3`,
  investigations: `${KM}/Investigations.mp3`,
  hepCats: `${KM}/Hep%20Cats.mp3`,
  // ─── warm, tender, romantic ────────────────────────────────────────
  easyLemon: `${KM}/Easy%20Lemon.mp3`,
  constance: `${KM}/Constance.mp3`,
  pamgaea: `${KM}/Pamgaea.mp3`,
  brittleRille: `${KM}/Brittle%20Rille.mp3`,
  healing: `${KM}/Healing.mp3`,
  dreamer: `${KM}/Dreamer.mp3`,
  // ─── hopeful, uplifting ────────────────────────────────────────────
  springThaw: `${KM}/Spring%20Thaw.mp3`,
  localForecast: `${KM}/Local%20Forecast.mp3`,
  // ─── serene, ambient, awe ──────────────────────────────────────────
  meditation: `${KM}/Meditation%20Impromptu%2003.mp3`,
  achaidh: `${KM}/Achaidh%20Cheide.mp3`,
  // ─── bittersweet, melancholy ───────────────────────────────────────
  heartbreaking: `${KM}/Heartbreaking.mp3`,
  longNoteOne: `${KM}/Long%20Note%20One.mp3`,
  longNoteTwo: `${KM}/Long%20Note%20Two.mp3`,
  longNoteThree: `${KM}/Long%20Note%20Three.mp3`,
  longNoteFour: `${KM}/Long%20Note%20Four.mp3`,
  sadTrio: `${KM}/Sad%20Trio.mp3`,
  theCannery: `${KM}/The%20Cannery.mp3`,
  // ─── tense, eerie, anxious ─────────────────────────────────────────
  lightlessDawn: `${KM}/Lightless%20Dawn.mp3`,
  ossuary: `${KM}/Ossuary%201%20-%20A%20Beginning.mp3`,
  industrialBox: `${KM}/Industrial%20Music%20Box.mp3`,
  cipher2: `${KM}/Cipher2.mp3`,
  bushwick: `${KM}/Bushwick%20Tarantella.mp3`,
  // ─── driving, intense, aggressive ──────────────────────────────────
  cyborgNinja: `${KM}/Cyborg%20Ninja.mp3`,
  adventureMeme: `${KM}/Adventure%20Meme.mp3`,
  rynosTheme: `${KM}/Rynos%20Theme.mp3`,
} as const;

// Each vibe ships four hand-picked clips so the deterministic chooser
// produces real variety even when many photos land on the same
// emotion. Within a vibe the tracks are unique; across vibes a track
// may repeat where the moods overlap (Heartbreaking fits both
// "longing" and "nostalgia"), which is a deliberate curation choice —
// the *emotional framing* is the product, not the audio file.
export const MUSIC_LIBRARY: GenreMeta[] = [
  {
    id: "joy",
    label: "Joy",
    emoji: "😄",
    vibe: "bright, playful, can't stop smiling",
    clips: [
      { id: "joy-1", label: "Sunbeam", url: T.carefree },
      { id: "joy-2", label: "Skipping", url: T.cheeryMonday },
      { id: "joy-3", label: "First Bite", url: T.happyBoy },
      { id: "joy-4", label: "Confetti", url: T.lifeOfRiley },
    ],
  },
  {
    id: "excited",
    label: "Excited",
    emoji: "🙌",
    vibe: "buzzing, upbeat, can't sit still",
    clips: [
      { id: "excited-1", label: "Buzz", url: T.wallpaper },
      { id: "excited-2", label: "Spark", url: T.inspired },
      { id: "excited-3", label: "Pacing", url: T.martyGotsAPlan },
      { id: "excited-4", label: "Almost There", url: T.takeAChance },
    ],
  },
  {
    id: "overjoyed",
    label: "Overjoyed",
    emoji: "🥳",
    vibe: "bursting, can't contain it, happy tears",
    clips: [
      { id: "overjoyed-1", label: "Confetti Burst", url: T.aretes },
      { id: "overjoyed-2", label: "Bounce Off Walls", url: T.beachParty },
      { id: "overjoyed-3", label: "Cartwheel", url: T.monkeysSpinning },
      { id: "overjoyed-4", label: "Whole Sky", url: T.lobbyTime },
    ],
  },
  {
    id: "elated",
    label: "Elated",
    emoji: "🤩",
    vibe: "triumphant, peak, top of the world",
    clips: [
      { id: "elated-1", label: "Summit", url: T.heroDown },
      { id: "elated-2", label: "Open Sky", url: T.fanfareSpace },
      { id: "elated-3", label: "Take Off", url: T.onMyWay },
      { id: "elated-4", label: "Victory", url: T.takeAChance },
    ],
  },
  {
    id: "amusement",
    label: "Amused",
    emoji: "😂",
    vibe: "silly, can't keep a straight face",
    clips: [
      { id: "amusement-1", label: "Wink", url: T.sneakySnitch },
      { id: "amusement-2", label: "Bounce", url: T.fluffingDuck },
      { id: "amusement-3", label: "Snort", url: T.monkeysSpinning },
      { id: "amusement-4", label: "Wobble", url: T.investigations },
    ],
  },
  {
    // "Cheers" — the toast vibe. Drinks raised, tablefuls of friends,
    // brunch mimosas, after-work pints, the warm clink moment. The
    // music register is jazzy / convivial / cocktail-bar — close
    // cousins to amusement and love but with a social-occasion
    // bounce that neither of them quite has on their own. Tracks are
    // hand-picked reuses from the existing pool: Hep Cats for the
    // cocktail-bar swing, Beach Party / Life of Riley for the easy-
    // good-time bounce, Easy Lemon for the warm shared-table feel.
    id: "cheers",
    label: "Cheers",
    emoji: "🥂",
    vibe: "to good times — clink, smile, share the table",
    clips: [
      { id: "cheers-1", label: "Clink", url: T.hepCats },
      { id: "cheers-2", label: "First Round", url: T.beachParty },
      { id: "cheers-3", label: "Good Life", url: T.lifeOfRiley },
      { id: "cheers-4", label: "Long Table", url: T.easyLemon },
    ],
  },
  {
    // "Yum" — food that makes you grin: plates, bites, kitchen warmth.
    // Distinct from Cheers (drinks/toast) and Joy (generic bright).
    id: "yum",
    label: "Yum",
    emoji: "😋",
    vibe: "tasty, satisfied — the bite worth sharing",
    clips: [
      { id: "yum-1", label: "First Bite", url: T.happyBoy },
      { id: "yum-2", label: "Kitchen Warm", url: T.easyLemon },
      { id: "yum-3", label: "Clean Plate", url: T.lifeOfRiley },
      { id: "yum-4", label: "Fresh Served", url: T.cheeryMonday },
    ],
  },
  {
    id: "love",
    label: "Love",
    emoji: "💗",
    vibe: "warm, tender, gentle hold",
    clips: [
      { id: "love-1", label: "Soft Hand", url: T.easyLemon },
      { id: "love-2", label: "Hearth", url: T.constance },
      { id: "love-3", label: "Lullaby", url: T.healing },
      { id: "love-4", label: "Quiet Hour", url: T.dreamer },
    ],
  },
  {
    // "Caring" — the *act* of looking after someone, distinct from
    // love (the inward feeling). Bringing soup to a sick friend,
    // brushing a kid's hair, sitting at a parent's bedside, watering
    // someone else's plants while they're away. Music is devotional /
    // tending — Healing for mending, Constance ("steadfast") for
    // faithful presence, Brittle Rille for slow gentle attention,
    // Local Forecast for the quiet "I'm here" comfort.
    id: "caring",
    label: "Caring",
    emoji: "🫶",
    vibe: "looking after — soft hands, gentle attention, tending close",
    clips: [
      { id: "caring-1", label: "Mending", url: T.healing },
      { id: "caring-2", label: "Steadfast", url: T.constance },
      { id: "caring-3", label: "Soft Tend", url: T.brittleRille },
      { id: "caring-4", label: "I'm Here", url: T.localForecast },
    ],
  },
  {
    id: "romance",
    label: "Romance",
    emoji: "💞",
    vibe: "swoony, butterflies, lean closer",
    clips: [
      { id: "romance-1", label: "Slow Burn", url: T.brittleRille },
      { id: "romance-2", label: "Candlelight", url: T.dreamer },
      { id: "romance-3", label: "First Look", url: T.constance },
      { id: "romance-4", label: "Last Dance", url: T.pamgaea },
    ],
  },
  {
    id: "gratitude",
    label: "Grateful",
    emoji: "🙏",
    vibe: "thankful, lucky, blessed by this",
    clips: [
      { id: "gratitude-1", label: "Open Window", url: T.healing },
      { id: "gratitude-2", label: "Held", url: T.constance },
      { id: "gratitude-3", label: "Soft Light", url: T.dreamer },
      { id: "gratitude-4", label: "Enough", url: T.pamgaea },
    ],
  },
  {
    id: "pride",
    label: "Proud",
    emoji: "🦁",
    vibe: "stood tall, earned this",
    clips: [
      { id: "pride-1", label: "Stand Tall", url: T.achilles },
      { id: "pride-2", label: "Banner", url: T.ouroboros },
      { id: "pride-3", label: "Crowd Up", url: T.inspired },
      { id: "pride-4", label: "Skyline", url: T.voltaic },
    ],
  },
  {
    id: "hope",
    label: "Hope",
    emoji: "🌅",
    vibe: "soft sunrise, things might turn",
    clips: [
      { id: "hope-1", label: "Dawn", url: T.springThaw },
      { id: "hope-2", label: "Step Out", url: T.onMyWay },
      { id: "hope-3", label: "Far Hill", url: T.localForecast },
      { id: "hope-4", label: "Onward", url: T.inspired },
    ],
  },
  {
    id: "wonder",
    label: "Wonder",
    emoji: "✨",
    vibe: "awe, magical, can't believe it",
    clips: [
      { id: "wonder-1", label: "Star Field", url: T.meditation },
      { id: "wonder-2", label: "Glow", url: T.healing },
      { id: "wonder-3", label: "Floating", url: T.pamgaea },
      { id: "wonder-4", label: "Aurora", url: T.dreamer },
    ],
  },
  {
    // "Fascinated" — the hobby/curiosity register. Distinct from
    // wonder (which is awe at vastness — sunsets, aurora) and from
    // amusement (which is comedic). This is the "deep into it" feel:
    // cataloguing a vinyl collection, tinkering with a watch
    // movement, identifying mushrooms, getting lost in a museum
    // exhibit. Music is the curious / playful-investigative register
    // — Investigations and Sneaky Snitch read as "looking into it",
    // Marty Gots A Plan reads as "concocting / tinkering", Hep Cats
    // gives the absorbed-rabbit-hole bounce.
    id: "fascinated",
    label: "Fascinated",
    emoji: "🤓",
    vibe: "deep into it — curious, tinkering, can't put this down",
    clips: [
      { id: "fascinated-1", label: "Looking In", url: T.investigations },
      { id: "fascinated-2", label: "Rabbit Hole", url: T.sneakySnitch },
      { id: "fascinated-3", label: "Tinker", url: T.martyGotsAPlan },
      { id: "fascinated-4", label: "Deep Dive", url: T.hepCats },
    ],
  },
  {
    id: "calm",
    label: "Calm",
    emoji: "🌿",
    vibe: "peaceful, breath out, soft morning",
    clips: [
      { id: "calm-1", label: "Still Lake", url: T.meditation },
      { id: "calm-2", label: "Slow Tide", url: T.localForecast },
      { id: "calm-3", label: "First Light", url: T.pamgaea },
      { id: "calm-4", label: "Garden", url: T.healing },
    ],
  },
  {
    id: "content",
    label: "Content",
    emoji: "😌",
    vibe: "settled, full cup, this is enough",
    clips: [
      { id: "content-1", label: "Slow Smile", url: T.easyLemon },
      { id: "content-2", label: "Soft Couch", url: T.wallpaper },
      { id: "content-3", label: "Window Seat", url: T.brittleRille },
      { id: "content-4", label: "Warm Mug", url: T.springThaw },
    ],
  },
  {
    id: "chilling",
    label: "Chilling",
    emoji: "🛋️",
    vibe: "low-key, kicked back, nowhere to be",
    clips: [
      { id: "chilling-1", label: "Lazy Afternoon", url: T.achaidh },
      { id: "chilling-2", label: "Couch Mode", url: T.wallpaper },
      { id: "chilling-3", label: "Easy Does It", url: T.easyLemon },
      { id: "chilling-4", label: "Half Awake", url: T.dreamer },
    ],
  },
  {
    id: "relaxed",
    label: "Relaxed",
    emoji: "😮‍💨",
    vibe: "shoulders down, unhurried, breathing easy",
    clips: [
      { id: "relaxed-1", label: "Exhale", url: T.meditation },
      { id: "relaxed-2", label: "Soft Tide", url: T.localForecast },
      { id: "relaxed-3", label: "Unwind", url: T.healing },
      { id: "relaxed-4", label: "Drift", url: T.pamgaea },
    ],
  },
  {
    // "Tired" — worn out, sleepy, running on fumes. Distinct from relaxed
    // (at ease) and chilling (choosing to kick back). This is the
    // heavy-lid register: late shift, long day, couch crash, almost
    // bed. Music is slow and weighted without tipping into sad.
    id: "tired",
    label: "Tired",
    emoji: "😴",
    vibe: "heavy lids, running on empty, bed soon",
    clips: [
      { id: "tired-1", label: "Heavy Lids", url: T.dreamer },
      { id: "tired-2", label: "Late Hour", url: T.achaidh },
      { id: "tired-3", label: "Slow Blink", url: T.meditation },
      { id: "tired-4", label: "Almost Bed", url: T.longNoteOne },
    ],
  },
  {
    id: "nostalgia",
    label: "Nostalgic",
    emoji: "📷",
    vibe: "bittersweet memory, old film grain",
    clips: [
      { id: "nostalgia-1", label: "Old Tape", url: T.heartbreaking },
      { id: "nostalgia-2", label: "Faded", url: T.longNoteTwo },
      { id: "nostalgia-3", label: "Polaroid", url: T.dreamer },
      { id: "nostalgia-4", label: "Childhood", url: T.constance },
    ],
  },
  {
    id: "longing",
    label: "Longing",
    emoji: "🌙",
    vibe: "yearning, missing them, wishing",
    clips: [
      { id: "longing-1", label: "Far Window", url: T.heartbreaking },
      { id: "longing-2", label: "Late Train", url: T.longNoteOne },
      { id: "longing-3", label: "Half Moon", url: T.longNoteTwo },
      { id: "longing-4", label: "Hold On", url: T.lightlessDawn },
    ],
  },
  {
    id: "sad",
    label: "Sad",
    emoji: "🥲",
    vibe: "melancholy, soft ache",
    clips: [
      { id: "sad-1", label: "Empty Room", url: T.sadTrio },
      { id: "sad-2", label: "Last Light", url: T.heartbreaking },
      { id: "sad-3", label: "Rainwindow", url: T.longNoteOne },
      { id: "sad-4", label: "Slow Ache", url: T.longNoteTwo },
    ],
  },
  {
    id: "heartbroken",
    label: "Heartbroken",
    emoji: "💔",
    vibe: "really sad, shattered, can't stop crying",
    clips: [
      { id: "heartbroken-1", label: "Shattered", url: T.longNoteFour },
      { id: "heartbroken-2", label: "After You Left", url: T.theCannery },
      { id: "heartbroken-3", label: "Last Letter", url: T.heartbreaking },
      { id: "heartbroken-4", label: "Empty Bed", url: T.sadTrio },
    ],
  },
  {
    id: "lonely",
    label: "Lonely",
    emoji: "🫥",
    vibe: "alone in a crowd, no one around",
    clips: [
      { id: "lonely-1", label: "Empty Café", url: T.longNoteThree },
      { id: "lonely-2", label: "Long Hall", url: T.longNoteFour },
      { id: "lonely-3", label: "One Light", url: T.heartbreaking },
      { id: "lonely-4", label: "Just Me", url: T.theCannery },
    ],
  },
  {
    id: "grief",
    label: "Grief",
    emoji: "🖤",
    vibe: "heavy, quiet loss, hold the weight",
    clips: [
      { id: "grief-1", label: "Stillness", url: T.longNoteOne },
      { id: "grief-2", label: "Vast", url: T.longNoteThree },
      { id: "grief-3", label: "Held Breath", url: T.longNoteFour },
      { id: "grief-4", label: "Far Bell", url: T.theCannery },
    ],
  },
  {
    id: "fear",
    label: "Fear",
    emoji: "😨",
    vibe: "tense, eerie, something's about to happen",
    clips: [
      { id: "fear-1", label: "Cold Room", url: T.lightlessDawn },
      { id: "fear-2", label: "Footsteps", url: T.ossuary },
      { id: "fear-3", label: "Held Breath", url: T.cipher2 },
      { id: "fear-4", label: "Edge", url: T.industrialBox },
    ],
  },
  {
    id: "scared",
    label: "Scared",
    emoji: "😱",
    vibe: "startled, frightened, caught off guard",
    clips: [
      { id: "scared-1", label: "Jump", url: T.ossuary },
      { id: "scared-2", label: "Shadow", url: T.lightlessDawn },
      { id: "scared-3", label: "Gasp", url: T.cipher2 },
      { id: "scared-4", label: "Freeze", url: T.industrialBox },
    ],
  },
  {
    id: "afraid",
    label: "Afraid",
    emoji: "😰",
    vibe: "fearful, worried, dread in your chest",
    clips: [
      { id: "afraid-1", label: "Dread", url: T.lightlessDawn },
      { id: "afraid-2", label: "Uneasy", url: T.longNoteFour },
      { id: "afraid-3", label: "Corner", url: T.ossuary },
      { id: "afraid-4", label: "Waiting", url: T.cipher2 },
    ],
  },
  {
    id: "anger",
    label: "Anger",
    emoji: "😠",
    vibe: "fed up, sharp edge, fists clenched",
    clips: [
      { id: "anger-1", label: "Slam", url: T.cyborgNinja },
      { id: "anger-2", label: "Heavy Pulse", url: T.voltaic },
      { id: "anger-3", label: "Friction", url: T.bushwick },
      { id: "anger-4", label: "Sharp Edge", url: T.industrialBox },
    ],
  },
  {
    id: "stress",
    label: "Stress",
    emoji: "😬",
    vibe: "anxious, on edge, too much at once",
    clips: [
      { id: "stress-1", label: "Tight Loop", url: T.bushwick },
      { id: "stress-2", label: "Pulse", url: T.industrialBox },
      { id: "stress-3", label: "Crowd", url: T.cipher2 },
      { id: "stress-4", label: "Deadline", url: T.cyborgNinja },
    ],
  },
  {
    id: "passion",
    label: "Passion",
    emoji: "🔥",
    vibe: "all-in, driving, can't sit still",
    clips: [
      { id: "passion-1", label: "Full Throttle", url: T.cyborgNinja },
      { id: "passion-2", label: "Burn", url: T.adventureMeme },
      { id: "passion-3", label: "Heatwave", url: T.rynosTheme },
      { id: "passion-4", label: "Drive Home", url: T.voltaic },
    ],
  },
];

const GENRE_BY_ID = new Map(MUSIC_LIBRARY.map((g) => [g.id, g]));

export function getGenre(id: string | undefined | null): GenreMeta | undefined {
  if (!id) return undefined;
  return GENRE_BY_ID.get(id as MusicGenre);
}

export function getClip(genre: string | undefined | null, clipId: string | undefined | null): MusicClip | undefined {
  const g = getGenre(genre);
  if (!g) return undefined;
  if (!clipId) return g.clips[0];
  return g.clips.find((c) => c.id === clipId) ?? g.clips[0];
}

// ── AI-style vibe suggestion ─────────────────────────────────────────
// We don't make a separate Gemini round-trip just for this — the photo
// has already been analysed during upload (theme + tags), and a simple
// keyword map produces the right emotional read in <1 ms with zero
// cost. A future pass can swap this for a vision-based mood call
// without touching any of the call sites.

const VIBE_KEYWORDS: Record<MusicGenre, string[]> = {
  joy: ["smile", "laugh", "fun", "play", "kid", "ice cream", "color", "bright", "celebrate", "dance", "balloon"],
  excited: ["excited", "excitement", "buzzing", "hype", "hyped", "pumped", "stoked", "amped", "eager", "anticipation", "anticipating", "countdown", "jitters", "restless", "fidget", "can't wait", "bouncing", "squeal", "gasp", "wide eyes", "energetic", "energy"],
  overjoyed: ["overjoyed", "ecstatic", "thrilled", "screaming", "jumping", "best day", "happy tears", "engaged", "newborn", "yes", "passed", "got in"],
  elated: ["summit", "win", "finish", "podium", "medal", "graduation", "first", "achievement", "top", "peak"],
  amusement: ["silly", "funny", "joke", "prank", "goofy", "meme", "weird", "quirky", "lol", "absurd"],
  cheers: ["cheers", "toast", "drink", "drinks", "cocktail", "cocktails", "beer", "beers", "wine", "champagne", "prosecco", "mimosa", "margarita", "martini", "whiskey", "whisky", "bourbon", "gin", "vodka", "rum", "tequila", "sangria", "spritz", "aperol", "negroni", "highball", "lowball", "pint", "pints", "glass", "glasses", "clink", "happy hour", "brunch", "bar", "pub", "tavern", "bistro", "patio", "rooftop", "nightcap", "round", "bartender", "sommelier", "cork", "uncorked", "pour", "bottle", "tumbler", "stein", "tap", "draft", "cellar"],
  yum: ["yum", "yummy", "delicious", "tasty", "foodie", "food", "meal", "meals", "lunch", "dinner", "breakfast", "brunch", "snack", "bite", "bites", "dish", "dishes", "plate", "plated", "bowl", "feast", "hungry", "appetite", "treat", "treats", "recipe", "cooking", "cooked", "baking", "baked", "kitchen", "restaurant", "diner", "bakery", "deli", "takeaway", "takeout", "homemade", "fresh", "savory", "sweet", "dessert", "pastry", "cake", "cookie", "bread", "pizza", "pasta", "burger", "sushi", "taco", "salad", "soup", "ramen", "noodles", "rice", "steak", "seafood", "fruit", "berries", "chocolate", "ice cream", "cheese", "charcuterie", "spread", "platter", "grill", "grilled", "roast", "roasted", "farm", "table", "fork", "spoon", "chef", "serve", "served"],
  love: ["pet", "hug", "family", "baby", "anniversary", "warm", "soft", "snuggle", "puppy", "kitten"],
  caring: ["care", "caring", "tend", "tending", "nurse", "nursing", "comfort", "comforting", "soothe", "soothing", "lullaby", "bedside", "nurture", "nurturing", "look after", "looking after", "sick", "illness", "ill", "unwell", "recovering", "recovery", "hospital", "clinic", "bandage", "bandaid", "medicine", "soup", "broth", "elderly", "ageing", "aging", "caregiver", "caregiving", "carer", "tucked in", "swaddle", "swaddling", "watering plants", "feeding", "rocking", "soothing voice", "stroking", "patting", "wiping", "cleaning up", "checking on", "wellness check", "supporting", "looking out for"],
  romance: ["kiss", "couple", "wedding", "date", "candle", "flower", "rose", "honeymoon", "proposal"],
  gratitude: ["thank", "blessed", "lucky", "given", "gift", "kindness", "support", "homemade", "grandma"],
  pride: ["accomplish", "earned", "built", "made", "promotion", "award", "trophy", "diploma", "first place"],
  hope: ["dawn", "sunrise", "new", "fresh", "begin", "start", "spring", "tomorrow", "future", "seedling"],
  wonder: ["sunset", "stars", "aurora", "view", "vista", "skyline", "canyon", "ocean", "northern", "magical", "rainbow"],
  fascinated: ["fascinated", "fascinating", "interesting", "curious", "intrigued", "intriguing", "absorbed", "obsessed", "hobby", "hobbies", "collection", "collector", "collecting", "tinker", "tinkering", "craft", "crafting", "project", "workshop", "workbench", "gadget", "gear", "setup", "rig", "mechanism", "movement", "vinyl", "records", "rare", "specimen", "specimens", "study", "studying", "research", "museum", "exhibit", "exhibition", "gallery", "archive", "library", "model", "kit", "lego", "puzzle", "chess", "knit", "knitting", "crochet", "pottery", "ceramics", "woodwork", "woodworking", "soldering", "electronics", "circuit", "telescope", "microscope", "fossil", "mineral", "crystal", "terrarium", "aquarium", "mushroom", "foraging", "birding", "birder", "watch", "watches", "horology", "mechanical", "keyboard", "synthesizer", "synth", "camera gear", "lens", "stamp", "coin", "miniature", "miniatures", "diorama", "tabletop", "rpg", "trading card", "deck"],
  calm: ["coffee", "morning", "rain", "book", "tea", "garden", "quiet", "porch", "sunday", "still", "lake"],
  content: ["content", "satisfied", "settled", "cozy", "comfy", "couch", "blanket", "fireplace", "full", "happy enough", "peaceful smile", "at ease", "good day", "simple", "homey"],
  chilling: ["chill", "chilling", "chilled", "chillout", "unwind", "unwinding", "lazy", "lounging", "lounge", "hangout", "low key", "lowkey", "idle", "slow day", "easy day", "nothing planned"],
  relaxed: ["relaxed", "relaxing", "relax", "mellow", "laid back", "laidback", "unhurried", "loose", "ease", "at ease", "breathing", "slow down", "wind down", "decompress", "restful"],
  tired: ["tired", "sleepy", "sleep", "sleeping", "exhausted", "exhaustion", "weary", "fatigued", "drained", "worn out", "worn-out", "burnout", "burned out", "burnt out", "yawn", "yawning", "nap", "napping", "snooze", "bedtime", "bed", "pillow", "blanket", "couch", "crash", "late night", "latenight", "all-nighter", "overtime", "night shift", "nightshift", "shift work", "insomnia", "drowsy", "groggy", "half awake", "half-awake", "running on empty", "no energy", "low energy", "wiped", "beat", "spent", "sluggish"],
  nostalgia: ["old", "vintage", "retro", "polaroid", "childhood", "school", "throwback", "hometown", "grandparent", "attic"],
  longing: ["window", "distant", "far", "missing", "wishing", "absent", "without", "across", "moon", "horizon"],
  sad: ["empty", "rainy", "grey", "ending", "goodbye", "memorial", "tear", "departed"],
  heartbroken: ["really sad", "devastated", "heartbroken", "broken heart", "shattered", "crushed", "broke me", "ruined", "ended us", "breakup", "left me"],
  lonely: ["alone", "solitary", "single", "deserted", "no one", "by myself", "isolated", "abandoned"],
  grief: ["loss", "funeral", "passed", "mourning", "remembrance", "passed away", "rest in peace", "graveyard"],
  fear: ["dark", "alley", "storm", "shadow", "night", "thunder", "cliff", "creepy", "alarm", "ghost", "haunted", "horror"],
  scared: ["scared", "scare", "frightened", "startled", "spooked", "creeped", "jumpscare", "yikes", "eek"],
  afraid: ["afraid", "fearful", "terrified", "dread", "panic", "worried", "anxious", "nervous", "uneasy"],
  anger: ["broken", "fight", "argument", "smash", "protest", "angry", "destroyed", "loud", "shouting", "ruined"],
  stress: ["work", "deadline", "office", "traffic", "commute", "screen", "email", "rush", "busy", "city", "noise", "crowd"],
  passion: ["concert", "festival", "race", "extreme", "adventure", "skate", "surf", "intense", "fast", "training", "workout"],
};

const THEME_HINTS: Record<string, MusicGenre> = {
  morning: "calm",
  coffee: "calm",
  tea: "calm",
  breakfast: "yum",
  lunch: "yum",
  dinner: "yum",
  snack: "yum",
  food: "yum",
  meal: "yum",
  cooking: "yum",
  baking: "yum",
  dessert: "yum",
  bread: "yum",
  pet: "love",
  family: "love",
  baby: "love",
  date: "romance",
  wedding: "romance",
  flower: "romance",
  sunset: "wonder",
  sunrise: "hope",
  view: "wonder",
  nature: "calm",
  garden: "calm",
  night: "fear",
  storm: "fear",
  scared: "scared",
  afraid: "afraid",
  frightened: "scared",
  horror: "fear",
  rain: "sad",
  goodbye: "sad",
  breakup: "heartbroken",
  divorce: "heartbroken",
  newborn: "overjoyed",
  engagement: "overjoyed",
  alone: "lonely",
  funeral: "grief",
  memorial: "grief",
  vintage: "nostalgia",
  childhood: "nostalgia",
  throwback: "nostalgia",
  work: "stress",
  commute: "stress",
  office: "stress",
  challenge: "passion",
  adventure: "passion",
  passions: "passion",
  passion: "passion",
  hike: "elated",
  summit: "elated",
  graduation: "pride",
  award: "pride",
  city: "stress",
  party: "excited",
  hype: "excited",
  pumped: "excited",
  stoked: "excited",
  excited: "excited",
  concert: "passion",
  silly: "amusement",
  funny: "amusement",
  drink: "cheers",
  drinks: "cheers",
  cocktail: "cheers",
  beer: "cheers",
  wine: "cheers",
  champagne: "cheers",
  toast: "cheers",
  cheers: "cheers",
  brunch: "cheers",
  bar: "cheers",
  pub: "cheers",
  selfie: "joy",
  mirror: "nostalgia",
  weather: "calm",
  shoes: "calm",
  groceries: "content",
  cafe: "calm",
  reading: "calm",
  view: "wonder",
  playing: "fascinated",
  games: "fascinated",
  movement: "passion",
  wearing: "nostalgia",
  smallthing: "wonder",
  made: "fascinated",
  furniture: "content",
  home: "content",
  plant: "calm",
  plants: "calm",
  water: "calm",
  night: "calm",
  ritual: "calm",
  door: "nostalgia",
  wheels: "stress",
  wall: "nostalgia",
  handwriting: "fascinated",
  instrument: "fascinated",
  listening: "calm",
  hobby: "fascinated",
  collection: "fascinated",
  museum: "fascinated",
  workshop: "fascinated",
  puzzle: "fascinated",
  chess: "fascinated",
  vinyl: "fascinated",
  telescope: "fascinated",
  microscope: "fascinated",
  terrarium: "fascinated",
  aquarium: "fascinated",
  lego: "fascinated",
  pottery: "fascinated",
  knitting: "fascinated",
  care: "caring",
  caring: "caring",
  nurse: "caring",
  hospital: "caring",
  sick: "caring",
  soup: "caring",
  lullaby: "caring",
  bedside: "caring",
  caregiver: "caring",
  thanks: "gratitude",
  homemade: "gratitude",
  window: "longing",
  moon: "longing",
  // Lifestyle round vibes — cafés feel calm, shopping/objects lean
  // playful (joy/fascinated), chores get a low-key motivational
  // pickup (passion is too hot, calm too flat — "stress" matches the
  // existing work/commute register and the music library has chore-
  // friendly tracks under it).
  cafe: "calm",
  chill: "chilling",
  chilling: "chilling",
  chilled: "chilling",
  relaxed: "relaxed",
  relaxing: "relaxed",
  tired: "tired",
  sleepy: "tired",
  sleep: "tired",
  exhausted: "tired",
  exhaustion: "tired",
  nap: "tired",
  bedtime: "tired",
  yawn: "tired",
  burnout: "tired",
  overtime: "tired",
  unwind: "chilling",
  lounge: "chilling",
  shopping: "joy",
  selfie: "joy",
  mirror: "joy",
  objects: "fascinated",
  object: "fascinated",
  chores: "stress",
  laundry: "stress",
  cleaning: "stress",
  // ── Launch expansion themes → vibe ──
  butterfly: "wonder",
  moth: "calm",
  art: "fascinated",
  fishing: "relaxed",
  hiking: "elated",
  yoga: "calm",
  gym: "passion",
  camping: "calm",
  travel: "wonder",
  beach: "wonder",
  swimming: "joy",
  festival: "passion",
  birthday: "joy",
  newhome: "content",
};

/**
 * Pick a vibe only when theme/tags give a real signal. Returns null when
 * there is nothing to match (avoids silently defaulting to calm on an
 * empty post screen).
 */
export function suggestGenreIfMatch(
  theme: string | undefined,
  tags: string[] | undefined,
): MusicGenre | null {
  const t = (theme ?? "").toLowerCase().trim();
  const tagList = (tags ?? []).map((x) => x.toLowerCase());
  if (!t && tagList.length === 0) return null;

  for (const [k, g] of Object.entries(THEME_HINTS)) {
    if (t === k || t.includes(k)) return g;
  }

  const haystack = new Set([t, ...tagList].flatMap((s) => s.split(/\s+/)));
  let best: MusicGenre = "calm";
  let bestScore = 0;
  for (const vibe of Object.keys(VIBE_KEYWORDS) as MusicGenre[]) {
    let score = 0;
    for (const kw of VIBE_KEYWORDS[vibe]) {
      if (haystack.has(kw)) score += 2;
      else if ([...haystack].some((h) => h.includes(kw))) score += 1;
    }
    if (score > bestScore) {
      best = vibe;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * Pick the best-fitting vibe for a photo from its theme + tags. Always
 * returns a vibe — defaults to `calm` (the most neutral register) if
 * nothing matches.
 */
export function suggestGenre(theme: string | undefined, tags: string[] | undefined): MusicGenre {
  const t = (theme ?? "").toLowerCase();
  const tagList = (tags ?? []).map((x) => x.toLowerCase());

  // 1. Exact theme match.
  for (const [k, g] of Object.entries(THEME_HINTS)) {
    if (t === k || t.includes(k)) return g;
  }

  // 2. Keyword match across tags + theme. Score every vibe and pick
  //    the highest. Stable ordering across reloads is guaranteed by
  //    the fixed iteration order of MUSIC_LIBRARY.
  const haystack = new Set([t, ...tagList].flatMap((s) => s.split(/\s+/)));
  let best: MusicGenre = "calm";
  let bestScore = 0;
  for (const vibe of Object.keys(VIBE_KEYWORDS) as MusicGenre[]) {
    let score = 0;
    for (const kw of VIBE_KEYWORDS[vibe]) {
      if (haystack.has(kw)) score += 2;
      else if ([...haystack].some((h) => h.includes(kw))) score += 1;
    }
    if (score > bestScore) {
      best = vibe;
      bestScore = score;
    }
  }
  return best;
}

/** Terms used when filtering vibe chips while the user types. */
export function genreSearchTerms(genre: GenreMeta): string[] {
  const themeHints = Object.entries(THEME_HINTS)
    .filter(([, g]) => g === genre.id)
    .map(([key]) => key);
  return [
    genre.label,
    genre.id,
    genre.vibe,
    ...(VIBE_KEYWORDS[genre.id] ?? []),
    ...themeHints,
  ];
}

export function genreMatchesSearchQuery(genre: GenreMeta, query: string): boolean {
  return tokenMatchesAnyQuery(query, genreSearchTerms(genre));
}

export function genreSearchMatchScore(genre: GenreMeta, query: string): number {
  return bestTokenMatchScore(query, genreSearchTerms(genre));
}

/** Resolve a single vibe from typed search text (e.g. tests / future autoselect). */
export function resolveGenreFromSearchQuery(query: string): MusicGenre | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = MUSIC_LIBRARY.find(
    (g) => g.label.toLowerCase() === q || g.id.toLowerCase() === q,
  );
  if (exact) return exact.id;
  const matches = MUSIC_LIBRARY.filter((g) => genreMatchesSearchQuery(g, q));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;
  const ranked = [...matches].sort(
    (a, b) => genreSearchMatchScore(b, q) - genreSearchMatchScore(a, q),
  );
  const top = genreSearchMatchScore(ranked[0], q);
  const runner = genreSearchMatchScore(ranked[1], q);
  return top > runner ? ranked[0].id : null;
}

/**
 * Deterministically pick a clip from the vibe based on a stable seed
 * (e.g. the photo's backend id, or a local uri hash). Same seed → same
 * clip every time, so the "their photo's vibe" doesn't shuffle on
 * re-renders.
 */
export function pickClipForSeed(genre: MusicGenre, seed: string): MusicClip {
  const g = getGenre(genre)!;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return g.clips[(h >>> 0) % g.clips.length];
}

/**
 * Resolve the music URL that a photo should play. Single source of truth
 * shared by every screen that hears a photo's vibe — Match, Reveal,
 * preview surfaces — so the same photo always resolves to the same URL
 * regardless of which screen asks. This is what guarantees that opening
 * the share card from the Match screen does NOT cause the audio singleton
 * to switch clips: both screens compute the byte-identical URL.
 *
 * Resolution order:
 * 1. User-recorded vibe (`customAudioUrl`) — takes priority.
 * 2. Stored canonical `musicGenre` — looked up via getGenre, then a clip
 *    is picked deterministically from `seed`.
 * 3. Fallback: derive a vibe from theme + tags via `suggestGenre`.
 *
 * Returns null when the photo has no resolvable music (no seed, no genre,
 * and `suggestGenre` was given nothing to work with). Callers treat null
 * as "no clip" — silent.
 */
export function resolveMusicUrl(input: {
  customAudioUrl?: string | null;
  musicGenre?: string | null;
  theme?: string | null;
  tags?: string[] | null;
  seed?: string | null;
}): string | null {
  if (input.customAudioUrl) return input.customAudioUrl;
  const seed = input.seed ?? "";
  const stored = input.musicGenre ?? undefined;
  // The user's explicit, still-valid preset vibe always wins.
  const storedGenre = stored ? getGenre(stored)?.id : undefined;

  // Server-driven approved entry supplies "the music that goes with it" for a
  // previously-unknown word — but only when the user hasn't picked a valid
  // preset vibe. A non-preset stored vibe word may map to a vibe entry;
  // otherwise the theme word may map to a theme entry. `musicRef` is either a
  // preset vibe id (seed-picked below) or a direct https track URL.
  let catalogRef: string | null = null;
  if (!storedGenre) {
    catalogRef =
      (stored ? getCatalogMusicRef("vibe", stored) : null) ??
      (input.theme ? getCatalogMusicRef("theme", input.theme) : null);
  }
  // A direct track URL is seed-independent — play it as-is.
  if (catalogRef && /^https?:\/\//i.test(catalogRef)) return catalogRef;

  if (!seed) return null;
  const catalogGenre = catalogRef ? getGenre(catalogRef)?.id : undefined;
  const genre: MusicGenre =
    storedGenre ||
    catalogGenre ||
    suggestGenre(input.theme ?? undefined, input.tags ?? undefined);
  return pickClipForSeed(genre, seed).url;
}
