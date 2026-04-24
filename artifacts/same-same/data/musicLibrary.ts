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

// We keep the type alias name `MusicGenre` because it's already
// threaded through camera.tsx, match.tsx, AppContext, and the API
// types — renaming would be churn for no semantic gain. Treat it as
// "the music vibe id".
export type MusicGenre =
  | "joy"
  | "overjoyed"
  | "elated"
  | "amusement"
  | "cheers"
  | "love"
  | "romance"
  | "gratitude"
  | "pride"
  | "hope"
  | "wonder"
  | "fascinated"
  | "calm"
  | "content"
  | "nostalgia"
  | "longing"
  | "sad"
  | "heartbroken"
  | "lonely"
  | "grief"
  | "fear"
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
  overjoyed: ["overjoyed", "ecstatic", "thrilled", "screaming", "jumping", "best day", "happy tears", "engaged", "newborn", "yes", "passed", "got in"],
  elated: ["summit", "win", "finish", "podium", "medal", "graduation", "first", "achievement", "top", "peak"],
  amusement: ["silly", "funny", "joke", "prank", "goofy", "meme", "weird", "quirky", "lol", "absurd"],
  cheers: ["cheers", "toast", "drink", "drinks", "cocktail", "cocktails", "beer", "beers", "wine", "champagne", "prosecco", "mimosa", "margarita", "martini", "whiskey", "whisky", "bourbon", "gin", "vodka", "rum", "tequila", "sangria", "spritz", "aperol", "negroni", "highball", "lowball", "pint", "pints", "glass", "glasses", "clink", "happy hour", "brunch", "bar", "pub", "tavern", "bistro", "patio", "rooftop", "nightcap", "round", "bartender", "sommelier", "cork", "uncorked", "pour", "bottle", "tumbler", "stein", "tap", "draft", "cellar"],
  love: ["pet", "hug", "family", "baby", "anniversary", "warm", "soft", "snuggle", "puppy", "kitten"],
  romance: ["kiss", "couple", "wedding", "date", "candle", "flower", "rose", "honeymoon", "proposal"],
  gratitude: ["thank", "blessed", "lucky", "given", "gift", "kindness", "support", "homemade", "grandma"],
  pride: ["accomplish", "earned", "built", "made", "promotion", "award", "trophy", "diploma", "first place"],
  hope: ["dawn", "sunrise", "new", "fresh", "begin", "start", "spring", "tomorrow", "future", "seedling"],
  wonder: ["sunset", "stars", "aurora", "view", "vista", "skyline", "canyon", "ocean", "northern", "magical", "rainbow"],
  fascinated: ["fascinated", "fascinating", "interesting", "curious", "intrigued", "intriguing", "absorbed", "obsessed", "hobby", "hobbies", "collection", "collector", "collecting", "tinker", "tinkering", "craft", "crafting", "project", "workshop", "workbench", "gadget", "gear", "setup", "rig", "mechanism", "movement", "vinyl", "records", "rare", "specimen", "specimens", "study", "studying", "research", "museum", "exhibit", "exhibition", "gallery", "archive", "library", "model", "kit", "lego", "puzzle", "chess", "knit", "knitting", "crochet", "pottery", "ceramics", "woodwork", "woodworking", "soldering", "electronics", "circuit", "telescope", "microscope", "fossil", "mineral", "crystal", "terrarium", "aquarium", "mushroom", "foraging", "birding", "birder", "watch", "watches", "horology", "mechanical", "keyboard", "synthesizer", "synth", "camera gear", "lens", "stamp", "coin", "miniature", "miniatures", "diorama", "tabletop", "rpg", "trading card", "deck"],
  calm: ["coffee", "morning", "rain", "book", "tea", "garden", "quiet", "porch", "sunday", "still", "lake"],
  content: ["content", "satisfied", "settled", "cozy", "comfy", "couch", "blanket", "fireplace", "full", "happy enough", "peaceful smile", "at ease", "relaxed", "good day", "simple", "homey"],
  nostalgia: ["old", "vintage", "retro", "polaroid", "childhood", "school", "throwback", "hometown", "grandparent", "attic"],
  longing: ["window", "distant", "far", "missing", "wishing", "absent", "without", "across", "moon", "horizon"],
  sad: ["empty", "rainy", "grey", "ending", "goodbye", "memorial", "tear", "departed"],
  heartbroken: ["really sad", "devastated", "heartbroken", "broken heart", "shattered", "crushed", "broke me", "ruined", "ended us", "breakup", "left me"],
  lonely: ["alone", "solitary", "single", "deserted", "no one", "by myself", "isolated", "abandoned"],
  grief: ["loss", "funeral", "passed", "mourning", "remembrance", "passed away", "rest in peace", "graveyard"],
  fear: ["dark", "alley", "storm", "shadow", "night", "thunder", "cliff", "creepy", "alarm", "ghost"],
  anger: ["broken", "fight", "argument", "smash", "protest", "angry", "destroyed", "loud", "shouting", "ruined"],
  stress: ["work", "deadline", "office", "traffic", "commute", "screen", "email", "rush", "busy", "city", "noise", "crowd"],
  passion: ["concert", "festival", "race", "extreme", "adventure", "skate", "surf", "intense", "fast", "training", "workout"],
};

const THEME_HINTS: Record<string, MusicGenre> = {
  morning: "calm",
  coffee: "calm",
  food: "joy",
  meal: "joy",
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
  hike: "elated",
  summit: "elated",
  graduation: "pride",
  award: "pride",
  city: "stress",
  party: "joy",
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
  thanks: "gratitude",
  homemade: "gratitude",
  window: "longing",
  moon: "longing",
};

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
