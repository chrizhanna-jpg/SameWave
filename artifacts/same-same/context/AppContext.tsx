import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  fetchEchoesInbox,
  fetchEchoesMine,
  fetchSeenPhotoIds,
  respondEcho as respondEchoApi,
  unvotePhoto,
  type ServerEcho,
} from "@/utils/api";
import { photoKey } from "@/utils/photoKey";

export interface MatchedCountry {
  code: string;
  name: string;
  flag: string;
  matchedAt: string;
}

export interface MyPhoto {
  uri: string;
  uploadedAt: string;
  theme: string;
  tags?: string[];
  /**
   * Free-form concrete subjects (apple, sculpture, latte art…)
   * returned by Gemini at upload time. Cached on-device so the match
   * screen can pass them into /candidates as the `subjects=` query
   * param — that's what unlocks the heaviest subject-overlap scoring
   * axis (3 pts × min(overlap, 5) = 0..15). Optional for backwards
   * compatibility with photos uploaded before the column existed.
   */
  subjects?: string[];
  /**
   * Marked true when the photo failed our EXIF authenticity check
   * (no camera metadata, AI software signature, etc). AI photos are
   * shown with an "AI" badge and excluded from echo connections.
   */
  isAI?: boolean;
  /**
   * Backend ID returned from the photos upload API once the photo lands
   * on the server. Needed when this photo participates in an echo offer
   * (the vote endpoint pairs the candidate photo with this ID). Absent
   * for AI photos (never uploaded) or while an upload is still in flight.
   */
  backendId?: string;
  /**
   * Tracks the upload to the server so the match screen can distinguish
   * "still uploading" from "upload failed" — before this field, both
   * looked identical (no backendId), and a silent failure left the user
   * stuck with a perpetual "still uploading" message and no way to know
   * the post never reached the server. Only set for real (non-AI) user
   * uploads:
   *   • "pending" — POST /photos in flight, no response yet
   *   • "ok"      — POST /photos returned an id (also implies backendId)
   *   • "failed"  — POST /photos errored or returned a malformed body
   * Optional for backwards-compat with photos persisted by older builds
   * before this field existed.
   */
  uploadState?: "pending" | "ok" | "failed";
  /**
   * Music vibe for this photo (e.g. "classic", "rock"). Picked at upload
   * time — AI suggests, the user can swap. Lives on the photo so the
   * matching client knows which clip to play when this photo is in the
   * deck. Optional for backwards compatibility with photos uploaded
   * before the feature shipped.
   */
  musicGenre?: string;
  /**
   * Local `data:` URL for a user-recorded vibe clip. When present, the
   * match feed will play this in place of the music_genre clip. Stored
   * on-device so the uploader can preview it from "My photos" without
   * a round-trip to the server.
   */
  customAudioUrl?: string;
}

// Module-scoped registry of URIs flagged as AI. Kept in sync with the
// `myPhotos` slice so any PhotoCard rendering one of these URIs can show
// the AI badge without prop drilling. Sample photos use the same pattern.
const AI_PHOTO_URIS: Set<string> = new Set();
export function isAiPhoto(uri: string): boolean {
  return AI_PHOTO_URIS.has(uri);
}

export interface Match {
  id: string;
  myPhoto: string;
  myPhotoUploadedAt?: string;
  theirPhoto: string;
  // Backend (DB) ID of the matched photo, when known. Persisted on
  // every match created from a live discovery candidate so that later
  // undo / flip actions can call the server to withdraw the original
  // vote and cascade-cancel any wave it produced. Older matches that
  // predate this field stay client-side only.
  theirPhotoId?: string;
  myCountry: string;
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode: string;
  similarityScore: number;
  verdict: "same" | "different" | null;
  timestamp: string;
  theme?: string;
  theirPhotoMinutesAgo?: number;
  sharedTags?: string[];
  // Broader "vibe" of the matched user (their photo's tags expanded with a
  // couple of lifestyle/hobby tags) — used to surface similar interests
  // beyond the single photo subject.
  theirVibe?: string[];
  // Music info captured from the matched photo at swipe time so the
  // reveal screen can replay the exact clip the user heard on the card.
  theirMusicGenre?: string;
  theirCustomAudioUrl?: string;
  // Pre-resolved clip URL for the matched photo, snapshotted at swipe
  // time. The reveal screen plays this directly so the audio singleton
  // dedups on the byte-identical URL the Match screen was already
  // playing — guarantees the music does NOT skip when the user taps
  // Open or Share. Older persisted matches from before this field
  // existed fall back to recomputing from the genre/theme/tags.
  theirMusicUrl?: string;
  // Photo's own theme/tags (distinct from the user's active challenge
  // theme stored in `theme` above). Saved here so legacy matches that
  // lack `theirMusicUrl` can still recompute the same URL the Match
  // screen used, instead of guessing with empty tags.
  theirActualTheme?: string;
  theirTags?: string[];
  // How many other people also said "same same" to the matched photo,
  // bucketed by time. Populated asynchronously after a "same" verdict.
  // Used by the reveal screen and discovery feed to show social weight.
  matchStats?: {
    sameLastHour: number;
    sameLastDay: number;
    sameAllTime: number;
  };
}

export interface ConnectRequest {
  id: string;
  matchId: string;
  direction: "outgoing" | "incoming";
  status: "pending" | "accepted" | "declined" | "expired";
  myPlatform?: string;
  myHandle?: string;
  theirPlatform?: string;
  theirHandle?: string;
  createdAt: string;
  respondedAt?: string;
  expiresAt: string;
  // Snapshot of match context (so requests still render if match removed)
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode: string;
  theirPhoto: string;
  myPhoto: string;
  theme?: string;
  // Has the user already opened/viewed this request? (for unread badge)
  seen: boolean;
}

/**
 * An echo — a pair of photos two strangers both swiped same-same on.
 * The shape mirrors the server response and is framed from the requesting
 * user's perspective (`mine` is always one of my photos, `theirs` is
 * always the stranger's).
 *
 * "pending" → the other side tapped first; I haven't responded yet. This
 *             is what surfaces in the inbox.
 * "mutual"  → both sides have tapped same-same. Real echo.
 */
export type EchoState = "pending" | "mutual";

export interface PhotoSide {
  id: string;
  uri: string;
  countryCode: string | null;
  country: string;
  countryFlag: string;
}

export interface EchoCard {
  id: string;
  state: EchoState;
  theme: string;
  createdAt: string;
  mutualAt: string | null;
  mine: PhotoSide;
  theirs: PhotoSide;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  earnedAt?: string;
}

