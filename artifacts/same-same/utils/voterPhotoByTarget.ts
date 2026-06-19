import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Match } from "@/context/AppContext";
import { photoKey } from "@/utils/photoKey";

const KEY = "samesame_voter_photo_by_target";

type VoterPhotoMap = Record<string, string>;

let memMap: VoterPhotoMap | null = null;
let hydratePromise: Promise<VoterPhotoMap> | null = null;
let mapRevision = 0;

function normTargetId(id: string | undefined | null): string {
  return id?.trim() ?? "";
}

function bumpRevision(): void {
  mapRevision += 1;
}

/** Monotonic counter — bump after map writes so UI can re-enrich matches. */
export function getVoterPhotoMapRevision(): number {
  return mapRevision;
}

async function readMap(): Promise<VoterPhotoMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: VoterPhotoMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const tid = k.trim();
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
  bumpRevision();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

function writeMapEntry(
  map: VoterPhotoMap,
  theirPhotoId: string,
  myPhotoId: string,
  theirPhotoUri?: string,
): boolean {
  const pid = myPhotoId.trim();
  if (!pid) return false;
  let changed = false;
  const tid = normTargetId(theirPhotoId);
  if (tid && map[tid] !== pid) {
    map[tid] = pid;
    changed = true;
  }
  const pk = photoKey(theirPhotoUri ?? "");
  if (pk) {
    const pkKey = `pk:${pk}`;
    if (map[pkKey] !== pid) {
      map[pkKey] = pid;
      changed = true;
    }
  }
  return changed;
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

/** Sync lookup by backend target photo id (after hydrate). */
export function lookupVoterPhotoForTargetSync(
  theirPhotoId: string | undefined | null,
): string | null {
  const tid = normTargetId(theirPhotoId);
  if (!tid || !memMap) return null;
  return memMap[tid]?.trim() || null;
}

/** Sync lookup by target id and/or their photo uri (photoKey index). */
export function lookupVoterPhotoForMatchSync(
  match: Pick<Match, "theirPhotoId" | "theirPhoto">,
): string | null {
  const fromId = lookupVoterPhotoForTargetSync(match.theirPhotoId);
  if (fromId) return fromId;
  if (!memMap) return null;
  const pk = photoKey(match.theirPhoto);
  if (!pk) return null;
  return memMap[`pk:${pk}`]?.trim() || null;
}

/** Remember which voter photo was used for a target (survives restart). */
export async function rememberVoterPhotoForTarget(
  theirPhotoId: string,
  myPhotoId: string,
  theirPhotoUri?: string,
): Promise<void> {
  const tid = normTargetId(theirPhotoId);
  const pid = myPhotoId.trim();
  if (!pid || (!tid && !photoKey(theirPhotoUri ?? ""))) return;
  const map = memMap ?? (await readMap());
  if (!writeMapEntry(map, tid, pid, theirPhotoUri)) {
    memMap = map;
    return;
  }
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
    if (writeMapEntry(map, row.theirPhotoId ?? "", row.myPhotoId ?? "")) {
      changed = true;
    }
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
  bumpRevision();
}
