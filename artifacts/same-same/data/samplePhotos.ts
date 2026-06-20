import { photoKey } from "@/utils/photoKey";
import { normalizeUnsplashUri, unsplashPhotoUrl } from "@/utils/unsplashUri";
import { suggestGenre, type MusicGenre } from "@/data/musicLibrary";
import { DAILY_CHALLENGES } from "./themeMatch";

export interface SamplePhoto {
  id: string;
  uri: string;
  country: string;
  countryCode: string;
  countryFlag: string;
  theme: string;
  minutesAgo: number;
  tags: string[];
  /** Curated demo country (ISO2) — treated as capture for stock photo display. */
  captureCountryCode?: string;
  /**
   * Visual-form / composition tags (circles, vertical, layered…). Used
   * by scoreCandidates to credit shape overlap as a third axis (each
   * shared shape worth 2 pts up to 5). Optional so legacy entries
   * still load — `[]` is treated as "no shapes recorded" and silently
   * yields 0 shape points without penalising the candidate.
   */
  shapes?: string[];
  /**
   * Free-form concrete subjects ("apple", "sculpture", "park"…) used by
   * scoreCandidates as the heaviest single-axis bonus (3 pts × min
   * overlap, 5 = 0..15). Mirrors the server-side `subjects` column.
   * Optional so curated sample data and legacy entries still load —
   * `[]` / undefined is treated as "no subjects recorded" and silently
   * yields 0 subject points without penalising the candidate.
   */
  subjects?: string[];
  /**
   * Music vibe label paired with this photo. Optional so legacy sample
   * data without an explicit pick still loads — the match screen falls
   * back to suggestGenre(theme, tags) at render time when missing.
   */
  musicGenre?: string;
  /**
   * Optional `data:` (or file://) URL for a user-recorded vibe clip.
   * When present, the match screen plays this clip *instead* of the
   * music_genre clip. Sample photos never set this; live candidates
   * may include it when the uploader recorded their own audio.
   */
  customAudioUrl?: string;
  /**
   * Optional launch checklist id (see STOCK_LAUNCH_SLOTS). Helps QA confirm
   * each everyday moment type has stock coverage.
   */
  launchSlot?: string;
}

// Helper used to overlay the SameWave stock logo (top-left). We
// resolve the URI set lazily so the SAMPLE_PHOTOS
// constant declared below can populate it on first call. Compared by
// stable photoKey so URI variants (?w=…, etc.) still match.
let _sampleKeySet: Set<string> | undefined;
export function isSamplePhoto(uri: string | undefined | null): boolean {
  if (!uri) return false;
  if (!_sampleKeySet) {
    _sampleKeySet = new Set(SAMPLE_PHOTOS.map((p) => photoKey(p.uri)));
  }
  return _sampleKeySet.has(photoKey(uri));
}

let _sampleByPhotoKey: Map<string, SamplePhoto> | undefined;

/** Resolve curated sample metadata from any URI variant (Expo debug overlays). */
export function lookupSamplePhotoByUri(
  uri: string | undefined | null,
): SamplePhoto | null {
  if (!uri) return null;
  if (!_sampleByPhotoKey) {
    _sampleByPhotoKey = new Map(
      SAMPLE_PHOTOS.map((p) => [photoKey(p.uri), p]),
    );
  }
  return _sampleByPhotoKey.get(photoKey(uri)) ?? null;
}

/** True in Expo Go / `expo start` only — never in release AAB bundles. */
export function isExpoDevBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/** Show match debug chrome on Ripple cards in Expo Go only (never release AAB). */
export function shouldShowExpoMatchPhotoDebug(
  uri: string | undefined | null,
  candidateId?: string | null,
): boolean {
  if (!isExpoDevBuild() || !uri) return false;
  const id = (candidateId ?? "").trim();
  if (!id || id === "placeholder") return false;
  if (isSamplePhoto(uri)) return true;
  return id.startsWith("synth-") || id.startsWith("live-");
}

/** Unsplash photo keys that must never be used as stock or synth (wrong or overused). */
export const BANNED_STOCK_PHOTO_KEYS = new Set([
  "photo-1554118811-1e0d58224f24", // three-hand latte toast
  "photo-1559056199-9c55c27a1e69", // same toast, alternate id
]);