interface AppState {
  matchedCountries: MatchedCountry[];
  matches: Match[];
  streakCount: number;
  totalMatches: number;
  badges: Badge[];
  myPhotos: MyPhoto[];
  onboardingComplete: boolean;
  /**
   * Cold-start counter, bumped once per process load inside `loadState`.
   * Used by `app/index.tsx` to redirect new users to the tutorial on
   * their first few app opens (currently the first 3) so the brand
   * + flow has a chance to land before they're dropped on the home
   * tab. Existing users who had already finished onboarding before
   * this counter existed are seeded above the threshold so they do
   * not regress into seeing the tutorial again.
   */
  appOpenCount: number;
  proUnlocked: boolean;
  connectRequests: ConnectRequest[];
  /** Pending offers waiting on me to respond (other side tapped first). */
  pendingEchoes: EchoCard[];
  /** Mutual echoes I'm involved in (both sides tapped). */
  mutualEchoes: EchoCard[];
  /** ISO timestamp of the last time the user opened the echoes inbox. */
  echoesSeenAt?: string;
  myDefaultPlatform?: string; // remembered preference
  myDefaultHandle?: string;
  // User's "home" country — drives the Same Country / Same Continent
  // celebrations and labels the user side of every match record.
  myCountryCode?: string;
  myCountryName?: string;
  myCountryFlag?: string;
  /**
   * Single source of truth for "photos the user has already reacted to in
   * Match". Stored as photoKey() output (stable across query strings, etc.)
   * so the same image never reappears even if its URI shape changes
   * between sessions. Persisted alongside `matches` and backfilled from
   * existing match history on first load after the dedup revamp.
   */
  seenPhotoKeys: string[];
  /**
   * Parallel ledger of backend photo IDs the user has been shown. Sent as
   * an `excludeIds` filter on every /candidates fetch so the same photo
   * cannot resurface even when a fire-and-forget `markPhotosSeen` POST
   * drops on a flaky network (the previous failure mode). Append-only,
   * deduped on insert; the swipe screen only forwards the most recent
   * slice so the URL stays under typical proxy limits.
   */
  seenPhotoIds: string[];
}

interface AppContextValue extends AppState {
  /** Top interest tags derived from the user's posted photos. */
  myVibe: string[];
  addMatch: (match: Match) => void;
  removeMatch: (id: string) => void;
  /**
   * Flip a recorded swipe between "same" and "different". Recomputes
   * countries / streak / badges so the journey stats stay accurate.
   * Returns the updated match (with any newly-earned badges) or null.
   */
  changeVerdict: (id: string, newVerdict: "same" | "different") => Match | null;
  setMyCountry: (code: string, name: string, flag: string) => void;
  addMyPhoto: (
    uri: string,
    theme: string,
    tags?: string[],
    isAI?: boolean,
    musicGenre?: string,
    customAudioUrl?: string,
    /**
     * Free-form concrete subjects from Gemini at upload time. Threaded
     * straight into the `MyPhoto` record so the match screen can pass
     * them into /candidates as the `subjects=` query param. Defaults
     * to empty when callers (e.g. legacy paths) don't have them.
     */
    subjects?: string[],
  ) => void;
  /**
   * Patch a previously-added local photo with the backend ID returned by
   * the upload API. Called from the camera screen once the network round
   * trip completes; safe to call before or after the photo is consumed
   * by the swipe deck.
   *
   * Optional `subjects` arg patches the local photo's free-form subjects
   * with the upload-time analysis result (the authoritative one — it's
   * what got persisted on the row /candidates ranks against). Empty /
   * missing arrays no-op so a transient upload-time analyze failure
   * doesn't wipe out the pre-upload subjects we already had locally.
   */
  setMyPhotoBackendId: (
    uri: string,
    backendId: string,
    subjects?: string[],
  ) => void;
  /**
   * Update the in-flight upload state of a local photo. Called by the
   * camera screen when POST /photos errors or returns a malformed body
   * so the match screen can surface an actionable "upload failed" state
   * instead of pretending the upload is still in flight forever.
   */
  setMyPhotoUploadState: (
    uri: string,
    state: NonNullable<MyPhoto["uploadState"]>,
  ) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  unlockPro: () => void;
  setProUnlocked: (value: boolean) => void;
  getWorldMapCoverage: () => number;
  // Connect requests
  sendConnectRequest: (matchId: string, platform: string, handle: string) => ConnectRequest | null;
  respondConnectRequest: (
    id: string,
    accept: boolean,
    platform?: string,
    handle?: string,
  ) => void;
  markRequestSeen: (id: string) => void;
  unreadIncoming: number;
  pendingOutgoing: number;
  hasOutgoingForMatch: (matchId: string) => boolean;
  // ── Echoes (server-backed reciprocation loop) ──────────────────────
  /** Mark every visible inbox item as seen (clears the unread bell). */
  markAllEchoesSeen: () => void;
  unreadEchoes: number;
  /** Fetch fresh inbox + mutual lists from the server. Safe to call often. */
  refreshEchoes: () => Promise<void>;
  /**
   * Respond to a pending offer. "same" promotes it to mutual; "different"
   * deletes it. Optimistically updates local state and reconciles with
   * the server response.
   */
  respondToEcho: (id: string, verdict: "same" | "different") => Promise<"mutual" | "declined" | "error">;
  // ── Match dedup ledger ─────────────────────────────────────────────
  /**
   * Mark a photo (by stable photoKey) as seen by the user. Idempotent.
   * When `backendId` is provided we also append it to `seenPhotoIds`
   * so the next /candidates fetch can hard-exclude it server-side.
   */
  markPhotoSeen: (key: string, backendId?: string) => void;
  /** Has the user already reacted to / been shown this photo? */
  hasSeenPhoto: (key: string) => boolean;
  /** DEV ONLY — clears the seen ledger. Used by the on-device debug pill. */
  resetSeenPhotos: () => void;
  /**
   * Given a batch of (id, uri) candidate pairs, mark any whose backend ID
   * is in the server-side seen set as locally seen too. This is how the
   * on-device ledger gets primed from the server after a fresh install:
   * the seen IDs themselves arrive on launch, but we only learn the URIs
   * (needed by photoKey-based dedup) when candidate fetches come back.
   */
  primeSeenFromCandidates: (items: { id: string; uri: string }[]) => void;
  // ── Echo flash celebration (transient overlay) ─────────────────────
  /**
   * The next echo to celebrate with the full-screen EchoFlash overlay.
   * Set automatically when an offer is accepted, or when the polling
   * refresh detects a new mutual echo on this side. Cleared by
   * `dismissFlashEcho`.
   */
  pendingFlashEcho: EchoCard | null;
  /** Hide the celebration overlay. */
  dismissFlashEcho: () => void;
  /**
   * True once the persistent AsyncStorage state has been read into memory
   * (whether or not anything was found). Consumers that pick a candidate
   * before hydration completes (e.g. the swipe deck's initial card) can
   * use this signal to re-evaluate against the now-hydrated seen-photo
   * ledger and replace stale picks from previous sessions.
   */
  hasHydrated: boolean;
}

