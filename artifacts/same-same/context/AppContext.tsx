import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { SAMPLE_PHOTOS } from "@/data/samplePhotos";

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
 * An "echo" — someone else somewhere swiped same-same on a photo I posted.
 * This is the inverse of a Match (which captures a swipe I made on someone
 * else's photo). Echoes feed the Me-tab notification bell.
 */
export interface EchoNotification {
  id: string;
  /** URI of MY photo they connected to. */
  myPhoto: string;
  /** Theme my photo was posted under (used for narrative copy). */
  myPhotoTheme?: string;
  /** Their photo that paired with mine. */
  theirPhoto: string;
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode: string;
  /** How fresh their photo was when they swiped. */
  theirPhotoMinutesAgo?: number;
  sharedTags?: string[];
  /** When they swiped same-same (ISO). */
  timestamp: string;
  /** Has the user opened the notifications view since this arrived? */
  seen: boolean;
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
  echoes: EchoNotification[];
  myDefaultPlatform?: string; // remembered preference
  myDefaultHandle?: string;
  // User's "home" country — drives the Same Country / Same Continent
  // celebrations and labels the user side of every match record.
  myCountryCode?: string;
  myCountryName?: string;
  myCountryFlag?: string;
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
  addMyPhoto: (uri: string, theme: string, tags?: string[]) => void;
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
  // Echo notifications (others connecting to my photos)
  markEchoSeen: (id: string) => void;
  markAllEchoesSeen: () => void;
  unreadEchoes: number;
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
    echoes: [],
  });
  // Mutable ref so simulated-response timeouts can read latest state
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    loadState();
  }, []);

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
        // Cap stored echoes at 50, oldest-trimmed, so storage stays bounded.
        const migratedEchoes: EchoNotification[] = Array.isArray(parsed.echoes)
          ? parsed.echoes.slice(0, 50)
          : [];
        setState((prev) => ({
          ...prev,
          ...parsed,
          myPhotos: migratedPhotos,
          connectRequests: migratedRequests,
          echoes: migratedEchoes,
          badges: defaultBadges.map((b) => {
            const stored = parsed.badges?.find((sb: Badge) => sb.id === b.id);
            return stored ? { ...b, ...stored } : b;
          }),
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
      // Both "same" and "different" verdicts get persisted to history so
      // the user can revisit & flip a previous swipe. Only "same" verdicts
      // count toward the journey stats / badges / streak.
      const allMatches = [match, ...prev.matches];
      const confirmed = allMatches.filter((m) => m.verdict === "same");
      const { matchedCountries, badges } = recomputeFromConfirmed(
        confirmed,
        prev.badges,
      );
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
      };
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

  const addMyPhoto = useCallback((uri: string, theme: string, tags?: string[]) => {
    const photo: MyPhoto = {
      uri,
      uploadedAt: new Date().toISOString(),
      theme,
      tags: tags ?? [],
    };
    setState((prev) => {
      const newState = { ...prev, myPhotos: [photo, ...prev.myPhotos] };
      saveState(newState);
      return newState;
    });
    // Dev-only: schedule a fake echo against the photo we just uploaded
    // so the user can see the notification flow without real network
    // traffic. Real builds receive these via push.
    if (__DEV__) {
      setTimeout(
        () => {
          // buildFakeEcho uses SAMPLE_PHOTOS only — no closure stale-state risk
          const sameTheme = SAMPLE_PHOTOS.filter((p) => p.theme === photo.theme);
          const pool = sameTheme.length > 0 ? sameTheme : SAMPLE_PHOTOS;
          if (pool.length === 0) return;
          const sample = pool[Math.floor(Math.random() * pool.length)];
          const myTagSet = new Set(photo.tags ?? []);
          const sharedTags = sample.tags.filter((t) => myTagSet.has(t));
          const echo: EchoNotification = {
            id: `echo_${Date.now().toString(36)}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
            myPhoto: photo.uri,
            myPhotoTheme: photo.theme,
            theirPhoto: sample.uri,
            theirCountry: sample.country,
            theirCountryFlag: sample.countryFlag,
            theirCountryCode: sample.countryCode,
            theirPhotoMinutesAgo: sample.minutesAgo,
            sharedTags,
            timestamp: new Date().toISOString(),
            seen: false,
          };
          setState((prev) => {
            const newEchoes = [echo, ...prev.echoes].slice(0, 50);
            const newState = { ...prev, echoes: newEchoes };
            saveState(newState);
            return newState;
          });
        },
        8000 + Math.random() * 12000,
      );
    }
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

  // --- Echo notifications (others connecting to my photos) ---
  //
  // In production these would arrive via push from the backend whenever
  // another user swiped same-same on a photo I posted. For dev we
  // synthesize a small stream off the existing sample photo bank so the
  // notification UI is observable without a backend.

  const addEcho = useCallback((echo: EchoNotification) => {
    setState((prev) => {
      // Cap at 50, newest-first.
      const newEchoes = [echo, ...prev.echoes].slice(0, 50);
      const newState: AppState = { ...prev, echoes: newEchoes };
      saveState(newState);
      return newState;
    });
  }, []);

  const markEchoSeen = useCallback((id: string) => {
    setState((prev) => {
      let changed = false;
      const newEchoes = prev.echoes.map((e) => {
        if (e.id === id && !e.seen) {
          changed = true;
          return { ...e, seen: true };
        }
        return e;
      });
      if (!changed) return prev;
      const newState = { ...prev, echoes: newEchoes };
      saveState(newState);
      return newState;
    });
  }, []);

  const markAllEchoesSeen = useCallback(() => {
    setState((prev) => {
      if (prev.echoes.every((e) => e.seen)) return prev;
      const newEchoes = prev.echoes.map((e) => ({ ...e, seen: true }));
      const newState = { ...prev, echoes: newEchoes };
      saveState(newState);
      return newState;
    });
  }, []);

  const unreadEchoes = state.echoes.filter((e) => !e.seen).length;

  // Build a single fake echo against one of my photos. Prefers stranger
  // photos with the same theme so the pairing reads naturally.
  const buildFakeEcho = useCallback(
    (myPhoto: MyPhoto): EchoNotification | null => {
      const sameTheme = SAMPLE_PHOTOS.filter((p) => p.theme === myPhoto.theme);
      const pool = sameTheme.length > 0 ? sameTheme : SAMPLE_PHOTOS;
      if (pool.length === 0) return null;
      const sample = pool[Math.floor(Math.random() * pool.length)];
      const myTagSet = new Set(myPhoto.tags ?? []);
      const sharedTags = sample.tags.filter((t) => myTagSet.has(t));
      const id = `echo_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      return {
        id,
        myPhoto: myPhoto.uri,
        myPhotoTheme: myPhoto.theme,
        theirPhoto: sample.uri,
        theirCountry: sample.country,
        theirCountryFlag: sample.countryFlag,
        theirCountryCode: sample.countryCode,
        theirPhotoMinutesAgo: sample.minutesAgo,
        sharedTags,
        timestamp: new Date().toISOString(),
        seen: false,
      };
    },
    [],
  );

  // Dev-only seeder: if the user has photos but no echoes yet, drop one
  // in shortly after first load so the bell isn't perpetually empty for
  // anyone testing the feature without yet uploading a fresh photo.
  React.useEffect(() => {
    if (!__DEV__) return;
    if (state.myPhotos.length === 0) return;
    if (state.echoes.length > 0) return;
    const t = setTimeout(() => {
      const myPhoto = stateRef.current.myPhotos[0];
      if (!myPhoto) return;
      const echo = buildFakeEcho(myPhoto);
      if (echo) addEcho(echo);
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.myPhotos.length, state.echoes.length]);

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
        markEchoSeen,
        markAllEchoesSeen,
        unreadEchoes,
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