export function isBannedStockPhotoUri(uri: string | undefined | null): boolean {
  if (!uri) return false;
  const key = photoKey(uri);
  return key ? BANNED_STOCK_PHOTO_KEYS.has(key) : false;
}

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "1",
    uri: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400",
    country: "Ethiopia",
    countryCode: "ET",
    countryFlag: "🇪🇹",
    theme: "morning",
    minutesAgo: 45,
    tags: ["coffee","drink","people","art","warm"],
    shapes: ["circles","curves","centered","geometric"],
  },
  {
    id: "2",
    uri: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400",
    country: "Japan",
    countryCode: "JP",
    countryFlag: "🇯🇵",
    theme: "morning",
    minutesAgo: 127,
    tags: ["coffee","drink","people","art","warm"],
    shapes: ["circles","curves","centered","geometric"],
  },
  {
    id: "3",
    uri: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    country: "Mexico",
    countryCode: "MX",
    countryFlag: "🇲🇽",
    theme: "food",
    minutesAgo: 210,
    tags: ["meal","warm","people"],
    shapes: ["circles","centered","layered"],
  },
  {
    id: "4",
    uri: "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400",
    country: "India",
    countryCode: "IN",
    countryFlag: "🇮🇳",
    theme: "food",
    minutesAgo: 68,
    tags: ["meal","bread","drink","warm"],
    shapes: ["circles","centered","layered","organic"],
  },
  {
    id: "5",
    uri: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400",
    country: "Peru",
    countryCode: "PE",
    countryFlag: "🇵🇪",
    theme: "work",
    minutesAgo: 361,
    tags: ["people","coffee","laptop","desk"],
    shapes: ["lines","horizontal","geometric","centered"],
  },
  {
    id: "6",
    uri: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400",
    country: "Germany",
    countryCode: "DE",
    countryFlag: "🇩🇪",
    theme: "work",
    minutesAgo: 22,
    tags: ["people","desk","laptop"],
    shapes: ["lines","horizontal","geometric","centered"],
  },
  {
    id: "7",
    uri: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    country: "Norway",
    countryCode: "NO",
    countryFlag: "🇳🇴",
    theme: "nature",
    minutesAgo: 720,
    tags: ["mountains","clouds","sunset","outdoors"],
    shapes: ["organic","layered","horizontal"],
  },
  {
    id: "8",
    uri: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400",
    country: "Kenya",
    countryCode: "KE",
    countryFlag: "🇰🇪",
    theme: "nature",
    minutesAgo: 244,
    tags: ["sunset","water","outdoors","clouds","trees","warm"],
    shapes: ["organic","layered","horizontal"],
  },
  {
    id: "9",
    uri: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=400",
    country: "Brazil",
    countryCode: "BR",
    countryFlag: "🇧🇷",
    theme: "joy",
    minutesAgo: 18,
    tags: ["people","warm"],
    shapes: ["curves","organic","centered"],
  },
  {
    id: "10",
    uri: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400",
    country: "South Korea",
    countryCode: "KR",
    countryFlag: "🇰🇷",
    theme: "joy",
    minutesAgo: 480,
    tags: ["water","art","people"],
    shapes: ["curves","organic","centered","horizontal"],
  },
  {
    id: "11",
    uri: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400",
    country: "Morocco",
    countryCode: "MA",
    countryFlag: "🇲🇦",
    theme: "hands",
    minutesAgo: 153,
    tags: ["warm","people","art"],
    shapes: ["curves","organic","centered"],
  },
  {
    id: "12",
    uri: "https://images.unsplash.com/photo-1574169208507-84376144848b?w=400",
    country: "Argentina",
    countryCode: "AR",
    countryFlag: "🇦🇷",
    theme: "sky",
    minutesAgo: 1090,
    tags: ["art","clouds","water","night","stars","sunset"],
    shapes: ["horizontal","layered","minimal","geometric"],
  },
  {
    id: "13",
    uri: "https://images.unsplash.com/photo-1548247416-ec66f4900b2e?w=400",
    country: "Finland",
    countryCode: "FI",
    countryFlag: "🇫🇮",
    theme: "pets",
    minutesAgo: 96,
    tags: ["cat","animal","wildlife"],
    shapes: ["organic","curves","centered"],
  },
  {
    id: "14",
    uri: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
    country: "Australia",
    countryCode: "AU",
    countryFlag: "🇦🇺",
    theme: "pets",
    minutesAgo: 1440,
    tags: ["dog","animal","smile","outdoors","water"],
    shapes: ["organic","curves","centered","horizontal"],
  },
  {
    id: "15",
    uri: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400",
    country: "China",
    countryCode: "CN",
    countryFlag: "🇨🇳",
    theme: "commute",
    minutesAgo: 305,
    tags: ["transit","mountains","night","outdoors"],
    shapes: ["vertical","lines","geometric"],
  },
  {
    id: "16",
    uri: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400",
    country: "United Kingdom",
    countryCode: "GB",
    countryFlag: "🇬🇧",
    theme: "commute",
    minutesAgo: 185,
    tags: ["city","water","outdoors","sunset","clouds"],
    shapes: ["vertical","lines","geometric","horizontal"],
  },
  {
    id: "17",
    uri: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400",
    country: "Maldives",
    countryCode: "MV",
    countryFlag: "🇲🇻",
    theme: "weather",
    minutesAgo: 2160,
    tags: ["water","clouds","sunset","outdoors","rain"],
    shapes: ["horizontal","layered","minimal"],
  },
  {
    id: "18",
    uri: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400",
    country: "Mongolia",
    countryCode: "MN",
    countryFlag: "🇲🇳",
    theme: "sky",
    minutesAgo: 425,
    tags: ["stars","night","mountains","outdoors"],
    shapes: ["horizontal","layered","minimal"],
  },
  {
    id: "19",
    uri: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400",
    country: "Canada",
    countryCode: "CA",
    countryFlag: "🇨🇦",
    theme: "nature",
    minutesAgo: 95,
    tags: ["sunset","clouds","mountains","outdoors"],
    shapes: ["organic","layered","horizontal"],
  },
  {
    id: "20",
    uri: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400",
    country: "South Africa",
    countryCode: "ZA",
    countryFlag: "🇿🇦",
    theme: "sky",
    minutesAgo: 38,
    tags: ["sunset","outdoors","trees","warm"],
    shapes: ["horizontal","layered","minimal","organic"],
  },
  {
    id: "21",
    uri: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400",
    country: "New Zealand",
    countryCode: "NZ",
    countryFlag: "🇳🇿",
    theme: "nature",
    minutesAgo: 510,
    tags: ["trees","outdoors","clouds","warm","sunset"],
    shapes: ["organic","layered","horizontal"],
  },
  { id: "22", uri: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400", country: "Italy", countryCode: "IT", countryFlag: "🇮🇹", theme: "morning", minutesAgo: 12, tags: ["coffee","drink","warm"] },
  { id: "23", uri: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=400", country: "Vietnam", countryCode: "VN", countryFlag: "🇻🇳", theme: "morning", minutesAgo: 88, tags: ["coffee","drink"] },
  { id: "24", uri: "https://images.unsplash.com/photo-1494314671902-399b18174975?w=400", country: "Turkey", countryCode: "TR", countryFlag: "🇹🇷", theme: "morning", minutesAgo: 320, tags: ["coffee","drink","warm"] },
  // (entry "25" removed — its Unsplash URI was identical to entry "1"
  // (Ethiopia / morning), causing the same image to surface twice in the
  // Match deck under two different country flags. The dev-time
  // assertion below now guards against re-introducing a duplicate.)
  { id: "26", uri: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", country: "Thailand", countryCode: "TH", countryFlag: "🇹🇭", theme: "food", minutesAgo: 33, tags: ["meal","warm"] },
  { id: "27", uri: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400", country: "France", countryCode: "FR", countryFlag: "🇫🇷", theme: "food", minutesAgo: 145, tags: ["meal","bread"] },
  { id: "28", uri: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400", country: "United States", countryCode: "US", countryFlag: "🇺🇸", theme: "food", minutesAgo: 62, tags: ["meal","bread"] },
  { id: "29", uri: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400", country: "Greece", countryCode: "GR", countryFlag: "🇬🇷", theme: "food", minutesAgo: 415, tags: ["meal","bread","drink"] },
  { id: "30", uri: "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=400", country: "Netherlands", countryCode: "NL", countryFlag: "🇳🇱", theme: "work", minutesAgo: 51, tags: ["laptop","desk","coffee"] },
  { id: "31", uri: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=400", country: "Sweden", countryCode: "SE", countryFlag: "🇸🇪", theme: "work", minutesAgo: 200, tags: ["laptop","desk"] },
  { id: "32", uri: "https://images.unsplash.com/photo-1483450388369-9ed95738483c?w=400", country: "Iceland", countryCode: "IS", countryFlag: "🇮🇸", theme: "nature", minutesAgo: 920, tags: ["mountains","sunset","clouds","outdoors"] },
  { id: "33", uri: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400", country: "Switzerland", countryCode: "CH", countryFlag: "🇨🇭", theme: "nature", minutesAgo: 14, tags: ["mountains","clouds","outdoors","sunset"] },
  { id: "34", uri: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=400", country: "Chile", countryCode: "CL", countryFlag: "🇨🇱", theme: "nature", minutesAgo: 175, tags: ["mountains","outdoors","trees"] },
  { id: "35", uri: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=400", country: "Ireland", countryCode: "IE", countryFlag: "🇮🇪", theme: "nature", minutesAgo: 605, tags: ["mountains","clouds","water","outdoors"] },
  { id: "36", uri: "https://images.unsplash.com/photo-1444080748397-f442aa95c3e5?w=400", country: "Egypt", countryCode: "EG", countryFlag: "🇪🇬", theme: "sky", minutesAgo: 41, tags: ["sunset","clouds","outdoors","warm"] },
  { id: "37", uri: "https://images.unsplash.com/photo-1419833173245-f59e1b93f9ee?w=400", country: "Portugal", countryCode: "PT", countryFlag: "🇵🇹", theme: "sky", minutesAgo: 220, tags: ["sunset","clouds","water","outdoors"] },
  { id: "38", uri: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400", country: "Nepal", countryCode: "NP", countryFlag: "🇳🇵", theme: "sky", minutesAgo: 770, tags: ["clouds","mountains","outdoors","warm"] },
  // id 39 (workshop person, no hands in frame) reclassified to "work".
  { id: "39", uri: "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?w=400", country: "Indonesia", countryCode: "ID", countryFlag: "🇮🇩", theme: "work", minutesAgo: 26, tags: ["people","desk"] },
  // id 40 (Colombia kayak, photo 1521336575822) and id 41 (Senegal Lego
  // chicken figurine, photo 1517242810446) were previously misclassified
  // as "hands" — neither image actually shows hands. Reclassified to
  // nature (kayak on water) and joy (toy/figurine) so the "Your hands"
  // theme is honest about what it surfaces.
  { id: "40", uri: "https://images.unsplash.com/photo-1521336575822-6da63fb45455?w=400", country: "Colombia", countryCode: "CO", countryFlag: "🇨🇴", theme: "water", minutesAgo: 380, tags: ["water","outdoors"] },
  { id: "41", uri: "https://images.unsplash.com/photo-1517242810446-cc8951b2be40?w=400", country: "Senegal", countryCode: "SN", countryFlag: "🇸🇳", theme: "wall", minutesAgo: 105, tags: ["art","home"] },
  { id: "42", uri: "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?w=400", country: "Russia", countryCode: "RU", countryFlag: "🇷🇺", theme: "pets", minutesAgo: 60, tags: ["dog","animal","outdoors"] },
  { id: "43", uri: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=400", country: "Vietnam", countryCode: "VN", countryFlag: "🇻🇳", theme: "pets", minutesAgo: 240, tags: ["cat","animal"] },
  { id: "44", uri: "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=400", country: "Belgium", countryCode: "BE", countryFlag: "🇧🇪", theme: "pets", minutesAgo: 480, tags: ["dog","animal","smile","outdoors"] },
  { id: "45", uri: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400", country: "Singapore", countryCode: "SG", countryFlag: "🇸🇬", theme: "commute", minutesAgo: 18, tags: ["city","transit","night"] },
  { id: "46", uri: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400", country: "United States", countryCode: "US", countryFlag: "🇺🇸", theme: "commute", minutesAgo: 132, tags: ["transit","city"] },
  { id: "47", uri: "https://images.unsplash.com/photo-1473625247510-8ceb1760943f?w=400", country: "Hong Kong", countryCode: "HK", countryFlag: "🇭🇰", theme: "commute", minutesAgo: 75, tags: ["city","night","transit"] },
  { id: "48", uri: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400", country: "Mexico", countryCode: "MX", countryFlag: "🇲🇽", theme: "joy", minutesAgo: 22, tags: ["people","smile","celebration"] },
  { id: "49", uri: "https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=400", country: "Nigeria", countryCode: "NG", countryFlag: "🇳🇬", theme: "joy", minutesAgo: 195, tags: ["people","smile","celebration"] },
  { id: "50", uri: "https://images.unsplash.com/photo-1527525443983-6e60c75fff46?w=400", country: "Philippines", countryCode: "PH", countryFlag: "🇵🇭", theme: "joy", minutesAgo: 88, tags: ["people","smile","celebration"] },
  { id: "51", uri: "https://images.unsplash.com/photo-1472396961693-142e6e269027?w=400", country: "Tanzania", countryCode: "TZ", countryFlag: "🇹🇿", theme: "nature", minutesAgo: 350, tags: ["wildlife","animal","outdoors"] },
  { id: "52", uri: "https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=400", country: "Botswana", countryCode: "BW", countryFlag: "🇧🇼", theme: "pets", minutesAgo: 1100, tags: ["wildlife","animal","outdoors"] },
  // ── Launch-day pool expansion ──────────────────────────────────────────
  // Each entry below uses a Unsplash image already proven loadable in
  // SYNTH_PHOTO_BANK. Tags are intentionally narrow — only what is
  // visually undeniable in the photo — to keep "Both have …" honest.
  // Coffee / morning
  { id: "53", uri: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=400", country: "Czechia", countryCode: "CZ", countryFlag: "🇨🇿", theme: "cafe", minutesAgo: 19, tags: ["coffee","drink","cafe"] },
  { id: "54", uri: "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=400", country: "Denmark", countryCode: "DK", countryFlag: "🇩🇰", theme: "cafe", minutesAgo: 92, tags: ["coffee","drink","warm"] },
  { id: "55", uri: "https://images.unsplash.com/photo-1497636577773-f1231844b336?w=400", country: "Austria", countryCode: "AT", countryFlag: "🇦🇹", theme: "coffee", minutesAgo: 250, tags: ["coffee","drink"] },
  { id: "56", uri: "https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=400", country: "Hungary", countryCode: "HU", countryFlag: "🇭🇺", theme: "cafe", minutesAgo: 410, tags: ["coffee","cafe"] },
  // Food / meals
  { id: "57", uri: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400", country: "Israel", countryCode: "IL", countryFlag: "🇮🇱", theme: "food", minutesAgo: 27, tags: ["meal","cooking"] },
  { id: "58", uri: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=400", country: "Lebanon", countryCode: "LB", countryFlag: "🇱🇧", theme: "food", minutesAgo: 105, tags: ["meal","bread"] },
  { id: "59", uri: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400", country: "Sri Lanka", countryCode: "LK", countryFlag: "🇱🇰", theme: "food", minutesAgo: 340, tags: ["meal","cooking","warm"] },
  { id: "60", uri: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400", country: "Malaysia", countryCode: "MY", countryFlag: "🇲🇾", theme: "groceries", minutesAgo: 56, tags: ["meal","grocery","food"] },
  // Workspace / desk
  { id: "61", uri: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400", country: "Estonia", countryCode: "EE", countryFlag: "🇪🇪", theme: "handwriting", minutesAgo: 44, tags: ["laptop","desk","study","art"] },
  { id: "62", uri: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400", country: "Poland", countryCode: "PL", countryFlag: "🇵🇱", theme: "work", minutesAgo: 168, tags: ["laptop","desk","coffee"] },
  // Sky / sunsets
  { id: "63", uri: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=400", country: "Madagascar", countryCode: "MG", countryFlag: "🇲🇬", theme: "sky", minutesAgo: 33, tags: ["sunset","clouds","outdoors"] },
  { id: "64", uri: "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=400", country: "Croatia", countryCode: "HR", countryFlag: "🇭🇷", theme: "sky", minutesAgo: 470, tags: ["sunset","clouds","water","outdoors"] },
  { id: "65", uri: "https://images.unsplash.com/photo-1495344517868-8ebaf0a2044a?w=400", country: "Cambodia", countryCode: "KH", countryFlag: "🇰🇭", theme: "sky", minutesAgo: 880, tags: ["sunset","clouds","warm"] },
  // Hands / making — entries kept only when the image visibly features
  // hands. Two previous entries (1531913764164 and 1455218873509)
  // didn't actually show hands and were reclassified to "nature".
  { id: "66", uri: "https://images.unsplash.com/photo-1531913764164-f85c52e6e654?w=400", country: "Bolivia", countryCode: "BO", countryFlag: "🇧🇴", theme: "nature", minutesAgo: 70, tags: ["outdoors","trees"] },
  { id: "67", uri: "https://images.unsplash.com/photo-1455218873509-8097305ee378?w=400", country: "Ghana", countryCode: "GH", countryFlag: "🇬🇭", theme: "nature", minutesAgo: 290, tags: ["trees","outdoors","water"] },
  { id: "68", uri: "https://images.unsplash.com/photo-1525373698358-041e3a460346?w=400", country: "Pakistan", countryCode: "PK", countryFlag: "🇵🇰", theme: "objects", minutesAgo: 615, tags: ["crafts","vintage","home"] },
  // Joy / smiles
  { id: "69", uri: "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=400", country: "Ecuador", countryCode: "EC", countryFlag: "🇪🇨", theme: "joy", minutesAgo: 36, tags: ["people","smile","friends"] },
  // Commute / city
  { id: "70", uri: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=400", country: "Taiwan", countryCode: "TW", countryFlag: "🇹🇼", theme: "commute", minutesAgo: 110, tags: ["city","transit","night"] },
  // Pets reused with new countries (these images are well-loved animals)
  // Active / outdoors movement
  { id: "73", uri: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400", country: "Slovenia", countryCode: "SI", countryFlag: "🇸🇮", theme: "passions", minutesAgo: 80, tags: ["hiking","outdoors","mountains","fitness"] },
  { id: "74", uri: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400", country: "Bulgaria", countryCode: "BG", countryFlag: "🇧🇬", theme: "movement", minutesAgo: 220, tags: ["running","fitness","outdoors"] },
  { id: "75", uri: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400", country: "Costa Rica", countryCode: "CR", countryFlag: "🇨🇷", theme: "movement", minutesAgo: 460, tags: ["yoga","fitness","outdoors"] },
  { id: "76", uri: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400", country: "Lithuania", countryCode: "LT", countryFlag: "🇱🇹", theme: "movement", minutesAgo: 700, tags: ["cycling","outdoors"] },
  // Home / cozy
  { id: "77", uri: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=400", country: "Norway", countryCode: "NO", countryFlag: "🇳🇴", theme: "ritual", minutesAgo: 60, tags: ["home","cozy","plants"] },
  { id: "78", uri: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400", country: "Slovakia", countryCode: "SK", countryFlag: "🇸🇰", theme: "morning", minutesAgo: 320, tags: ["plants","home","flowers"] },
  { id: "79", uri: "https://images.unsplash.com/photo-1462536943532-57a629f6cc60?w=400", country: "Iceland", countryCode: "IS", countryFlag: "🇮🇸", theme: "night", minutesAgo: 540, tags: ["home","cozy","vintage","night"] },
  // Travel / cityscapes
  { id: "80", uri: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400", country: "United Arab Emirates", countryCode: "AE", countryFlag: "🇦🇪", theme: "wheels", minutesAgo: 95, tags: ["travel","city","transit"] },
  { id: "81", uri: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400", country: "France", countryCode: "FR", countryFlag: "🇫🇷", theme: "commute", minutesAgo: 260, tags: ["travel","city","outdoors"] },
  { id: "82", uri: "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=400", country: "Cuba", countryCode: "CU", countryFlag: "🇨🇺", theme: "joy", minutesAgo: 145, tags: ["travel","people","warm"] },
  { id: "83", uri: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400", country: "Maldives", countryCode: "MV", countryFlag: "🇲🇻", theme: "nature", minutesAgo: 380, tags: ["beach","water","outdoors","sunset"] },
  { id: "84", uri: "https://images.unsplash.com/photo-1512100356356-de1b84283e18?w=400", country: "Greece", countryCode: "GR", countryFlag: "🇬🇷", theme: "nature", minutesAgo: 710, tags: ["beach","water","outdoors","warm"] },
  // Wildlife
  // ── Themes added later: furniture / games / hobbies / birds / rocks / plants ──
  // Photo IDs here are intentionally drawn from the same Unsplash photos
  // already proven loadable elsewhere in this file — picked because they
  // honestly fit the new theme too (e.g. a "cozy home interior" is also
  // a furniture shot, a "wildlife outdoors" shot is also a bird/animal
  // shot, a "mountains/cliffs" shot doubles as a rocks shot). This keeps
  // the new themes visibly populated without risking broken image URLs.
  // Furniture
  { id: "87", uri: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=400", country: "Japan", countryCode: "JP", countryFlag: "🇯🇵", theme: "furniture", minutesAgo: 210, tags: ["home","cozy"] },
  { id: "88", uri: "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=400", country: "Italy", countryCode: "IT", countryFlag: "🇮🇹", theme: "furniture", minutesAgo: 540, tags: ["home","vintage"] },
  // Games (board game / strategy / play). Only one verified-loadable
  // Unsplash ID for now (chess board) — the previous two IDs returned
  // blank images and were removed. Add new ones only after confirming
  // they load.
  { id: "89", uri: "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400", country: "Germany", countryCode: "DE", countryFlag: "🇩🇪", theme: "games", minutesAgo: 33, tags: ["gaming","play","hobby"] },
  // Hobbies — reusing creative-bucket shots that already represent
  // clearly hobby-style activities (music, photography, crafts).
  { id: "92", uri: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400", country: "Argentina", countryCode: "AR", countryFlag: "🇦🇷", theme: "hobbies", minutesAgo: 60, tags: ["music","hobby"] },
  { id: "93", uri: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400", country: "Australia", countryCode: "AU", countryFlag: "🇦🇺", theme: "hobbies", minutesAgo: 175, tags: ["photography","hobby"] },
  { id: "94", uri: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400", country: "Vietnam", countryCode: "VN", countryFlag: "🇻🇳", theme: "hobbies", minutesAgo: 320, tags: ["crafts","hobby"] },
  // Birds — only the NZ parrot is confirmed to render correctly; the
  // other Unsplash IDs we tried (Kenya 1444464666168, Peru 1518509562904)
  // either come back blank or aren't visibly birds, so they're removed.
  { id: "96", uri: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?w=400", country: "New Zealand", countryCode: "NZ", countryFlag: "🇳🇿", theme: "birds", minutesAgo: 130, tags: ["bird","wildlife","outdoors"] },
  // Rocks theme removed — every Unsplash ID we tried in this bucket
  // displayed as something else (airplane interior, misty forest, mountain
  // landscape) so it broke the "this is a rock" promise of the prompt.
  // The theme will return only when we have verified rock photos.
  // Plants — close-ups of plants/flowers/garden, distinct from the broader
  // "nature" landscape shots.
  { id: "102", uri: "https://images.unsplash.com/photo-1497206365907-f5e630693df0?w=400", country: "Thailand", countryCode: "TH", countryFlag: "🇹🇭", theme: "plant", minutesAgo: 150, tags: ["flowers","plants"] },
  { id: "103", uri: "https://images.unsplash.com/photo-1545241047-6083a3684587?w=400", country: "Vietnam", countryCode: "VN", countryFlag: "🇻🇳", theme: "plant", minutesAgo: 360, tags: ["plants","garden"] },
  // ── Padding pass: bring under-represented themes up to ~5 entries each
  // so the discovery feed has real variety. All Unsplash IDs reused below
  // are already proven loadable elsewhere in this file — no new untested
  // IDs (we got burned by guessing IDs for the rocks/birds buckets). Each
  // entry uses a NEW country so discovery pairs never repeat the same URI.
  // Plants (was 3 → 5)
  // Furniture (was 3 → 5)
  // Hobbies (was 3 → 5) — reuse remaining creative-bucket shots
  { id: "108", uri: "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400", country: "Portugal", countryCode: "PT", countryFlag: "🇵🇹", theme: "hobbies", minutesAgo: 90, tags: ["art","crafts","hobby"] },
  // Made (was 1 → 5) — handmade / created things. Pulls from craft + art
  // photos that visibly read as "something a person made".
  // Birds + Games stay at 1 entry each — every other Unsplash ID we tried
  // for these buckets came back blank or visibly off-theme. Discovery feed
  // requires >=2 photos to pair, so these themes won't appear in Discover
  // until verified additional photos arrive. The themes still work for
  // user uploads via the Match flow.

  // Music (new) — vinyl, headphones, vintage radios, DJ decks. Falls back
  // to "hobbies" via THEME_ADJACENCY so a music ripple still finds a wave
  // even on quiet days.
  { id: "109", uri: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400", country: "Japan", countryCode: "JP", countryFlag: "🇯🇵", theme: "music", minutesAgo: 22, tags: ["music","vintage","hobby"] },
  { id: "110", uri: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400", country: "Sweden", countryCode: "SE", countryFlag: "🇸🇪", theme: "music", minutesAgo: 95, tags: ["music","cozy","hobby"] },
  { id: "111", uri: "https://images.unsplash.com/photo-1485579149621-3123dd979885?w=400", country: "Italy", countryCode: "IT", countryFlag: "🇮🇹", theme: "music", minutesAgo: 240, tags: ["music","vintage"] },
  { id: "112", uri: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400", country: "Brazil", countryCode: "BR", countryFlag: "🇧🇷", theme: "music", minutesAgo: 47, tags: ["music","party"] },
  // ── Launch moment coverage (30 everyday photo types) ───────────────────
  // STOCK_LAUNCH_SLOTS maps each slot → a proven-loadable SAMPLE_PHOTOS id.
  {
    id: "128",
    launchSlot: "tea_drinks",
    uri: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
    country: "Italy",
    countryCode: "IT",
    countryFlag: "🇮🇹",
    theme: "coffee",
    minutesAgo: 31,
    tags: ["coffee", "warm", "drink"],
    subjects: ["coffee cup", "latte art", "wood table"],
    musicGenre: "calm",
  },
  {
    id: "129",
    uri: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400",
    country: "Colombia",
    countryCode: "CO",
    countryFlag: "🇨🇴",
    theme: "cafe",
    minutesAgo: 42,
    tags: ["coffee", "breakfast", "warm", "cafe"],
    subjects: ["pour over", "coffee", "ceramic mug"],
    musicGenre: "calm",
  },
  {
    id: "123",
    launchSlot: "window_view",
    uri: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400",
    country: "Malaysia",
    countryCode: "MY",
    countryFlag: "🇲🇾",
    theme: "view",
    minutesAgo: 95,
    tags: ["desk", "city", "outdoors"],
    subjects: ["window view", "city skyline", "desk"],
    musicGenre: "wonder",
  },
  // ── Daily theme samples: unique Unsplash IDs for thin / new themes ──
  { id: "130", uri: unsplashPhotoUrl("1531746020798-e6953c6e8e04"), country: "Jordan", countryCode: "JO", countryFlag: "🇯🇴", theme: "hands", minutesAgo: 44, tags: ["people","art","warm"] },
  { id: "131", uri: unsplashPhotoUrl("1542291026-7eec264c27ff"), country: "Romania", countryCode: "RO", countryFlag: "🇷🇴", theme: "shoes", minutesAgo: 61, tags: ["shoes","fashion","city"] },
  { id: "132", uri: unsplashPhotoUrl("1516280440614-37939bbacd81"), country: "Panama", countryCode: "PA", countryFlag: "🇵🇦", theme: "instrument", minutesAgo: 88, tags: ["music","hobby"] },
  { id: "133", uri: unsplashPhotoUrl("1516321318423-f06f85e504b3"), country: "Laos", countryCode: "LA", countryFlag: "🇱🇦", theme: "listening", minutesAgo: 120, tags: ["music","cozy","hobby"] },
  { id: "134", uri: unsplashPhotoUrl("1515886657613-9f3515b0c78f"), country: "Latvia", countryCode: "LV", countryFlag: "🇱🇻", theme: "wearing", minutesAgo: 35, tags: ["fashion","people"] },
  { id: "135", uri: unsplashPhotoUrl("1558618666-fcd25c85cd64"), country: "Ukraine", countryCode: "UA", countryFlag: "🇺🇦", theme: "door", minutesAgo: 210, tags: ["home","city"] },
  { id: "136", uri: unsplashPhotoUrl("1534528741775-53994a69daeb"), country: "Bangladesh", countryCode: "BD", countryFlag: "🇧🇩", theme: "selfie", minutesAgo: 28, tags: ["selfie","people","smile"] },
  { id: "137", uri: unsplashPhotoUrl("1438761681033-6461ffad8d80"), country: "Pakistan", countryCode: "PK", countryFlag: "🇵🇰", theme: "selfie", minutesAgo: 95, tags: ["selfie","people"] },
  { id: "138", uri: unsplashPhotoUrl("1607082349566-187342175e2f"), country: "Romania", countryCode: "RO", countryFlag: "🇷🇴", theme: "shopping", minutesAgo: 52, tags: ["shopping","grocery","city"] },
  { id: "139", uri: unsplashPhotoUrl("1581578731548-c64695cc6952"), country: "Estonia", countryCode: "EE", countryFlag: "🇪🇪", theme: "chores", minutesAgo: 73, tags: ["chores","cleaning","home"] },
  { id: "140", uri: unsplashPhotoUrl("1519681393784-d120267933ba"), country: "Sri Lanka", countryCode: "LK", countryFlag: "🇱🇰", theme: "reading", minutesAgo: 140, tags: ["reading","cozy","home"] },
  // Babies — happy + crying for subject-matter matching (baby ↔ smile / cry).
  {
    id: "141",
    uri: unsplashPhotoUrl("1694605735529-8d60f23a30b6"),
    country: "Finland",
    countryCode: "FI",
    countryFlag: "🇫🇮",
    theme: "joy",
    minutesAgo: 42,
    tags: ["kids", "family", "smile", "people"],
    shapes: ["curves", "centered", "organic"],
    subjects: ["baby", "smile", "happy"],
  },
  {
    id: "142",
    uri: unsplashPhotoUrl("1604518950478-98429105d1f6"),
    country: "India",
    countryCode: "IN",
    countryFlag: "🇮🇳",
    theme: "joy",
    minutesAgo: 118,
    tags: ["kids", "family", "people"],
    shapes: ["centered", "curves", "organic"],
    subjects: ["baby", "crying", "newborn"],
  },
];

/** Maps launch QA slots → primary stock photo id (existing + new). */
export const STOCK_LAUNCH_SLOTS: Readonly<Record<string, string>> = {
  selfie: "48",
  coffee_tea_drinks: "128",
  breakfast_lunch_dinner: "26",
  pets: "14",
  kids_family: "141",
  desk_work: "30",
  commute: "45",
  weather: "37",
  window_view: "123",
  street_scene: "45",
  couch_cozy: "77",
  tv_gaming: "89",
  gym_workout: "74",
  cooking: "57",
  hobby: "92",
  garden_plants: "78",
  shoes_feet: "74",
  object_in_hand: "22",
  social_hangout: "69",
  sunset_sunrise: "63",
  shopping_groceries: "60",
  car_interior: "15",
  mirror_outfit: "108",
  book_reading: "93",
  random_detail: "41",
  public_cafe: "56",
  travel_moment: "80",
  food_prep: "57",
  bed_morning: "77",
  funny_unexpected: "14",
};

for (const [slot, photoId] of Object.entries(STOCK_LAUNCH_SLOTS)) {
  const idx = SAMPLE_PHOTOS.findIndex((p) => p.id === photoId);
  if (idx >= 0 && !SAMPLE_PHOTOS[idx].launchSlot) {
    SAMPLE_PHOTOS[idx] = { ...SAMPLE_PHOTOS[idx], launchSlot: slot };
  }
}

const TAG_SUBJECT_HINTS: Record<string, string[]> = {
  coffee: ["coffee cup", "coffee"],
  tea: ["tea cup", "tea"],
  drink: ["drink", "glass"],
  breakfast: ["breakfast", "toast"],
  lunch: ["lunch", "meal"],
  dinner: ["dinner", "meal"],
  meal: ["meal", "plate"],
  snack: ["snack"],
  bread: ["bread"],
  cooking: ["cooking", "kitchen"],
  baking: ["baking"],
  dog: ["dog"],
  cat: ["cat"],
  animal: ["animal"],
  wildlife: ["wildlife"],
  people: ["people"],
  smile: ["smile"],
  friends: ["friends"],
  family: ["family"],
  kids: ["children", "family"],
  laptop: ["laptop", "computer"],
  desk: ["desk", "workspace"],
  study: ["study", "books"],
  transit: ["commute", "train"],
  city: ["city", "street"],
  rain: ["rain", "weather"],
  clouds: ["clouds", "sky"],
  sunset: ["sunset", "sky"],
  sunrise: ["sunrise", "sky"],
  stars: ["stars", "night sky"],
  night: ["night"],
  home: ["home", "room"],
  cozy: ["cozy", "blanket"],
  plants: ["plants", "greenery"],
  flowers: ["flowers"],
  garden: ["garden"],
  gaming: ["gaming", "screen"],
  play: ["play"],
  fitness: ["workout", "gym"],
  yoga: ["yoga"],
  running: ["running"],
  cycling: ["cycling"],
  hiking: ["hiking"],
  crafts: ["crafts", "handmade"],
  art: ["art"],
  music: ["music"],
  photography: ["photography"],
  reading: ["book", "reading"],
  travel: ["travel"],
  beach: ["beach"],
  water: ["water"],
  mountains: ["mountains"],
  trees: ["trees"],
  outdoors: ["outdoors"],
  selfie: ["selfie", "portrait"],
  mirror: ["mirror", "reflection"],
  shopping: ["shopping"],
  grocery: ["groceries"],
  cafe: ["cafe"],
  food: ["food"],
};

const THEME_SUBJECT_HINTS: Record<string, string[]> = {
  morning: ["morning", "coffee cup"],
  coffee: ["coffee cup", "coffee"],
  food: ["meal", "food"],
  work: ["desk", "laptop"],
  commute: ["commute", "transit"],
  sky: ["sky", "clouds"],
  weather: ["weather", "rain"],
  joy: ["smile", "people"],
  nature: ["landscape", "outdoors"],
  pets: ["pet", "animal"],
  home: ["home", "cozy"],
  travel: ["travel"],
  games: ["gaming"],
  hobbies: ["hobby"],
  music: ["music"],
  selfie: ["selfie", "portrait"],
  reading: ["book", "reading"],
  view: ["window view", "landscape"],
  groceries: ["groceries", "food"],
  cafe: ["cafe", "coffee cup"],
  shoes: ["shoes", "feet"],
  wearing: ["outfit", "mirror"],
  wheels: ["car", "vehicle"],
  night: ["bedroom", "night"],
  made: ["handmade", "craft"],
  movement: ["workout", "exercise"],
};

function inferStockSubjects(photo: SamplePhoto): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const tag of photo.tags) {
    for (const s of TAG_SUBJECT_HINTS[tag] ?? [tag]) push(s);
  }
  for (const s of THEME_SUBJECT_HINTS[photo.theme] ?? []) push(s);
  return out.slice(0, 8);
}

function enrichLaunchStockMetadata(photo: SamplePhoto): SamplePhoto {
  const musicGenre: MusicGenre =
    (photo.musicGenre as MusicGenre | undefined) ??
    suggestGenre(photo.theme, photo.tags);
  const subjects =
    photo.subjects && photo.subjects.length > 0
      ? photo.subjects
      : inferStockSubjects(photo);
  const uri = photo.uri.includes("images.unsplash.com")
    ? normalizeUnsplashUri(photo.uri)
    : photo.uri;
  const code = photo.countryCode?.trim().toUpperCase();
  const captureCountryCode =
    photo.captureCountryCode ??
    (code && code.length === 2 ? code : undefined);
  return { ...photo, uri, musicGenre, subjects, captureCountryCode };
}

for (let i = 0; i < SAMPLE_PHOTOS.length; i++) {
  SAMPLE_PHOTOS[i] = enrichLaunchStockMetadata(SAMPLE_PHOTOS[i]);
}

// ─────────────────────────────────────────────────────────────────────────
// TEST-BUILD ONLY: synthetic candidate generator
// In production, never invent photos — match against real users only.
// This widens the pool so test users always have fresh material to swipe.
// Gated by `ENABLE_SYNTHETIC_MATCHES` below; production builds must keep
// it false (default tied to `__DEV__`, so release builds can never leak).
// ─────────────────────────────────────────────────────────────────────────

// True in Expo Go and `expo start` (dev). False in `expo export` /
// production bundles. Callers should respect this flag.
declare const __DEV__: boolean;
export const ENABLE_SYNTHETIC_MATCHES: boolean =
  typeof __DEV__ !== "undefined" ? __DEV__ : false;

const SYNTH_COUNTRY_POOL: { country: string; code: string; flag: string }[] = [
  { country: "Argentina", code: "AR", flag: "🇦🇷" },
  { country: "Australia", code: "AU", flag: "🇦🇺" },
  { country: "Austria", code: "AT", flag: "🇦🇹" },
  { country: "Bangladesh", code: "BD", flag: "🇧🇩" },
  { country: "Belgium", code: "BE", flag: "🇧🇪" },
  { country: "Bolivia", code: "BO", flag: "🇧🇴" },
  { country: "Cambodia", code: "KH", flag: "🇰🇭" },
  { country: "Croatia", code: "HR", flag: "🇭🇷" },
  { country: "Czechia", code: "CZ", flag: "🇨🇿" },
  { country: "Denmark", code: "DK", flag: "🇩🇰" },
  { country: "Ecuador", code: "EC", flag: "🇪🇨" },
  { country: "Estonia", code: "EE", flag: "🇪🇪" },
  { country: "Ghana", code: "GH", flag: "🇬🇭" },
  { country: "Hungary", code: "HU", flag: "🇭🇺" },
  { country: "Israel", code: "IL", flag: "🇮🇱" },
  { country: "Jordan", code: "JO", flag: "🇯🇴" },
  { country: "Laos", code: "LA", flag: "🇱🇦" },
  { country: "Latvia", code: "LV", flag: "🇱🇻" },
  { country: "Malaysia", code: "MY", flag: "🇲🇾" },
  { country: "Pakistan", code: "PK", flag: "🇵🇰" },
  { country: "Panama", code: "PA", flag: "🇵🇦" },
  { country: "Poland", code: "PL", flag: "🇵🇱" },
  { country: "Romania", code: "RO", flag: "🇷🇴" },
  { country: "Sri Lanka", code: "LK", flag: "🇱🇰" },
  { country: "Taiwan", code: "TW", flag: "🇹🇼" },
  { country: "Ukraine", code: "UA", flag: "🇺🇦" },
];

// Topical photo IDs grouped by theme — generator picks from these so
// synthesized "matches" still feel relevant to what the user posted.
// Expanded photo buckets for the test build's synthetic candidate generator.
// Every ID below is a real Unsplash photo and most are already used in the
// curated SAMPLE_PHOTOS pool (so we know they load reliably). The buckets
// are deliberately overfilled — when the AI suggests a freeform theme we
// want plenty of visual variety to swipe through, not the same 4 photos
// recycled with different country flags.
const SYNTH_PHOTO_BANK = {
  morning: [
    "1495474472287-4d71bcdd2085","1541167760496-1628856ab772","1509042239860-f550ce710b93",
    "1521017432531-fbd92d768814","1494314671902-399b18174975","1497935586351-b67a49e012bf",
    "1542990253-0d0f5be5f0ed","1497636577773-f1231844b336",
    "1466637574441-749b8f19452f",
  ],
  // Coffee / café — three-cup toast ids (1554118811, 1559056199) banned entirely.
  coffee: [
    "1495474472287-4d71bcdd2085","1509042239860-f550ce710b93","1497935586351-b67a49e012bf",
    "1542990253-0d0f5be5f0ed","1497636577773-f1231844b336","1466637574441-749b8f19452f",
    "1541167760496-1628856ab772","1521017432531-fbd92d768814","1494314671902-399b18174975",
  ],
  cafe: [
    "1495474472287-4d71bcdd2085","1509042239860-f550ce710b93","1497935586351-b67a49e012bf",
    "1542990253-0d0f5be5f0ed","1521017432531-fbd92d768814","1466637574441-749b8f19452f",
  ],
  shoes: [
    "1517836357463-d25dfeac3438","1518611012118-696072aa579a","1545205597-3d9d02c29597",
  ],
  weather: [
    "1559827260-dc66d52bef19","1419833173245-f59e1b93f9ee","1470071459604-3b5ec3a7fe05",
    "1500530855697-b586d89ba3ee","1532274402911-5a369e4c4bb5","1495344517868-8ebaf0a2044a",
  ],
  night: [
    "1505691938895-1758d7feb511","1462536943532-57a629f6cc60","1416879595882-3373a0480b5b",
    "1519710164239-da123dc03ef4","1493663284031-b7e3aefcae8e",
  ],
  groceries: [
    "1546069901-ba9599a7e63c","1568901346375-23c9450c58cd","1565299624946-b28f40a0ae38",
    "1540189549336-e6e99c3679fe","1473093295043-cdd812d0e601",
  ],
  wearing: [
    "1513475382585-d06e58bcb0e0","1507003211169-0a1dd7228f2d","1455390582262-044cdead277a",
    "1481627834876-b7833e8f5570",
  ],
  selfie: [
    "1530103862676-de8c9debad1d","1488161628813-04466f872be2","1543610892-0b1f7e6d8ac1",
    "1527525443983-6e60c75fff46",
  ],
  wheels: [
    "1544620347-c4fd4a3d5957","1513635269975-59663e0ac1ad","1518611012118-696072aa579a",
    "1545205597-3d9d02c29597","1502920917128-1aa500764cbd",
  ],
  food: [
    "1504674900247-0877df9cc836","1476224203421-9ac39bcb3327","1568901346375-23c9450c58cd",
    "1565299624946-b28f40a0ae38","1551782450-a2132b4ba21d","1565958011703-44f9829ba187",
    "1540189549336-e6e99c3679fe","1473093295043-cdd812d0e601","1467003909585-2f8a72700288",
    "1546069901-ba9599a7e63c",
  ],
  // Hands bucket — only IDs that visibly feature hands as the subject.
  // Anything ambiguous (workshop scenes, forests, generic "people"
  // shots) belongs in work/nature/joy instead, otherwise the "Your
  // hands" theme matches photos that don't show hands. The two IDs
  // 1521336575822 (kayak) and 1517242810446 (toy figurine) were
  // removed for exactly this reason.
  hands: [
    "1558769132-cb1aea458c5e","1574169208507-84376144848b",
    // Hands-forward "work" shots — both visibly feature hands as the
    // subject (hands at a laptop / hand writing on a whiteboard), so
    // they double as honest hands content even though they also live
    // in the work theme.
    "1517245386807-bb43f82c33c4","1531403009284-440f080d1e12",
  ],
  sky: [
    "1559827260-dc66d52bef19","1419242902214-272b3f66ee7a","1500382017468-9049fed747ef",
    "1444080748397-f442aa95c3e5","1419833173245-f59e1b93f9ee","1470071459604-3b5ec3a7fe05",
    "1500530855697-b586d89ba3ee","1532274402911-5a369e4c4bb5","1495344517868-8ebaf0a2044a",
  ],
  commute: [
    "1544620347-c4fd4a3d5957","1513635269975-59663e0ac1ad","1480714378408-67cf0d13bc1b",
    "1504384308090-c894fdcc538d","1473625247510-8ceb1760943f","1502920917128-1aa500764cbd",
  ],
  work: [
    "1557804506-669a67965ba0","1553877522-43269d4ea984","1499951360447-b19be8fe80f5",
    "1531403009284-440f080d1e12","1517245386807-bb43f82c33c4","1496181133206-80ce9b88a853",
  ],
  joy: [
    "1516627145497-ae6968895b74","1541701494587-cb58502866ab","1530103862676-de8c9debad1d",
    "1543610892-0b1f7e6d8ac1","1694605735529-8d60f23a30b6","1604518950478-98429105d1f6",
  ],
  nature: [
    "1506905925346-21bda4d32df4","1518548419970-58e3b4079ab2","1483450388369-9ed95738483c",
    "1469474968028-56623f02e42e","1418065460487-3e41a6c84dc5","1470770841072-f978cf4d019e",
    "1472214103451-9374bd1c798e","1502082553048-f009c37129b9","1472396961693-142e6e269027",
    "1500382017468-9049fed747ef",
  ],
  pets: [
    "1548247416-ec66f4900b2e","1587300003388-59208cc962cb","1517423440428-a5a00ad493e8",
    "1573865526739-10659fec78a5","1592194996308-7b43878e84a6","1564349683136-77e08dba1ef7",
  ],
  // New lifestyle buckets so lifestyle tags don't fall through to "joy".
  active: [
    "1518611012118-696072aa579a","1517836357463-d25dfeac3438","1571019613454-1cb2f99b2d8b",
    "1545205597-3d9d02c29597","1506905925346-21bda4d32df4","1502082553048-f009c37129b9",
  ],
  creative: [
    "1513475382585-d06e58bcb0e0","1455390582262-044cdead277a","1507003211169-0a1dd7228f2d",
    "1499951360447-b19be8fe80f5","1481627834876-b7833e8f5570","1517242810446-cc8951b2be40",
    "1521336575822-6da63fb45455",
  ],
  home: [
    "1505691938895-1758d7feb511","1416879595882-3373a0480b5b","1519710164239-da123dc03ef4",
    "1462536943532-57a629f6cc60","1493663284031-b7e3aefcae8e",
  ],
  travel: [
    "1488646953014-85cb44e25828","1502602898657-3e91760cbb34","1530789253388-582c481c54b0",
    "1507525428034-b723cf961d3e","1512100356356-de1b84283e18","1444080748397-f442aa95c3e5",
    "1419833173245-f59e1b93f9ee",
  ],
  // ── New themes (furniture / games / hobbies / birds / rocks / plants) ──
  // Buckets reuse photo IDs already proven loadable in the curated
  // SAMPLE_PHOTOS pool above wherever an existing photo honestly fits
  // the new theme, plus a few new IDs flagged in comments. The synth
  // generator just picks one URL + one country pair, so the buckets
  // mostly need ~4–6 reliable IDs each to feel varied.
  furniture: [
    "1505691938895-1758d7feb511","1493663284031-b7e3aefcae8e","1519710164239-da123dc03ef4",
    "1462536943532-57a629f6cc60","1416879595882-3373a0480b5b",
  ],
  games: [
    // Only verified-loadable IDs. The two previous candidates
    // (1611996575749, 1606503826748) returned blank images and were
    // removed. Until we have more confirmed game photos, the bucket
    // intentionally only holds the chess shot.
    "1529699211952-734e80c4d42b",
  ],
  hobbies: [
    "1455390582262-044cdead277a","1481627834876-b7833e8f5570","1507003211169-0a1dd7228f2d",
    "1513475382585-d06e58bcb0e0","1499951360447-b19be8fe80f5",
  ],
  birds: [
    // Only the NZ parrot is verified to render as a bird. Other Unsplash
    // IDs we tried (1444464666168, 1518509562904, 1441829266145) came back
    // blank or weren't visibly birds. Re-add new ones only when verified.
    "1452570053594-1b985d6ea890",
  ],
  // (rocks bucket removed — see SAMPLE_PHOTOS comment near the rocks
  // entries for the same reason. Add back when we have verified rocks.)
  plants: [
    "1416879595882-3373a0480b5b","1497206365907-f5e630693df0","1545241047-6083a3684587",
    "1505691938895-1758d7feb511","1462536943532-57a629f6cc60",
  ],
  // Passions — the intense cousin of "hobbies": training, performing,
  // racing, the thing you'd stay up all night for. All IDs reused from
  // proven-loadable buckets above (active = workouts/cycling/running,
  // music = concerts/party). Synth-only buckets like this are fine —
  // sample-photo dedup only matters in SAMPLE_PHOTOS, not here.
  passions: [
    "1518611012118-696072aa579a","1517836357463-d25dfeac3438","1571019613454-1cb2f99b2d8b",
    "1545205597-3d9d02c29597","1514525253161-7a46d19cd819","1485579149621-3123dd979885",
  ],
} as const;

// Map common tag IDs → SYNTH_PHOTO_BANK theme buckets so freeform user tags
// still funnel to a sensible photo bucket.
const TAG_TO_BUCKET: Record<string, keyof typeof SYNTH_PHOTO_BANK> = {
  coffee: "coffee", tea: "coffee", drink: "coffee", warm: "morning", cozy: "home",
  shoes: "shoes", sneakers: "shoes", boots: "shoes", feet: "shoes",
  breakfast: "morning",
  meal: "food", lunch: "food", dinner: "food", snack: "food",
  bread: "food", cooking: "food", baking: "food", dessert: "food", cafe: "food", food: "food",
  art: "creative", crafts: "creative", music: "creative", photography: "creative", reading: "creative", fashion: "creative",
  sunset: "sky", clouds: "sky", stars: "sky", night: "sky",
  transit: "commute", city: "travel",
  laptop: "work", desk: "work", study: "work",
  smile: "joy", celebration: "joy", people: "joy", party: "joy", friends: "joy", family: "joy", kids: "joy", dancing: "joy",
  trees: "nature", mountains: "nature", outdoors: "nature", water: "nature", snow: "nature", beach: "travel",
  hiking: "active", fitness: "active", yoga: "active", cycling: "active", running: "active", sports: "active",
  travel: "travel",
  home: "home", plants: "home", flowers: "home", garden: "home", vintage: "home",
  gaming: "games", play: "games",
  dog: "pets", cat: "pets", animal: "pets", wildlife: "pets",
  bird: "birds",
  hobby: "hobbies",
  // New lifestyle tags map to the closest existing bucket so synth dev
  // generation still produces something coherent. No new SYNTH buckets
  // — sample-photo IDs for these themes are deliberately skipped per
  // product call (unverified Unsplash IDs would render blank).
  selfie: "selfie", mirror: "wearing",
  shopping: "groceries", grocery: "groceries", parcel: "home",
  rain: "weather",
  outfit: "wearing",
  bike: "wheels",
  chores: "home", cleaning: "home", laundry: "home",
};

const THEME_TO_SYNTH_BUCKET: Partial<
  Record<string, keyof typeof SYNTH_PHOTO_BANK>
> = {
  weather: "weather",
  night: "night",
  groceries: "groceries",
  wearing: "wearing",
  selfie: "selfie",
  wheels: "wheels",
  cafe: "cafe",
  coffee: "coffee",
  morning: "morning",
  food: "food",
  shoes: "shoes",
  commute: "commute",
  travel: "travel",
  view: "travel",
  sky: "sky",
  movement: "active",
  plant: "plants",
  water: "nature",
  playing: "games",
  shopping: "groceries",
  chores: "home",
  objects: "creative",
};

function pickFromTheme(theme: string): keyof typeof SYNTH_PHOTO_BANK {
  if (theme in SYNTH_PHOTO_BANK) return theme as keyof typeof SYNTH_PHOTO_BANK;
  const mapped = THEME_TO_SYNTH_BUCKET[theme];
  if (mapped) return mapped;
  return "joy";
}

// What tags genuinely describe each synthetic photo bucket. Used to honestly
// label generated candidates so the "Both have …" chip on the match screen
// only shows tags that are actually plausible for the photo shown.
const BUCKET_TAG_POOL: Record<keyof typeof SYNTH_PHOTO_BANK, string[]> = {
  morning: ["coffee", "tea", "breakfast", "warm", "cozy", "sunset", "drink"],
  coffee: ["coffee", "tea", "drink", "warm", "cafe", "breakfast"],
  cafe: ["cafe", "coffee", "tea", "drink", "meal", "warm", "cozy"],
  shoes: ["shoes", "sneakers", "boots", "feet", "outdoors", "city"],
  weather: ["rain", "clouds", "sunset", "outdoors", "sky"],
  night: ["night", "home", "cozy", "warm"],
  groceries: ["grocery", "food", "meal", "shopping"],
  wearing: ["mirror", "fashion", "people", "selfie"],
  selfie: ["selfie", "people", "smile", "mirror"],
  wheels: ["transit", "city", "cycling", "outdoors"],
  food: ["meal", "lunch", "dinner", "snack", "bread", "tea", "coffee", "cooking", "baking", "dessert", "drink", "cafe", "food"],
  hands: ["art", "crafts", "people"],
  sky: ["sunset", "clouds", "stars", "night"],
  commute: ["transit", "city", "travel"],
  work: ["laptop", "desk", "study", "coffee"],
  joy: ["smile", "celebration", "people", "party", "friends", "family", "kids", "dancing"],
  nature: ["trees", "mountains", "outdoors", "water", "hiking", "snow"],
  pets: ["dog", "cat", "animal", "wildlife"],
  active: ["fitness", "yoga", "hiking", "cycling", "running", "sports", "outdoors"],
  creative: ["art", "music", "photography", "reading", "crafts", "fashion", "gaming"],
  home: ["home", "plants", "flowers", "garden", "cozy", "vintage"],
  travel: ["travel", "beach", "city", "outdoors", "mountains"],
  furniture: ["home", "cozy", "vintage"],
  games: ["gaming", "play", "hobby", "friends"],
  hobbies: ["hobby", "music", "photography", "crafts", "reading", "gaming"],
  birds: ["bird", "wildlife", "outdoors", "animal"],
  plants: ["plants", "flowers", "garden", "trees"],
  // Passions = high-intensity tags only. Deliberately excludes calm
  // hobby tags (reading, crafts, photography) so a passion synth photo
  // never gets labelled with low-energy chips.
  passions: ["music", "dancing", "party", "sports", "fitness", "celebration", "running", "cycling"],
};

// Builds synthetic candidates that look like real samples but are sampled
// dynamically. Stable-ish ids (synth-…) so React lists don't thrash.
//
// `seenKeys` is the photoKey ledger from AppContext — the generator filters
// the chosen bucket against it so we never emit a photo the user has
// already swiped on, no matter how often the generator is re-invoked.
// When every ID in the relevant bucket has been seen we return [] so the
// caller can surface an honest "no more matches" state instead of
// recycling the same handful of images.
export function generateSyntheticCandidates(
  preferredTheme: string,
  myTags: string[],
  count: number,
  seenKeys: Set<string> = new Set(),
): SamplePhoto[] {
  // Hard gate: never synthesize in production builds.
  if (!ENABLE_SYNTHETIC_MATCHES) return [];
  // Bucket selection priority — theme FIRST, then tag-derived. Previously
  // we let a vibe tag (like "warm" or "cozy") pick the bucket before the
  // theme, which caused embarrassing mismatches: a hand photo tagged
  // "warm" would funnel into the "morning" bucket and surface coffee /
  // sunrise / kayak shots instead of other hand photos. The user's
  // explicit theme choice ("Your hands") is by far the strongest signal
  // we have, so it always wins when it maps to a real bucket.
  const themeBucket = preferredTheme in SYNTH_PHOTO_BANK
    ? (preferredTheme as keyof typeof SYNTH_PHOTO_BANK)
    : null;
  const bucketKey =
    themeBucket ??
    (myTags.map((t) => TAG_TO_BUCKET[t]).find(Boolean) as keyof typeof SYNTH_PHOTO_BANK | undefined) ??
    pickFromTheme(preferredTheme);
  const photoIdsAll = SYNTH_PHOTO_BANK[bucketKey].filter(
    (id) => !BANNED_STOCK_PHOTO_KEYS.has(`photo-${id}`),
  );
  // Prefer unseen IDs first. If the bucket is fully exhausted (every ID's
  // key already lives in the ledger), bail — the caller treats [] as
  // "no more matches" and shows the empty state.
  const photoIds = photoIdsAll.filter(
    (id) => !seenKeys.has(photoKey(`https://images.unsplash.com/photo-${id}`)),
  );
  if (photoIds.length === 0) return [];
  const out: SamplePhoto[] = [];
  for (let i = 0; i < count; i++) {
    const photoId = photoIds[Math.floor(Math.random() * photoIds.length)];
    const c = SYNTH_COUNTRY_POOL[Math.floor(Math.random() * SYNTH_COUNTRY_POOL.length)];
    const minutesAgo = Math.floor(Math.random() * 60 * 24 * 3); // up to 3 days ago
    // Tag the synthetic photo with bucket-appropriate tags ONLY. Never carry
    // the user's own tags onto an unrelated image — that caused the "Both
    // have …" chip to lie. We deliberately keep at most one overlap with
    // the user's tags so the score isn't dominated by recency, but only if
    // that overlap is actually plausible for this bucket.
    const bucketTags = BUCKET_TAG_POOL[bucketKey] ?? [bucketKey];
    const overlap = myTags.find((t) => bucketTags.includes(t));
    const shuffled = [...bucketTags].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));
    const synthTagsSet = new Set(picked);
    if (overlap) synthTagsSet.add(overlap);
    const synthTags = Array.from(synthTagsSet);
    out.push({
      id: `synth-${photoId}-${c.code}-${i}`,
      uri: unsplashPhotoUrl(photoId),
      country: c.country,
      countryCode: c.code,
      countryFlag: c.flag,
      captureCountryCode: c.code,
      theme: bucketKey,
      minutesAgo,
      tags: synthTags,
    });
  }
  return out;
}

// Tag library — what users can pick to describe their photo. Grouped so the
// camera screen can suggest the most relevant chips per theme.
export const TAG_LIBRARY: { id: string; emoji: string; label: string }[] = [
  { id: "coffee", emoji: "☕", label: "Coffee" },
  { id: "tea", emoji: "🍵", label: "Tea" },
  { id: "breakfast", emoji: "🥐", label: "Breakfast" },
  { id: "lunch", emoji: "🥪", label: "Lunch" },
  { id: "dinner", emoji: "🍽️", label: "Dinner" },
  { id: "snack", emoji: "🍪", label: "Snack" },
  { id: "drink", emoji: "🥤", label: "Drink" },
  { id: "meal", emoji: "🍽️", label: "Meal" },
  { id: "bread", emoji: "🥖", label: "Bread" },
  { id: "warm", emoji: "🔥", label: "Warm" },
  { id: "trees", emoji: "🌳", label: "Trees" },
  { id: "sunset", emoji: "🌅", label: "Sunset" },
  { id: "clouds", emoji: "☁️", label: "Clouds" },
  { id: "stars", emoji: "✨", label: "Stars" },
  { id: "night", emoji: "🌙", label: "Night" },
  { id: "mountains", emoji: "🏔️", label: "Mountains" },
  { id: "outdoors", emoji: "🌲", label: "Outdoors" },
  { id: "water", emoji: "🌊", label: "Water" },
  { id: "wildlife", emoji: "🦌", label: "Wildlife" },
  { id: "dog", emoji: "🐕", label: "Dog" },
  { id: "cat", emoji: "🐈", label: "Cat" },
  { id: "animal", emoji: "🐾", label: "Animal" },
  { id: "people", emoji: "👤", label: "People" },
  { id: "smile", emoji: "😊", label: "Smile" },
  { id: "celebration", emoji: "🎉", label: "Celebration" },
  { id: "art", emoji: "🎨", label: "Art" },
  { id: "desk", emoji: "🖥️", label: "Desk" },
  { id: "laptop", emoji: "💻", label: "Laptop" },
  { id: "transit", emoji: "🚇", label: "Transit" },
  { id: "city", emoji: "🏙️", label: "City" },
  // Expanded interest/hobby/lifestyle vocabulary
  { id: "dessert", emoji: "🍰", label: "Dessert" },
  { id: "cooking", emoji: "🍳", label: "Cooking" },
  { id: "baking", emoji: "🧁", label: "Baking" },
  { id: "cafe", emoji: "☕", label: "Cafe" },
  { id: "beach", emoji: "🏖️", label: "Beach" },
  { id: "snow", emoji: "❄️", label: "Snow" },
  { id: "plants", emoji: "🪴", label: "Plants" },
  { id: "flowers", emoji: "🌸", label: "Flowers" },
  { id: "garden", emoji: "🌱", label: "Garden" },
  { id: "family", emoji: "👨‍👩‍👧", label: "Family" },
  { id: "friends", emoji: "🫂", label: "Friends" },
  { id: "party", emoji: "🥳", label: "Party" },
  { id: "kids", emoji: "🧒", label: "Kids" },
  { id: "photography", emoji: "📸", label: "Photography" },
  { id: "music", emoji: "🎵", label: "Music" },
  { id: "reading", emoji: "📚", label: "Reading" },
  { id: "crafts", emoji: "🧶", label: "Crafts" },
  { id: "fashion", emoji: "👗", label: "Fashion" },
  { id: "fitness", emoji: "💪", label: "Fitness" },
  { id: "yoga", emoji: "🧘", label: "Yoga" },
  { id: "hiking", emoji: "🥾", label: "Hiking" },
  { id: "cycling", emoji: "🚴", label: "Cycling" },
  { id: "running", emoji: "🏃", label: "Running" },
  { id: "sports", emoji: "⚽", label: "Sports" },
  { id: "dancing", emoji: "💃", label: "Dancing" },
  { id: "gaming", emoji: "🎮", label: "Gaming" },
  { id: "travel", emoji: "✈️", label: "Travel" },
  { id: "home", emoji: "🏠", label: "Home" },
  { id: "vintage", emoji: "📻", label: "Vintage" },
  { id: "cozy", emoji: "🛋️", label: "Cozy" },
  { id: "work", emoji: "💻", label: "Work" },
  { id: "study", emoji: "📖", label: "Study" },
  { id: "hobby", emoji: "🧶", label: "Hobby" },
  { id: "play", emoji: "🎲", label: "Play" },
  { id: "bird", emoji: "🐦", label: "Bird" },
  // Self / shopping / chores vocabulary — added alongside the new
  // selfie / shopping / cafe / objects / chores daily-challenge themes.
  // Keep these IDs in lockstep with the server's ALLOWED_TAGS in
  // artifacts/api-server/src/routes/analyze.ts — the AI tagger only
  // emits tags from that list, so any new tag here must also exist
  // there or the AI will never auto-pick it.
  { id: "selfie", emoji: "🤳", label: "Selfie" },
  { id: "mirror", emoji: "🪞", label: "Mirror" },
  { id: "shopping", emoji: "🛍️", label: "Shopping" },
  { id: "grocery", emoji: "🛒", label: "Grocery" },
  { id: "parcel", emoji: "📦", label: "Parcel" },
  { id: "chores", emoji: "🧹", label: "Chores" },
  { id: "cleaning", emoji: "🧼", label: "Cleaning" },
  { id: "laundry", emoji: "👕", label: "Laundry" },
  // Common everyday moments — keep IDs in sync with api-server ALLOWED_TAGS.
  { id: "brunch", emoji: "🥞", label: "Brunch" },
  { id: "picnic", emoji: "🧺", label: "Picnic" },
  { id: "concert", emoji: "🎤", label: "Concert" },
  { id: "restaurant", emoji: "🍽️", label: "Restaurant" },
  { id: "birthday", emoji: "🎂", label: "Birthday" },
  { id: "wedding", emoji: "💒", label: "Wedding" },
  { id: "museum", emoji: "🏛️", label: "Museum" },
  { id: "park", emoji: "🌳", label: "Park" },
  { id: "lake", emoji: "🏞️", label: "Lake" },
  { id: "food", emoji: "🍕", label: "Food" },
  { id: "pets", emoji: "🐾", label: "Pets" },
  { id: "sunrise", emoji: "🌄", label: "Sunrise" },
  { id: "rain", emoji: "🌧️", label: "Rain" },
];

// Suggested tag IDs surfaced first per theme on the camera screen.
export const SUGGESTED_TAGS_BY_THEME: Record<string, string[]> = {
  morning: ["coffee", "tea", "breakfast", "drink", "sunset", "warm", "cozy"],
  food: ["meal", "lunch", "dinner", "snack", "bread", "drink", "coffee", "tea", "cooking", "baking", "dessert", "food"],
  hands: ["art", "people", "crafts"],
  sky: ["sunset", "clouds", "stars", "night", "trees"],
  commute: ["transit", "city", "travel"],
  work: ["laptop", "desk", "coffee", "study"],
  joy: ["smile", "celebration", "people", "party", "friends"],
  nature: ["trees", "mountains", "outdoors", "water", "sunset", "wildlife", "hiking"],
  pets: ["dog", "cat", "animal"],
  active: ["fitness", "yoga", "hiking", "cycling", "running", "sports"],
  creative: ["art", "music", "photography", "reading", "crafts", "fashion"],
  home: ["home", "plants", "flowers", "garden", "cozy", "vintage"],
  travel: ["travel", "beach", "mountains", "city", "outdoors"],
  furniture: ["home", "cozy", "vintage"],
  games: ["gaming", "play", "hobby", "friends"],
  hobbies: ["hobby", "music", "photography", "crafts", "reading"],
  birds: ["bird", "wildlife", "outdoors", "animal"],
  plants: ["plants", "flowers", "garden", "trees"],
  music: ["music", "vintage", "hobby", "cozy", "party"],
  passions: ["music", "fitness", "sports", "dancing", "running", "cycling", "party"],
  // Lifestyle themes — tag chips for camera when these challenges run.
  selfie: ["selfie", "mirror", "smile", "people", "fashion"],
  shopping: ["shopping", "grocery", "fashion", "parcel", "city"],
  cafe: ["cafe", "coffee", "tea", "drink", "meal", "breakfast", "brunch", "cozy"],
  objects: ["vintage", "art", "home", "crafts", "cozy"],
  chores: ["chores", "cleaning", "laundry", "home", "cozy"],
  shoes: ["shoes", "sneakers", "boots", "feet", "outdoors", "city"],
  coffee: ["coffee", "tea", "drink", "cafe", "warm", "breakfast"],
};

export {
  DAILY_CHALLENGES,
  THEME_ADJACENCY,
  resolveChallengeThemeId,
  getThemeChain,
  classifyThemeRelation,
  themeMatchPoints,
  isThemeOnTopic,
  shouldSinkOffTopic,
  stripThemePrefixes,
  themeExactMatchVariants,
  themeAdjacentIds,
} from "./themeMatch";

/**
 * Today's challenge — UTC-anchored so the entire world is on the same
 * theme at the same instant. Without this anchor, two users either side
 * of the dateline would briefly see different daily challenges and the
 * shared "we're all on this today" feeling would break. We compute days
 * since the Unix epoch (a fixed UTC reference) and modulo into the
 * rotation pool, so the theme rolls over at exactly 00:00 UTC each day
 * for everyone.
 */
export function getTodaysChallenge(): typeof DAILY_CHALLENGES[0] {
  const daysSinceEpochUTC = Math.floor(Date.now() / 86_400_000);
  return DAILY_CHALLENGES[daysSinceEpochUTC % DAILY_CHALLENGES.length];
}

// Dev-time guard: catches accidental re-introduction of duplicate sample
// photos before the bug ever ships. Compares by stable photoKey so two
// URIs differing only in query params (e.g. ?w=400 vs ?w=600) still
// collide. Throws on module load in dev — a release build with __DEV__
// false silently no-ops. (__DEV__ is provided by the React Native global
// types — no local re-declaration needed.)
if (typeof __DEV__ !== "undefined" && __DEV__) {
  const seen = new Map<string, string>();
  for (const p of SAMPLE_PHOTOS) {
    const k = photoKey(p.uri);
    const prior = seen.get(k);
    if (prior) {
      throw new Error(
        `[samplePhotos] Duplicate photoKey "${k}" — entries "${prior}" and "${p.id}" point at the same image.`,
      );
    }
    seen.set(k, p.id);
  }
}

export function getRandomPair(exclude?: string[]): [SamplePhoto, SamplePhoto] {
  const pool = exclude
    ? SAMPLE_PHOTOS.filter((p) => !exclude.includes(p.id))
    : SAMPLE_PHOTOS;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}
