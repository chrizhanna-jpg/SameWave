import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "samesame_voter_photo_by_target";

type VoterPhotoMap = Record<string, string>;

let memMap: VoterPhotoMap | null = null;
let hydratePromise: Promise<VoterPhotoMap> | null = null;

function normTargetId(id: string | undefined | null): string {
  return id?.trim() ?? "";
}

async function readMap(): Promise<VoterPhotoMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: VoterPhotoMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const tid = normTargetId(k);
      const pid = typeof v === "string" ? v.trim() : "";
      if (tid && pid) out[tid] = pid;
    }
    return out;
  } catch {
    return {};
  }
}

async function persistMap(map: VoterPhotoMap): Promise<void> {
  memMap = map;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

/** Load map into memory — call once during app hydrate. */
export async function hydrateVoterPhotoMap(): Promise<void> {
  if (memMap) return;
  if (!hydratePromise) {
    hydratePromise = readMap().then((m) => {
      memMap = m;
      return m;
    });
  }
  await hydratePromise;
}

/** Sync lookup after hydrate (for enrich during render). */
export function lookupVoterPhotoForTargetSync(
  theirPhotoId: string | undefined | null,
): string | null {
  const tid = normTargetId(theirPhotoId);
  if (!tid || !memMap) return null;
  return memMap[tid]?.trim() || null;
}

/** Remember which voter photo was used for a target photo id (survives restart). */
export async function rememberVoterPhotoForTarget(
  theirPhotoId: string,
  myPhotoId: string,
): Promise<void> {
  const tid = normTargetId(theirPhotoId);
  const pid = myPhotoId.trim();
  if (!tid || !pid) return;
  const map = memMap ?? (await readMap());
  if (map[tid] === pid) {
    memMap = map;
    return;
  }
  map[tid] = pid;
  await persistMap(map);
}

/** Bulk import from cloud journey rows. */
export async function importVoterPhotosFromJourney(
  rows: Array<{ theirPhotoId?: string | null; myPhotoId?: string | null }>,
): Promise<void> {
  if (rows.length === 0) return;
  const map = memMap ?? (await readMap());
  let changed = false;
  for (const row of rows) {
    const tid = normTargetId(row.theirPhotoId);
    const pid = row.myPhotoId?.trim() ?? "";
    if (!tid || !pid || map[tid] === pid) continue;
    map[tid] = pid;
    changed = true;
  }
  if (!changed) {
    memMap = map;
    return;
  }
  await persistMap(map);
}

/** Dev / tests — reset in-memory view after import. */
export function setVoterPhotoMapForTests(map: VoterPhotoMap): void {
  memMap = map;
}