const defaultBadges: Badge[] = [
  { id: "explorer", name: "Global Explorer", description: "Match with 5 countries", earned: false },
  { id: "connector", name: "World Connector", description: "Match with 10 countries", earned: false },
  { id: "sameday", name: "Same Day", description: "Match with someone within 24 hours", earned: false },
  { id: "streak5", name: "5-Day Streak", description: "Match 5 days in a row", earned: false },
  { id: "asia", name: "Asia Bound", description: "Match with an Asian country", earned: false },
  { id: "africa", name: "Africa Bound", description: "Match with an African country", earned: false },
  { id: "americas", name: "Americas Connected", description: "Match with North or South America", earned: false },
];

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    matchedCountries: [],
    matches: [],
    streakCount: 0,
    totalMatches: 0,
    badges: defaultBadges,
    myPhotos: [],
    onboardingComplete: false,
    appOpenCount: 0,
    proUnlocked: false,
    connectRequests: [],
    pendingEchoes: [],
    mutualEchoes: [],
    seenPhotoKeys: [],
    seenPhotoIds: [],
  });
  // Mutable ref so simulated-response timeouts can read latest state
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Echo flash celebration overlay state. Lives outside the persisted
  // AppState so it doesn't survive a cold start (otherwise the user
  // would see the same celebration again on every relaunch).
  const [pendingFlashEcho, setPendingFlashEcho] = useState<EchoCard | null>(
    null,
  );
  // FIFO of newly-mutual echoes that arrived while another celebration
  // was already on screen. We pop one off whenever the current overlay
  // dismisses so back-to-back mutuals never get silently dropped.
  const flashQueueRef = useRef<EchoCard[]>([]);
  // Set of mutual-echo IDs we've already enqueued (queued or shown)
  // in this app session. The very first refresh after launch seeds
  // this with whatever mutuals already exist on the server, so we
  // never celebrate something the user has had for days. After that,
  // any new ID showing up in the mutual list gets enqueued.
  const flashEnqueuedRef = useRef<Set<string>>(new Set());
  const flashSeededRef = useRef(false);
  // Enqueue a freshly-mutual echo. If nothing is on screen, show it
  // immediately; otherwise tuck it into the FIFO and let the dismiss
  // handler drain it.
  const enqueueFlashEcho = useCallback((echo: EchoCard) => {
    if (flashEnqueuedRef.current.has(echo.id)) return;
    flashEnqueuedRef.current.add(echo.id);
    setPendingFlashEcho((cur) => {
      if (cur) {
        flashQueueRef.current.push(echo);
        return cur;
      }
      return echo;
    });
  }, []);
  const dismissFlashEcho = useCallback(() => {
    const next = flashQueueRef.current.shift() ?? null;
    setPendingFlashEcho(next);
  }, []);

  // Becomes true once `loadState` completes, regardless of whether
  // anything was found in AsyncStorage. Consumers (notably the swipe
  // deck) use this to know that `seenPhotoKeys` and friends now reflect
  // the full persisted ledger and any pre-hydration picks should be
  // re-evaluated.
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    loadState().finally(() => setHasHydrated(true));
  }, []);

  // Server-side mirror of the seen ledger. We learn IDs on launch (the
  // server tracks per-user seen photos), but local dedup is keyed by
  // photoKey(uri) — so we hold onto the IDs and translate to URIs as
  // candidate fetches come back. See `primeSeenFromCandidates` below.
  const serverSeenIdsRef = useRef<Set<string>>(new Set());
  // Most recent (id, uri) batch seen by `primeSeenFromCandidates`. Cached
  // so that if the candidates fetch wins the race against
  // `fetchSeenPhotoIds`, we can re-prime once the IDs arrive instead of
  // waiting for the next candidate refetch.
  const lastCandidateBatchRef = useRef<{ id: string; uri: string }[]>([]);
  // Lazily-set once the prime function exists (defined below). A ref
  // sidesteps the ordering problem between this effect and the callback.
  const primeRef = useRef<((items: { id: string; uri: string }[]) => void) | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    fetchSeenPhotoIds()
      .then((ids) => {
        if (cancelled) return;
        serverSeenIdsRef.current = new Set(ids);
        // Merge the server-side seen IDs into the local persisted ledger
        // so the very next /candidates fetch can hard-exclude them too.
        // Critical for fresh installs / second devices where the local
        // ledger is empty but the server already knows what this user
        // has been shown.
        if (ids.length > 0) {
          setState((prev) => {
            const have = new Set(prev.seenPhotoIds);
            const fresh = ids.filter((id) => !have.has(id));
            if (fresh.length === 0) return prev;
            const newState: AppState = {
              ...prev,
              seenPhotoIds: [...prev.seenPhotoIds, ...fresh],
            };
            saveState(newState);
            return newState;
          });
        }
        // If candidates already arrived before we knew the seen IDs,
        // prime against the cached batch now.
        if (lastCandidateBatchRef.current.length > 0 && primeRef.current) {
          primeRef.current(lastCandidateBatchRef.current);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the AI URI registry in sync with myPhotos so PhotoCard can flag
  // them anywhere they render — same pattern as the sample-photo registry.
  useEffect(() => {
    AI_PHOTO_URIS.clear();
    for (const p of state.myPhotos) {
      if (p.isAI) AI_PHOTO_URIS.add(p.uri);
    }
  }, [state.myPhotos]);

  const loadState = async () => {
    try {
      const stored = await AsyncStorage.getItem("samesame_state");
      if (!stored) {
        // First-ever launch — no persisted state. We still have to bump
        // the app-open counter or the tutorial gate in `app/index.tsx`
        // would treat opens 0, 1, 2 as "first three cold starts" and
        // show the tutorial three times instead of the intended two.
        // Persist immediately so even an instant kill-and-relaunch
        // counts as an opened session.
        const fresh = { appOpenCount: 1 };
        AsyncStorage.setItem("samesame_state", JSON.stringify(fresh)).catch(() => {});
        setState((prev) => ({ ...prev, appOpenCount: 1 }));
        return;
      }
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate old myPhotos formats to current MyPhoto[]
        const migratedPhotos: MyPhoto[] = (parsed.myPhotos || []).map(
          (p: string | Partial<MyPhoto>) => {
            if (typeof p === "string") {
              return {
                uri: p,
                uploadedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                theme: "joy",
              };
            }
            return {
              uri: p.uri ?? "",
              uploadedAt: p.uploadedAt ?? new Date().toISOString(),
              theme: p.theme ?? "joy",
              tags: p.tags ?? [],
              // Preserve subjects across restarts so the match screen
              // can keep passing them into /candidates after a cold
              // start. Defaults to [] for photos persisted before the
              // field existed — those still match on theme/vibe/shape
              // and the next fresh upload will populate the field.
              subjects: Array.isArray(p.subjects) ? p.subjects : [],
              isAI: p.isAI ?? false,
              // Preserve the backend ID across restarts so votes from
              // already-uploaded photos still create echo offers.
              backendId:
                typeof p.backendId === "string" && p.backendId.length > 0
                  ? p.backendId
                  : undefined,
              // Faithfully restore uploadState: a persisted backendId
              // means the upload succeeded in a prior session, so the
              // match screen should treat it as "ok" (not "still
              // uploading"). Without this rehydration step, a cold
              // start would leave a successfully-uploaded photo with
              // uploadState=undefined, falling back to the "pending"
              // copy on the match screen even though there's a
              // backendId attached. AI photos and legacy rows missing
              // both fields stay undefined.
              uploadState:
                typeof p.backendId === "string" && p.backendId.length > 0
                  ? ("ok" as const)
                  : p.uploadState === "pending" ||
                      p.uploadState === "ok" ||
                      p.uploadState === "failed"
                    ? p.uploadState
                    : undefined,
            };
          }
        );
        // Expire any pending requests whose 48h window has passed.
        const now = Date.now();
        const migratedRequests: ConnectRequest[] = (parsed.connectRequests ?? [])
          .map((r: ConnectRequest) => {
            if (r.status === "pending" && new Date(r.expiresAt).getTime() < now) {
              return { ...r, status: "expired" as const };
            }
            return r;
          });
        // Backfill the seen-photo ledger so existing users don't regress
        // after this update. We union any persisted ledger with every
        // photo that already lives in their match history.
        const persistedKeys: string[] = Array.isArray(parsed.seenPhotoKeys)
          ? parsed.seenPhotoKeys.filter((k: unknown) => typeof k === "string" && k.length > 0)
          : [];
        const matchKeys = (parsed.matches ?? [])
          .map((m: Match) => photoKey(m?.theirPhoto))
          .filter((k: string) => k.length > 0);
        const seenPhotoKeys = Array.from(new Set([...persistedKeys, ...matchKeys]));
        const persistedIds: string[] = Array.isArray(parsed.seenPhotoIds)
          ? parsed.seenPhotoIds.filter(
              (id: unknown) => typeof id === "string" && id.length > 0,
            )
          : [];
        const seenPhotoIds = Array.from(new Set(persistedIds));
        // App-open counter — bumped once per cold start. Drives the
        // "show the tutorial on the first N opens" routing in
        // `app/index.tsx`. For users who had already completed
        // onboarding before this counter existed, seed above the
        // threshold so they don't regress into the tutorial.
        const priorOpenCount =
          typeof parsed.appOpenCount === "number"
            ? parsed.appOpenCount
            : parsed.onboardingComplete
              ? 999
              : 0;
        const nextOpenCount = priorOpenCount + 1;
        // Persist the bumped count immediately so it survives a quick
        // app close before any other state mutation triggers a save —
        // otherwise the user could see the tutorial more than the
        // intended N times if they kill the app fast.
        AsyncStorage.setItem(
          "samesame_state",
          JSON.stringify({ ...parsed, appOpenCount: nextOpenCount }),
        ).catch(() => {});
        setState((prev) => ({
          ...prev,
          ...parsed,
          appOpenCount: nextOpenCount,
          myPhotos: migratedPhotos,
          connectRequests: migratedRequests,
          // Echoes always come from the server now — drop any legacy
          // locally-simulated entries from older app versions.
          pendingEchoes: [],
          mutualEchoes: [],
          echoesSeenAt: typeof parsed.echoesSeenAt === "string" ? parsed.echoesSeenAt : undefined,
          badges: defaultBadges.map((b) => {
            const stored = parsed.badges?.find((sb: Badge) => sb.id === b.id);
            return stored ? { ...b, ...stored } : b;
          }),
          // Merge (don't overwrite) the seen ledgers with whatever's
          // already in `prev` — the server-seen-IDs effect and any
          // early `markPhotoSeen` calls may have written entries here
          // before this AsyncStorage read resolved. Overwriting them
          // would silently drop the very IDs we need to keep dedup
          // honest.
          seenPhotoKeys: Array.from(
            new Set([...seenPhotoKeys, ...prev.seenPhotoKeys]),
          ),
          seenPhotoIds: Array.from(
            new Set([...seenPhotoIds, ...prev.seenPhotoIds]),
          ),
        }));
      }
    } catch {}
  };

  const saveState = async (newState: AppState) => {
    try {
      await AsyncStorage.setItem("samesame_state", JSON.stringify(newState));
    } catch {}
  };

  // Pure helper: compute country list + badges given the set of all
  // CONFIRMED ("same") matches. Used by addMatch / removeMatch /
  // changeVerdict so journey stats always reflect the current state.
  const recomputeFromConfirmed = (
    confirmed: Match[],
    existingBadges: Badge[],
  ): { matchedCountries: MatchedCountry[]; badges: Badge[] } => {
    const byCode = new Map<string, MatchedCountry>();
    for (const m of confirmed) {
      if (!byCode.has(m.theirCountryCode)) {
        byCode.set(m.theirCountryCode, {
          code: m.theirCountryCode,
          name: m.theirCountry,
          flag: m.theirCountryFlag,
          matchedAt: m.timestamp,
        });
      }
    }
    const matchedCountries = [...byCode.values()];
    const codes = matchedCountries.map((c) => c.code);
    const sameDayEarned = confirmed.some((m) => {
      const myAgeMin = m.myPhotoUploadedAt
        ? (Date.now() - new Date(m.myPhotoUploadedAt).getTime()) / 60000
        : 9999;
      const theirAgeMin = m.theirPhotoMinutesAgo ?? 9999;
      return myAgeMin < 1440 && theirAgeMin < 1440;
    });
    // Earned badges stick — we never take them away on undo.
    const badges = existingBadges.map((b) => {
      if (b.earned) return b;
      const justEarnedAt = new Date().toISOString();
      if (b.id === "explorer" && matchedCountries.length >= 5)
        return { ...b, earned: true, earnedAt: justEarnedAt };
      if (b.id === "connector" && matchedCountries.length >= 10)
        return { ...b, earned: true, earnedAt: justEarnedAt };
      if (b.id === "sameday" && sameDayEarned)
        return { ...b, earned: true, earnedAt: justEarnedAt };
      if (b.id === "asia" && codes.some(isAsian))
        return { ...b, earned: true, earnedAt: justEarnedAt };
      if (b.id === "africa" && codes.some(isAfrican))
        return { ...b, earned: true, earnedAt: justEarnedAt };
      if (b.id === "americas" && codes.some(isAmericas))
        return { ...b, earned: true, earnedAt: justEarnedAt };
      return b;
    });
    return { matchedCountries, badges };
  };

  const addMatch = useCallback((match: Match) => {
    setState((prev) => {
      const allMatches = [match, ...prev.matches];
      const confirmed = allMatches.filter((m) => m.verdict === "same");
      const { matchedCountries, badges } = recomputeFromConfirmed(
        confirmed,
        prev.badges,
      );
      // Add the matched photo to the seen ledger. Idempotent.
      const k = photoKey(match.theirPhoto);
      const seenPhotoKeys =
        k && !prev.seenPhotoKeys.includes(k)
          ? [...prev.seenPhotoKeys, k]
          : prev.seenPhotoKeys;
      const newState: AppState = {
        ...prev,
        matchedCountries,
        matches: allMatches,
        totalMatches: confirmed.length,
        streakCount:
          match.verdict === "same"
            ? prev.streakCount + 1
            : prev.streakCount,
        badges,
        seenPhotoKeys,
      };
      saveState(newState);
      return newState;
    });
  }, []);

  // ── Match dedup ledger helpers ──────────────────────────────────────
  const seenSet = React.useMemo(
    () => new Set(state.seenPhotoKeys),
    [state.seenPhotoKeys],
  );
  const seenSetRef = useRef(seenSet);
  seenSetRef.current = seenSet;

  // Mirror of seenPhotoIds for the synchronous guard inside markPhotoSeen.
  // Read-only; updates land via setState below.
  const seenIdSetRef = useRef<Set<string>>(new Set(state.seenPhotoIds));
  useEffect(() => {
    seenIdSetRef.current = new Set(state.seenPhotoIds);
  }, [state.seenPhotoIds]);

  const markPhotoSeen = useCallback((key: string, backendId?: string) => {
    if (!key) return;
    // Cheap synchronous guards — avoid a setState (and re-render) when both
    // ledgers already contain this photo, which is the common case (every
    // re-render of the swipe card would otherwise re-mark its photo).
    const keyAlreadySeen = seenSetRef.current.has(key);
    const idAlreadySeen =
      !backendId || seenIdSetRef.current.has(backendId);
    if (keyAlreadySeen && idAlreadySeen) return;
    setState((prev) => {
      const keyChanged = !prev.seenPhotoKeys.includes(key);
      const idChanged =
        !!backendId && !prev.seenPhotoIds.includes(backendId);
      if (!keyChanged && !idChanged) return prev;
      const newState: AppState = {
        ...prev,
        seenPhotoKeys: keyChanged
          ? [...prev.seenPhotoKeys, key]
          : prev.seenPhotoKeys,
        seenPhotoIds: idChanged
          ? [...prev.seenPhotoIds, backendId!]
          : prev.seenPhotoIds,
      };
      saveState(newState);
      return newState;
    });
  }, []);

  const hasSeenPhoto = useCallback((key: string) => {
    return key ? seenSet.has(key) : false;
  }, [seenSet]);

  const primeSeenFromCandidates = useCallback(
    (items: { id: string; uri: string }[]) => {
      if (!items || items.length === 0) return;
      // Cache so we can re-prime once `fetchSeenPhotoIds` resolves if the
      // candidate fetch happened to win the race.
      lastCandidateBatchRef.current = items;
      const serverIds = serverSeenIdsRef.current;
      if (serverIds.size === 0) return;
      const known = seenSetRef.current;
      const newKeys: string[] = [];
      for (const it of items) {
        if (!it?.id || !serverIds.has(it.id)) continue;
        const k = photoKey(it.uri);
        if (!k || known.has(k)) continue;
        if (newKeys.includes(k)) continue;
        newKeys.push(k);
      }
      if (newKeys.length === 0) return;
      setState((prev) => {
        const fresh = newKeys.filter((k) => !prev.seenPhotoKeys.includes(k));
        if (fresh.length === 0) return prev;
        const newState: AppState = {
          ...prev,
          seenPhotoKeys: [...prev.seenPhotoKeys, ...fresh],
        };
        saveState(newState);
        return newState;
      });
    },
    [],
  );
  // Keep the ref pointing at the latest callback so the on-launch
  // `fetchSeenPhotoIds` effect can invoke it without taking the function
  // as a dependency (which would re-fire the fetch).
  primeRef.current = primeSeenFromCandidates;

  const resetSeenPhotos = useCallback(() => {
    if (!__DEV__) return;
    setState((prev) => {
      const newState: AppState = {
        ...prev,
        seenPhotoKeys: [],
        seenPhotoIds: [],
      };
      saveState(newState);
      return newState;
    });
  }, []);

  // Forward declaration: removeMatch / changeVerdict need to call
  // refreshEchoes after a server-side unvote to keep the My Journey /
  // inbox lists in sync with the cascaded wave deletion. refreshEchoes
  // is defined further down (it depends on a lot of derived state),
  // so we route through a ref that's filled in by an effect below.
  const refreshEchoesRef = useRef<(() => Promise<void>) | null>(null);

  const removeMatch = useCallback((id: string) => {
    // Snapshot the target match BEFORE calling setState. React 18's
    // concurrent renderer is allowed to invoke updater functions more
    // than once for the same logical state transition, so deriving
    // the side-effect (server unvote) inside setState risked firing
    // it 0, 1, or 2 times. stateRef tracks the latest committed state
    // synchronously and is the safe source of truth for one-shot
    // side effects like this.
    const target = stateRef.current.matches.find((m) => m.id === id);
    setState((prev) => {
      const stillThere = prev.matches.find((m) => m.id === id);
      if (!stillThere) return prev;

      const remainingMatches = prev.matches.filter((m) => m.id !== id);
      const confirmed = remainingMatches.filter((m) => m.verdict === "same");
      const { matchedCountries } = recomputeFromConfirmed(confirmed, prev.badges);

      // Note: we intentionally keep earned badges. Undoing a single match
      // shouldn't take an achievement away — and re-earning is trivial.
      const wasConfirmed = stillThere.verdict === "same";
      const newState: AppState = {
        ...prev,
        matches: remainingMatches,
        matchedCountries,
        totalMatches: confirmed.length,
        streakCount: wasConfirmed
          ? Math.max(0, prev.streakCount - 1)
          : prev.streakCount,
      };
      saveState(newState);
      return newState;
    });
    // Only "same" verdicts can have produced a server-side echo /
    // wave. If the match also has a known backend photo ID, fire a
    // server unvote so the wave dissolves. Local state already
    // reflects the removal — a server failure simply leaves the
    // backend out of sync until the next interaction.
    if (target && target.verdict === "same" && target.theirPhotoId) {
      const { theirPhotoId } = target;
      void unvotePhoto(theirPhotoId).then((ok) => {
        if (ok) refreshEchoesRef.current?.();
      });
    }
  }, []);

  const changeVerdict = useCallback(
    (id: string, newVerdict: "same" | "different"): Match | null => {
      // Snapshot pre-flip target from stateRef (see removeMatch comment
      // above for why we don't read it inside the setState updater).
      const previous = stateRef.current.matches.find((m) => m.id === id);
      if (!previous || previous.verdict === newVerdict) return previous ?? null;

      const flipped: Match = {
        ...previous,
        verdict: newVerdict,
        // Refresh timestamp on flip → "Same Same" so it surfaces as
        // freshly matched in the journey.
        ...(newVerdict === "same"
          ? { timestamp: new Date().toISOString() }
          : {}),
      };

      setState((prev) => {
        const target = prev.matches.find((m) => m.id === id);
        if (!target || target.verdict === newVerdict) return prev;

        const newMatches = prev.matches.map((m) => (m.id === id ? flipped : m));
        const confirmed = newMatches.filter((m) => m.verdict === "same");
        const { matchedCountries, badges } = recomputeFromConfirmed(
          confirmed,
          prev.badges,
        );
        // Streak: bump on different→same, decrement on same→different.
        const streakCount =
          newVerdict === "same"
            ? prev.streakCount + 1
            : Math.max(0, prev.streakCount - 1);
        const newState: AppState = {
          ...prev,
          matches: newMatches,
          matchedCountries,
          totalMatches: confirmed.length,
          streakCount,
          badges,
        };
        saveState(newState);
        return newState;
      });

      // Flipping same → different is a ripple undo: fire a server
      // unvote so the corresponding wave (if any) cascades away. The
      // reverse direction (different → same) doesn't currently
      // re-record a vote on the server — that would require
      // re-supplying the user's representing photo at the time of the
      // original swipe, which we don't reliably retain on these older
      // matches. Treat it as a local-only flip for now; a fresh swipe
      // in discovery is the canonical way to create a new "same" vote.
      if (
        previous.verdict === "same" &&
        newVerdict === "different" &&
        previous.theirPhotoId
      ) {
        const { theirPhotoId } = previous;
        void unvotePhoto(theirPhotoId).then((ok) => {
          if (ok) refreshEchoesRef.current?.();
        });
      }
      return flipped;
    },
    [],
  );

  const setMyCountry = useCallback(
    (code: string, name: string, flag: string) => {
      setState((prev) => {
        const newState: AppState = {
          ...prev,
          myCountryCode: code,
          myCountryName: name,
          myCountryFlag: flag,
        };
        saveState(newState);
        return newState;
      });
    },
    [],
  );

  const addMyPhoto = useCallback((
    uri: string,
    theme: string,
    tags?: string[],
    isAI?: boolean,
    musicGenre?: string,
    customAudioUrl?: string,
    subjects?: string[],
  ) => {
    const photo: MyPhoto = {
      uri,
      uploadedAt: new Date().toISOString(),
      theme,
      tags: tags ?? [],
      // Persist subjects on the local record. Empty array (rather than
      // undefined) keeps the match screen's `mySubjects ?? []` paths
      // simple and matches the server-side `default ARRAY[]::text[]`.
      subjects: subjects ?? [],
      isAI: isAI ?? false,
      musicGenre: musicGenre,
      customAudioUrl,
      // Real (non-AI) photos start as "pending" — the camera screen
      // fires the POST /photos call and will patch this to "ok" or
      // "failed" once the network round-trip resolves. AI photos are
      // never uploaded, so leave the field undefined for them.
      uploadState: isAI ? undefined : "pending",
    };
    setState((prev) => {
      // Adding a new photo is a "fresh chance" moment: this new
      // photo may match candidates the user already saw (and
      // dismissed without voting) for previous photos. Clear the
      // local seen ledger so the next /candidates fetch doesn't
      // re-send those IDs as excludeIds. The server independently
      // wipes its seen_photos table on POST /photos for the same
      // reason. The votes table is untouched on both sides — past
      // explicit same/no decisions still stand.
      const newState = {
        ...prev,
        myPhotos: [photo, ...prev.myPhotos],
        seenPhotoKeys: [],
        seenPhotoIds: [],
      };
      saveState(newState);
      return newState;
    });
  }, []);

  const setMyPhotoBackendId = useCallback(
    (uri: string, backendId: string, subjects?: string[]) => {
      setState((prev) => {
        let changed = false;
        const newPhotos = prev.myPhotos.map((p) => {
          if (p.uri !== uri) return p;
          // Patch backendId, and (when the upload response surfaces a
          // non-empty subjects array) also patch subjects. The pre-
          // upload analyze pass and the upload-time analysis run the
          // same Gemini prompt, but they are two independent calls and
          // the upload's pass is authoritative — it is what was
          // actually persisted to the row that /candidates ranks
          // against. Only overwrite when we have something to overwrite
          // with so a transient upload-time analysis failure (sentinel
          // [], or [_failed] swapped to []) doesn't wipe the local
          // pre-upload subjects we already had.
          const nextSubjects =
            subjects && subjects.length > 0 ? subjects : p.subjects;
          if (
            p.backendId === backendId &&
            nextSubjects === p.subjects &&
            p.uploadState === "ok"
          ) {
            return p;
          }
          changed = true;
          // Backend returned an id → upload succeeded. Stamp uploadState
          // alongside the id so the match screen's "still uploading"
          // gate flips off without waiting for any other signal. The
          // `as const` keeps TS from widening the literal back to
          // `string`, which would break the MyPhoto["uploadState"]
          // union and fail the AppState type check.
          return {
            ...p,
            backendId,
            subjects: nextSubjects,
            uploadState: "ok" as const,
          };
        });
        if (!changed) return prev;
        const newState = { ...prev, myPhotos: newPhotos };
        saveState(newState);
        return newState;
      });
    },
    [],
  );

  const setMyPhotoUploadState = useCallback(
    (uri: string, uploadState: NonNullable<MyPhoto["uploadState"]>) => {
      setState((prev) => {
        let changed = false;
        const newPhotos = prev.myPhotos.map((p) => {
          if (p.uri !== uri) return p;
          if (p.uploadState === uploadState) return p;
          // Don't downgrade from a terminal "ok" — once the server has
          // ack'd the photo, a subsequent stale "failed" callback (e.g.
          // a retry path crossing wires) shouldn't strip the backendId
          // path. "failed" → "pending" is fine (user re-tried) and
          // "pending" → terminal is the normal forward path.
          if (p.uploadState === "ok" && uploadState !== "ok") return p;
          changed = true;
          return { ...p, uploadState };
        });
        if (!changed) return prev;
        const newState = { ...prev, myPhotos: newPhotos };
        saveState(newState);
        return newState;
      });
    },
    [],
  );

  const completeOnboarding = useCallback(() => {
    setState((prev) => {
      const newState = { ...prev, onboardingComplete: true };
      saveState(newState);
      return newState;
    });
  }, []);

  const resetOnboarding = useCallback(() => {
    setState((prev) => {
      const newState = { ...prev, onboardingComplete: false };
      saveState(newState);
      return newState;
    });
  }, []);

  const unlockPro = useCallback(() => {
    setState((prev) => {
      const newState = { ...prev, proUnlocked: true };
      saveState(newState);
      return newState;
    });
  }, []);

  // Two-way setter used by the RevenueCat bridge in _layout.tsx so the
  // local proUnlocked flag stays in lock-step with the live entitlement
  // (handles purchase, restore, lapse, and webhook-pushed changes). Skips
  // the persisted state write when nothing actually changed — RevenueCat
  // emits a customer-info update on every app foreground, and we don't
  // want to thrash AsyncStorage on every one of those.
  const setProUnlocked = useCallback((value: boolean) => {
    setState((prev) => {
      if (prev.proUnlocked === value) return prev;
      const newState = { ...prev, proUnlocked: value };
      saveState(newState);
      return newState;
    });
  }, []);

  // --- Connect Requests ---

  const REQUEST_TTL_MS = 48 * 60 * 60 * 1000; // 48h

  const sendConnectRequest = useCallback(
    (matchId: string, platform: string, handle: string): ConnectRequest | null => {
      const trimmed = handle.trim().replace(/^@+/, "");
      if (!trimmed) return null;
      let created: ConnectRequest | null = null as ConnectRequest | null;
      setState((prev) => {
        const match = prev.matches.find((m) => m.id === matchId);
        if (!match) return prev;
        // Don't allow duplicate outgoing for the same match
        const existing = prev.connectRequests.find(
          (r) =>
            r.matchId === matchId &&
            r.direction === "outgoing" &&
            (r.status === "pending" || r.status === "accepted"),
        );
        if (existing) {
          created = existing;
          return prev;
        }
        const now = Date.now();
        const req: ConnectRequest = {
          id: `out_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          matchId,
          direction: "outgoing",
          status: "pending",
          myPlatform: platform,
          myHandle: trimmed,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + REQUEST_TTL_MS).toISOString(),
          theirCountry: match.theirCountry,
          theirCountryFlag: match.theirCountryFlag,
          theirCountryCode: match.theirCountryCode,
          theirPhoto: match.theirPhoto,
          myPhoto: match.myPhoto,
          theme: match.theme,
          seen: true,
        };
        created = req;
        const newState: AppState = {
          ...prev,
          connectRequests: [req, ...prev.connectRequests],
          myDefaultPlatform: platform,
          myDefaultHandle: trimmed,
        };
        saveState(newState);
        return newState;
      });

      // Dev-only: simulate the other user responding within a few seconds so
      // the user can experience the full loop without a backend. In real
      // production builds we'd be waiting on a push from the server.
      if (created && __DEV__) {
        const targetId = created.id;
        setTimeout(() => {
          const live = stateRef.current.connectRequests.find(
            (r) => r.id === targetId,
          );
          if (!live || live.status !== "pending") return;
          const accepted = Math.random() < 0.7;
          // Pick a fake handle for the simulated counterpart
          const platforms = ["instagram", "tiktok", "snapchat", "x", "threads"];
          const theirPlatform = platforms[Math.floor(Math.random() * platforms.length)];
          const adjectives = ["wandering", "sunny", "quiet", "wild", "tiny", "loud", "soft", "lucky"];
          const nouns = ["fern", "lantern", "river", "moth", "cloud", "atlas", "echo", "mango"];
          const a = adjectives[Math.floor(Math.random() * adjectives.length)];
          const n = nouns[Math.floor(Math.random() * nouns.length)];
          const num = Math.floor(Math.random() * 90) + 10;
          const theirHandle = `${a}.${n}${num}`;
          setState((prev) => {
            const newRequests = prev.connectRequests.map((r) =>
              r.id === targetId
                ? {
                    ...r,
                    status: accepted ? ("accepted" as const) : ("declined" as const),
                    respondedAt: new Date().toISOString(),
                    theirPlatform: accepted ? theirPlatform : undefined,
                    theirHandle: accepted ? theirHandle : undefined,
                    seen: false,
                  }
                : r,
            );
            const newState = { ...prev, connectRequests: newRequests };
            saveState(newState);
            return newState;
          });
        }, 6000 + Math.random() * 4000);
      }

      return created;
    },
    [],
  );

  const respondConnectRequest = useCallback(
    (id: string, accept: boolean, platform?: string, handle?: string) => {
      const trimmed = handle?.trim().replace(/^@+/, "");
      setState((prev) => {
        const newRequests = prev.connectRequests.map((r) => {
          if (r.id !== id) return r;
          if (r.status !== "pending") return r;
          if (accept && (!platform || !trimmed)) return r;
          return {
            ...r,
            status: accept ? ("accepted" as const) : ("declined" as const),
            respondedAt: new Date().toISOString(),
            myPlatform: accept ? platform : r.myPlatform,
            myHandle: accept ? trimmed : r.myHandle,
            seen: true,
          };
        });
        const newState: AppState = {
          ...prev,
          connectRequests: newRequests,
          ...(accept && platform && trimmed
            ? { myDefaultPlatform: platform, myDefaultHandle: trimmed }
            : {}),
        };
        saveState(newState);
        return newState;
      });
    },
    [],
  );

  const markRequestSeen = useCallback((id: string) => {
    setState((prev) => {
      let changed = false;
      const newRequests = prev.connectRequests.map((r) => {
        if (r.id === id && !r.seen) {
          changed = true;
          return { ...r, seen: true };
        }
        return r;
      });
      if (!changed) return prev;
      const newState = { ...prev, connectRequests: newRequests };
      saveState(newState);
      return newState;
    });
  }, []);

  const unreadIncoming = state.connectRequests.filter(
    (r) => r.direction === "incoming" && r.status === "pending" && !r.seen,
  ).length
    + state.connectRequests.filter(
      // Resolved outgoing the user hasn't seen yet (they responded!)
      (r) =>
        r.direction === "outgoing" &&
        (r.status === "accepted" || r.status === "declined") &&
        !r.seen,
    ).length;

  const pendingOutgoing = state.connectRequests.filter(
    (r) => r.direction === "outgoing" && r.status === "pending",
  ).length;

  const hasOutgoingForMatch = useCallback(
    (matchId: string) =>
      state.connectRequests.some(
        (r) =>
          r.matchId === matchId &&
          r.direction === "outgoing" &&
          (r.status === "pending" || r.status === "accepted"),
      ),
    [state.connectRequests],
  );

  // --- Echoes (server-backed) -----------------------------------------
  //
  // The inbox + mutual list both live on the server. We refresh on mount,
  // when the app foregrounds (handled by callers via refreshEchoes), and
  // every time the user opens the inbox screen. There's no local-only
  // echo state any more — the simulated dev push has been retired now
  // that the loop is real.

  const refreshEchoes = useCallback(async () => {
    try {
      const [inbox, mine] = await Promise.all([
        fetchEchoesInbox(),
        fetchEchoesMine(),
      ]);
      // Detect mutual echoes that weren't here last time. On the very
      // first refresh we silently seed the "shown" set so old echoes
      // don't all flash at once. After that, the freshest unseen one
      // wins the celebration overlay (the polling cadence is 30s, so
      // typically there's only zero or one new entry per tick).
      if (!flashSeededRef.current) {
        for (const e of mine) {
          if (e.state === "mutual") flashEnqueuedRef.current.add(e.id);
        }
        flashSeededRef.current = true;
      } else {
        // Enqueue every freshly-mutual echo we haven't seen yet so a
        // burst of new mutuals (or one arriving while another flash is
        // open) all get celebrated in turn.
        for (const e of mine) {
          if (e.state === "mutual" && !flashEnqueuedRef.current.has(e.id)) {
            enqueueFlashEcho(e);
          }
        }
      }
      setState((prev) => {
        const newState: AppState = {
          ...prev,
          pendingEchoes: inbox,
          mutualEchoes: mine,
        };
        saveState(newState);
        return newState;
      });
    } catch {
      // Network failure — leave existing lists in place. The inbox screen
      // shows an empty state when both lists are empty, which is fine.
    }
  }, []);

  // First load + lightweight 30s poll. We don't need push notifications
  // for MVP; the user will see new offers when they next foreground the
  // app or open the inbox.
  React.useEffect(() => {
    refreshEchoes();
    const id = setInterval(refreshEchoes, 30_000);
    return () => clearInterval(id);
  }, [refreshEchoes]);

  // Keep the forward-declared ref in sync so removeMatch / changeVerdict
  // (declared earlier in this component) can fire a refresh after a
  // server-side cascade revoke.
  React.useEffect(() => {
    refreshEchoesRef.current = refreshEchoes;
  }, [refreshEchoes]);

  const markAllEchoesSeen = useCallback(() => {
    const nowIso = new Date().toISOString();
    setState((prev) => {
      if (prev.echoesSeenAt === nowIso) return prev;
      const newState: AppState = { ...prev, echoesSeenAt: nowIso };
      saveState(newState);
      return newState;
    });
  }, []);

  const respondToEcho = useCallback(
    async (id: string, verdict: "same" | "different") => {
      // Optimistic: pull the offer out of the pending list immediately so
      // the UI feels instant. We reconcile against the server response.
      const target = stateRef.current.pendingEchoes.find((e) => e.id === id);
      if (!target) return "error" as const;
      const promoted: EchoCard = {
        ...target,
        state: "mutual" as const,
        mutualAt: new Date().toISOString(),
      };
      setState((prev) => {
        const newPending = prev.pendingEchoes.filter((e) => e.id !== id);
        const newMutual =
          verdict === "same" ? [promoted, ...prev.mutualEchoes] : prev.mutualEchoes;
        const newState: AppState = {
          ...prev,
          pendingEchoes: newPending,
          mutualEchoes: newMutual,
        };
        saveState(newState);
        return newState;
      });
      try {
        const result = await respondEchoApi(id, verdict);
        if (!result.ok) {
          // Roll back: re-fetch authoritative state from the server.
          await refreshEchoes();
          return "error" as const;
        }
        if (result.state === "mutual") {
          // Celebrate immediately on the responder's side. enqueueFlashEcho
          // also marks the id so the next polling refresh doesn't
          // re-trigger it.
          enqueueFlashEcho(promoted);
          return "mutual" as const;
        }
        return "declined" as const;
      } catch {
        await refreshEchoes();
        return "error" as const;
      }
    },
    [refreshEchoes],
  );

  // Unread count: pending offers received since the user last opened the
  // inbox. If the user has never opened it, every pending offer counts.
  const unreadEchoes = React.useMemo(() => {
    const seenAt = state.echoesSeenAt
      ? new Date(state.echoesSeenAt).getTime()
      : 0;
    return state.pendingEchoes.filter((e) => {
      const ts = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      return ts > seenAt;
    }).length;
  }, [state.pendingEchoes, state.echoesSeenAt]);

  // "My vibe" is the user's interest fingerprint. Posted-photo tags weigh more
  // than match-derived tags, but both contribute so the user sees a vibe form
  // even before they've uploaded their own photo (e.g. during the first
  // session when they're using the locked sample photo).
  const myVibe = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of state.myPhotos) {
      for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 2);
    }
    for (const m of state.matches) {
      for (const t of m.sharedTags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([t]) => t);
  }, [state.myPhotos, state.matches]);

  const getWorldMapCoverage = useCallback(() => {
    return Math.min(
      100,
      Math.round((state.matchedCountries.length / 195) * 100)
    );
  }, [state.matchedCountries.length]);

  return (
    <AppContext.Provider
      value={{
        ...state,
        myVibe,
        addMatch,
        removeMatch,
        changeVerdict,
        setMyCountry,
        addMyPhoto,
        setMyPhotoBackendId,
        setMyPhotoUploadState,
        completeOnboarding,
        resetOnboarding,
        unlockPro,
        setProUnlocked,
        getWorldMapCoverage,
        sendConnectRequest,
        respondConnectRequest,
        markRequestSeen,
        unreadIncoming,
        pendingOutgoing,
        hasOutgoingForMatch,
        markAllEchoesSeen,
        unreadEchoes,
        refreshEchoes,
        respondToEcho,
        markPhotoSeen,
        hasSeenPhoto,
        resetSeenPhotos,
        primeSeenFromCandidates,
        pendingFlashEcho,
        dismissFlashEcho,
        hasHydrated,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

function isAsian(code: string) {
  const asian = ["CN","JP","KR","IN","TH","VN","ID","PH","MY","SG","BD","PK","NP","LK","MM","KH","LA","MN","TW","HK","BT","MV","TL","BN","AF","IR","IQ","SY","SA","AE","QA","KW","BH","OM","YE","JO","LB","IL","PS","TR","AZ","GE","AM","KZ","UZ","TM","TJ","KG"];
  return asian.includes(code);
}

function isAfrican(code: string) {
  const african = ["NG","ZA","KE","ET","GH","TZ","UG","DZ","SD","EG","MA","TN","LY","CM","CI","SN","ML","BF","NE","MW","ZM","ZW","MZ","AO","RW","SO","MG","CD","CG","GA","GN","SL","LR","GW","GM","CV","ST","EH","MR","TG","BJ","GQ","CF","TD","SS","BI","DJ","KM","ER","SC","MU","RE","YT","NA","BW","LS","SZ"];
  return african.includes(code);
}

function isAmericas(code: string) {
  const americas = ["US","CA","MX","BR","AR","CL","CO","PE","VE","EC","BO","PY","UY","GY","SR","PA","CR","NI","HN","GT","SV","BZ","CU","DO","HT","JM","TT","BB","LC","VC","GD","AG","DM","KN","BS","TC","VG","VI","PR","GP","MQ","GF","AW","CW","BQ","AI","MS","KY","BM","FK","GS"];
  return americas.includes(code);
}
