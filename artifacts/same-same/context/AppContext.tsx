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
   * Music vibe for this photo (e.g. "classic", "rock"). Picked at upload
   * time — AI suggests, the user can swap. Lives on the photo so the
   * matching client knows which clip to play when this photo is in the
   * deck. Optional for backwards compatibility with photos uploaded
   * before the feature shipped.
   */
  musicGenre?: string;
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
  ) => void;
  /**
   * Patch a previously-added local photo with the backend ID returned by
   * the upload API. Called from the camera screen once the network round
   * trip completes; safe to call before or after the photo is consumed
   * by the swipe deck.
   */
  setMyPhotoBackendId: (uri: string, backendId: string) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  unlockPro: () => void;
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
  /** Mark a photo (by stable photoKey) as seen by the user. Idempotent. */
  markPhotoSeen: (key: string) => void;
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
    proUnlocked: false,
    connectRequests: [],
    pendingEchoes: [],
    mutualEchoes: [],
    seenPhotoKeys: [],
  });
  // Mutable ref so simulated-response timeouts can read latest state
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    loadState();
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
              isAI: p.isAI ?? false,
              // Preserve the backend ID across restarts so votes from
              // already-uploaded photos still create echo offers.
              backendId:
                typeof p.backendId === "string" && p.backendId.length > 0
                  ? p.backendId
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
        setState((prev) => ({
          ...prev,
          ...parsed,
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
          seenPhotoKeys,
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

  const markPhotoSeen = useCallback((key: string) => {
    if (!key) return;
    // Cheap synchronous guard — avoids a setState (and re-render) when the
    // photo is already in the ledger, which is the common case (every
    // re-render of the swipe card would otherwise re-mark its photo).
    if (seenSetRef.current.has(key)) return;
    setState((prev) => {
      if (prev.seenPhotoKeys.includes(key)) return prev;
      const newState: AppState = {
        ...prev,
        seenPhotoKeys: [...prev.seenPhotoKeys, key],
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
      const newState: AppState = { ...prev, seenPhotoKeys: [] };
      saveState(newState);
      return newState;
    });
  }, []);

  const removeMatch = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.matches.find((m) => m.id === id);
      if (!target) return prev;

      const remainingMatches = prev.matches.filter((m) => m.id !== id);
      const confirmed = remainingMatches.filter((m) => m.verdict === "same");
      const { matchedCountries } = recomputeFromConfirmed(confirmed, prev.badges);

      // Note: we intentionally keep earned badges. Undoing a single match
      // shouldn't take an achievement away — and re-earning is trivial.
      const wasConfirmed = target.verdict === "same";
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
  }, []);

  const changeVerdict = useCallback(
    (id: string, newVerdict: "same" | "different"): Match | null => {
      let updated: Match | null = null;
      setState((prev) => {
        const target = prev.matches.find((m) => m.id === id);
        if (!target) return prev;
        if (target.verdict === newVerdict) {
          updated = target;
          return prev;
        }
        const flipped: Match = {
          ...target,
          verdict: newVerdict,
          // Refresh timestamp on flip → "Same Same" so it surfaces as
          // freshly matched in the journey.
          ...(newVerdict === "same"
            ? { timestamp: new Date().toISOString() }
            : {}),
        };
        updated = flipped;

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
      return updated;
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
  ) => {
    const photo: MyPhoto = {
      uri,
      uploadedAt: new Date().toISOString(),
      theme,
      tags: tags ?? [],
      isAI: isAI ?? false,
      musicGenre: musicGenre,
    };
    setState((prev) => {
      const newState = { ...prev, myPhotos: [photo, ...prev.myPhotos] };
      saveState(newState);
      return newState;
    });
  }, []);

  const setMyPhotoBackendId = useCallback((uri: string, backendId: string) => {
    setState((prev) => {
      let changed = false;
      const newPhotos = prev.myPhotos.map((p) => {
        if (p.uri === uri && p.backendId !== backendId) {
          changed = true;
          return { ...p, backendId };
        }
        return p;
      });
      if (!changed) return prev;
      const newState = { ...prev, myPhotos: newPhotos };
      saveState(newState);
      return newState;
    });
  }, []);

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
      setState((prev) => {
        const newPending = prev.pendingEchoes.filter((e) => e.id !== id);
        const newMutual =
          verdict === "same"
            ? [
                {
                  ...target,
                  state: "mutual" as const,
                  mutualAt: new Date().toISOString(),
                },
                ...prev.mutualEchoes,
              ]
            : prev.mutualEchoes;
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
        return result.state === "mutual" ? "mutual" : "declined";
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
        completeOnboarding,
        resetOnboarding,
        unlockPro,
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
