/**
 * The app's one store. It holds what the screens show (country, Ripples,
 * Waves), keeps the small things on the device, and does the quiet work in
 * the background: collecting Waves from the server and looking for a match
 * for the latest Ripple.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState as NativeAppState, Platform } from "react-native";

import { createHttpBackend } from "@/backend/http";
import { errorKind, type Backend } from "@/backend/types";
import { apiOrigin } from "@/config/env";
import { resolveCaptureCountry } from "@/core/captureCountry";
import {
  mergeRipples,
  newRipple,
  photoHistory,
  ripplesFromLegacyState,
  type HistoryPhoto,
} from "@/core/history";
import {
  MATCH,
  reachDecision,
  selectReachTargets,
  travellingRipple,
  withReachPass,
} from "@/core/reach";
import {
  isPreviewOfferId,
  previewWaveAfterAccept,
  resolvePreviewOffer,
} from "@/core/sampleOffers";
import type { Candidate, Offer, Ripple, Wave } from "@/core/types";
import { sortWaves, unseenWaves, unrevealedWaves, withRevealedWaveId } from "@/core/waves";
import { normalizeCountryCode } from "@/data/countries";
import { countryAt, countryHere } from "@/device/location";
import {
  cacheWavePhoto,
  encodeForUpload,
  keepRipplePhoto,
  readFileBase64,
  removeRipplePhoto,
  type ChosenPhoto,
} from "@/device/photos";
import {
  configureForegroundPushes,
  enablePushes,
  listenForPushes,
  pushPermission,
  type PushPermission,
  type PushTarget,
} from "@/device/push";
import {
  accountKey,
  LEGACY_KEYS,
  legacyDeviceId,
  readJson,
  readText,
  writeJson,
} from "@/device/storage";
import { emotionFor } from "@/data/emotions";
import { topicFor } from "@/data/topics";
import { withTimeout } from "@/lib/timeout";
import { useSession } from "@/state/session";

export type SyncStatus = "idle" | "syncing" | "offline" | "failed";
export type CountryStatus = "checking" | "known" | "needed";
/** Post-sign-in gate while profile/country load from device + API. */
export type BootStatus = "idle" | "loading" | "slow" | "failed";

export interface RippleDraft {
  photo: ChosenPhoto;
  /** Emotion id from data/emotions.ts. */
  emotion: string | null;
  /** Topic id from data/topics.ts. */
  topic: string | null;
  /** Library mood id from data/vibes.ts (defaults from the emotion). */
  song: string | null;
  /** A short sound recorded for this Ripple (overrides library song when playing). */
  recording: { uri: string; mime: string } | null;
}

interface Profile {
  countryCode: string | null;
  /** False while the chosen country still has to reach the server. */
  countrySaved: boolean;
  /** When this version of the app was first opened for this account. */
  baselineAt: string;
  /** The notification prompt is shown once, after the first Ripple. */
  pushAsked: boolean;
  /** Photos from the previous app have been carried over. */
  migrated: boolean;
}

interface Hidden {
  photoIds: string[];
  waveIds: string[];
}

interface Data {
  accountId: string | null;
  ready: boolean;
  profile: Profile;
  country: CountryStatus;
  ripples: Ripple[];
  waves: Wave[];
  /** True once Waves have been read from the device or the server. */
  wavesKnown: boolean;
  /** Pending inbox offers waiting for the user's Wave-back / Dismiss. */
  offers: Offer[];
  offersKnown: boolean;
  seenWaveIds: string[];
  /** Wave ids that already played the rings+swoosh reveal (persisted). */
  revealedWaveIds: string[];
  hidden: Hidden;
  sync: SyncStatus;
}

export interface AppStateValue {
  ready: boolean;
  country: CountryStatus;
  countryCode: string | null;
  /** Post-sign-in load: slow/failed replace the bare infinite ring. */
  boot: BootStatus;
  /** Human detail when boot is slow or failed. */
  bootDetail: string | null;
  /** Re-run device + profile load after a boot failure. */
  retryBoot(): void;
  /** Waves on the map, newest first. */
  waves: Wave[];
  wavesKnown: boolean;
  /**
   * Pending inbox offers (other people's Ripples aimed at my photos).
   * Not auto-accepted — the Wave tab lets the user Wave back or Dismiss.
   */
  offers: Offer[];
  offersKnown: boolean;
  /** Wave tab: accept (verdict same) or dismiss (verdict different). */
  respondToOffer(offerId: string, verdict: "same" | "different"): Promise<void>;
  /** Waves that have arrived and not been opened, oldest first. */
  newWaves: Wave[];
  /**
   * Mutual Waves that still need the full-screen reveal (rings + swoosh),
   * oldest first. Used by auto-reveal on launch/foreground and by push routing.
   */
  unrevealedWaves: Wave[];
  /** Persist that the reveal ceremony has run (or been skipped) for this Wave. */
  markWaveRevealed(waveId: string): void;
  /** True when this Wave should still play the reveal ceremony. */
  shouldRevealWave(waveId: string): boolean;
  /** The latest Ripple, while it is still waiting for a Wave. */
  travelling: Ripple | null;
  history: HistoryPhoto[];
  sync: SyncStatus;
  backend: Backend;
  /** A tapped notification asked for this Wave. Cleared once handled. */
  pushTarget: PushTarget | null;
  clearPushTarget(): void;
  setCountry(countryCode: string): Promise<void>;
  /** Uploads the photo. Throws a BackendError when it does not reach the server. */
  sendRipple(draft: RippleDraft): Promise<Ripple>;
  /**
   * True until Home/Ripple dismiss the post-send waiting UI after an upload.
   * Independent of `travelling` so re-entering Home shows buttons.
   */
  postSendWaiting: boolean;
  /**
   * True once the user has offered a Ripple on Match (or background reach
   * has) during this post-upload wait. Gates "Your Ripple is out there".
   */
  postSendRippleOffered: boolean;
  /** Match / background reach: user actually sent a Ripple offer. */
  markPostSendRippleOffered(): void;
  /** Leave Home waiting / tap Send another — clear until the next send. */
  dismissPostSendWaiting(): void;
  syncNow(options?: { force?: boolean }): Promise<void>;
  /** Match screen: remember candidates already shown without counting a background look. */
  recordMatchSeen(myPhotoId: string, theirIds: readonly string[]): void;
  /** Match screen closed / mutual Wave: count one look so background reach waits. */
  finishMatchLook(myPhotoId: string, theirIds: readonly string[]): void;
  markWaveSeen(waveId: string): void;
  deletePhoto(photoId: string): Promise<void>;
  reportWave(wave: Wave, reason: string): Promise<void>;
  /** True once the first Ripple has gone and the notification prompt has not been shown. */
  shouldAskForPushes: boolean;
  askForPushes(): Promise<PushPermission>;
  /** Sent Ripples on this device (newest first) — Match screen needs the active one. */
  ripples: Ripple[];
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside AppStateProvider");
  return value;
}

const SYNC_MIN_GAP_MS = 60_000;
const TRAVEL_POLL_MS = 3 * 60_000;
const MAX_EXCLUDE_IDS = 200;
/**
 * Show “still waking…” only after a real stall. Render free-plan cold starts
 * can take tens of seconds, but a warm API often finishes getToken + profile
 * in well under this — keep the calm “Getting your account ready…” card first.
 */
const BOOT_SLOW_MS = 20_000;
/**
 * Hard stop for the starting gate. Covers token + /users/me (25s) with a little
 * spare; never leave RippleRings spinning with no way out.
 */
const BOOT_FAIL_MS = 35_000;
const BOOT_COUNTRY_TIMEOUT_MS = 28_000;

function freshProfile(): Profile {
  return {
    countryCode: null,
    countrySaved: false,
    baselineAt: new Date().toISOString(),
    pushAsked: false,
    migrated: false,
  };
}

function emptyData(): Data {
  return {
    accountId: null,
    ready: false,
    profile: freshProfile(),
    country: "checking",
    ripples: [],
    waves: [],
    wavesKnown: false,
    offers: [],
    offersKnown: false,
    seenWaveIds: [],
    revealedWaveIds: [],
    hidden: { photoIds: [], waveIds: [] },
    sync: "idle",
  };
}

/** Wave photos that are still text are too large to store; they come back on the next sync. */
function wavesForStorage(waves: Wave[]): Wave[] {
  const light = (uri: string | null) => (uri && uri.startsWith("data:") ? null : uri);
  return waves.map((wave) => ({
    ...wave,
    mine: { ...wave.mine, uri: light(wave.mine.uri) },
    theirs: { ...wave.theirs, uri: light(wave.theirs.uri) },
  }));
}

async function withCachedPhotos(waves: Wave[]): Promise<Wave[]> {
  const out: Wave[] = [];
  // One at a time: each photo is a large string and phones have little spare memory.
  for (const wave of waves) {
    out.push({
      ...wave,
      mine: { ...wave.mine, uri: await cacheWavePhoto(wave.mine.photoId, wave.mine.uri) },
      theirs: { ...wave.theirs, uri: await cacheWavePhoto(wave.theirs.photoId, wave.theirs.uri) },
    });
  }
  return out;
}

function legacyCountry(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { myCountryCode?: unknown };
    return typeof parsed.myCountryCode === "string"
      ? normalizeCountryCode(parsed.myCountryCode)
      : null;
  } catch {
    return null;
  }
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const accountId = session.status === "signedIn" ? session.accountId : null;
  const getToken = session.getToken;

  const backend = useMemo<Backend>(
    () => createHttpBackend({ origin: apiOrigin(), getToken, getDeviceId: legacyDeviceId }),
    [getToken],
  );

  const [data, setData] = useState<Data>(emptyData);
  const dataRef = useRef(data);
  const [now, setNow] = useState(() => Date.now());
  const [pushTarget, setPushTarget] = useState<PushTarget | null>(null);
  const [sentThisSession, setSentThisSession] = useState(false);
  const [postSendWaiting, setPostSendWaiting] = useState(false);
  const [postSendRippleOffered, setPostSendRippleOffered] = useState(false);
  const [boot, setBoot] = useState<BootStatus>("idle");
  const [bootDetail, setBootDetail] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  /** Updates what the screens see and what background work reads, together. */
  const commit = useCallback((change: (current: Data) => Data) => {
    const next = change(dataRef.current);
    dataRef.current = next;
    setData(next);
    return next;
  }, []);

  const save = useCallback(
    (name: "profile" | "ripples" | "seen" | "revealed" | "hidden" | "waves") => {
      const current = dataRef.current;
      if (!current.accountId) return;
      const key = accountKey(current.accountId, name);
      if (name === "profile") void writeJson(key, current.profile);
      else if (name === "ripples") void writeJson(key, current.ripples);
      else if (name === "seen") void writeJson(key, current.seenWaveIds);
      else if (name === "revealed") void writeJson(key, current.revealedWaveIds);
      else if (name === "hidden") void writeJson(key, current.hidden);
      else void writeJson(key, wavesForStorage(current.waves));
    },
    [],
  );

  const syncing = useRef<Promise<void> | null>(null);
  const lastSyncAt = useRef(0);

  /** Looks once for a match for the latest Ripple, if it is time to. */
  const reach = useCallback(
    async (forAccount: string): Promise<boolean> => {
      const ripple = dataRef.current.ripples[0];
      if (!ripple) return false;
      // First look belongs to the Match screen (manual X / wave). Background
      // reach starts after finishMatchLook bumps passes past 0.
      if (ripple.reach.passes === 0) return false;
      const decision = reachDecision(ripple, dataRef.current.waves, Date.now());
      if (!decision.due) return false;

      const looked: string[] = [];
      let targets: Candidate[] = [];
      for (let page = 0; page < MATCH.maxPages && targets.length === 0; page++) {
        const topic = ripple.topic ?? ripple.theme ?? null;
        const emotion = ripple.emotion ?? null;
        const musicGenre = ripple.vibe ?? null;
        const candidates = await backend.findCandidates({
          theme: topic ?? ripple.theme,
          tags: ripple.tags,
          subjects: ripple.subjects,
          emotion,
          musicGenre,
          voterPhotoId: ripple.photoId,
          limit: MATCH.pageSize,
          excludeIds: [...ripple.reach.offeredIds, ...looked].slice(-MAX_EXCLUDE_IDS),
        });
        targets = selectReachTargets(candidates, {
          minScore: decision.minScore,
          limit: MATCH.offersPerPass,
          alreadyOffered: ripple.reach.offeredIds,
          emotion,
          topic,
          sentAt: ripple.sentAt,
          relaxMinScoreForSameDayTopic: true,
        });
        if (candidates.length < MATCH.pageSize) break;
        looked.push(...candidates.map((c) => c.id));
      }

      let formedWave = false;
      const offered: string[] = [];
      for (const target of targets) {
        const result = await backend.offer(ripple.photoId, target.id);
        offered.push(target.id);
        if (result === "wave") formedWave = true;
      }

      if (dataRef.current.accountId !== forAccount) return false;
      if (offered.length > 0) setPostSendRippleOffered(true);
      commit((current) => ({
        ...current,
        ripples: current.ripples.map((r) =>
          r.photoId === ripple.photoId ? withReachPass(r, offered, Date.now()) : r,
        ),
      }));
      save("ripples");
      return formedWave;
    },
    [backend, commit, save],
  );

  const runSync = useCallback(async () => {
    const forAccount = dataRef.current.accountId;
    if (!forAccount || !dataRef.current.ready) return;
    const stillCurrent = () => dataRef.current.accountId === forAccount;
    commit((current) => ({ ...current, sync: "syncing" }));
    try {
      const profile = dataRef.current.profile;
      if (profile.countryCode && !profile.countrySaved) {
        await backend.setCountry(profile.countryCode);
        if (!stillCurrent()) return;
        commit((current) => ({ ...current, profile: { ...current.profile, countrySaved: true } }));
        save("profile");
      }

      // Inbox stays pending until the user Waves back or Dismisses on the Wave tab.
      // Do not auto-accept here (offersToAccept / acceptOffer loop removed).
      const [offers, waves] = await Promise.all([backend.listOffers(), backend.listWaves()]);
      if (!stillCurrent()) return;
      commit((current) => ({
        ...current,
        offers,
        offersKnown: true,
      }));

      const store = async (list: Wave[]) => {
        const cached = await withCachedPhotos(list);
        if (!stillCurrent()) return;
        commit((current) => ({ ...current, waves: cached, wavesKnown: true }));
        save("waves");
      };
      await store(waves);

      if (await reach(forAccount)) await store(await backend.listWaves());
      if (!stillCurrent()) return;
      lastSyncAt.current = Date.now();
      commit((current) => ({ ...current, sync: "idle" }));
    } catch (error) {
      if (!stillCurrent()) return;
      commit((current) => ({
        ...current,
        sync: errorKind(error) === "unreachable" ? "offline" : "failed",
      }));
    } finally {
      setNow(Date.now());
    }
  }, [backend, commit, reach, save]);

  const syncNow = useCallback(
    async (options?: { force?: boolean }) => {
      if (syncing.current) {
        await syncing.current;
        if (!options?.force) return;
      }
      if (!options?.force && Date.now() - lastSyncAt.current < SYNC_MIN_GAP_MS) return;
      const run = runSync().finally(() => {
        if (syncing.current === run) syncing.current = null;
      });
      syncing.current = run;
      await run;
    },
    [runSync],
  );

  const retryBoot = useCallback(() => {
    setBoot("loading");
    setBootDetail(null);
    setBootAttempt((n) => n + 1);
  }, []);

  // Load what the device remembers for this account, then catch up with the server.
  useEffect(() => {
    lastSyncAt.current = 0;
    if (!accountId) {
      commit(() => emptyData());
      setBoot("idle");
      setBootDetail(null);
      return;
    }
    let cancelled = false;
    setBoot("loading");
    setBootDetail(null);
    commit(() => ({ ...emptyData(), accountId }));

    const slowTimer = setTimeout(() => {
      if (cancelled) return;
      setBoot((current) => (current === "loading" ? "slow" : current));
      setBootDetail(
        "SameWave's server can take a minute to wake. Hang on, or try again if this stalls.",
      );
    }, BOOT_SLOW_MS);

    const failTimer = setTimeout(() => {
      if (cancelled) return;
      console.warn("[boot] timed out still checking country / ready");
      setBoot("failed");
      setBootDetail(
        "Couldn't finish signing you in. Check your connection, wait for the server to wake, then try again.",
      );
      // Leave the starting gate with a clear error + retry (keep country checking).
      commit((current) =>
        current.ready
          ? current
          : {
              ...current,
              ready: true,
              country: "checking",
            },
      );
    }, BOOT_FAIL_MS);

    void (async () => {
      try {
        const [savedProfile, savedRipples, seenWaveIds, revealedWaveIds, hidden, savedWaves] =
          await Promise.all([
            readJson<Profile | null>(accountKey(accountId, "profile"), null),
            readJson<Ripple[]>(accountKey(accountId, "ripples"), []),
            readJson<string[]>(accountKey(accountId, "seen"), []),
            readJson<string[]>(accountKey(accountId, "revealed"), []),
            readJson<Hidden>(accountKey(accountId, "hidden"), { photoIds: [], waveIds: [] }),
            readJson<Wave[] | null>(accountKey(accountId, "waves"), null),
          ]);
        let profile: Profile = { ...freshProfile(), ...(savedProfile ?? {}) };
        let ripples = Array.isArray(savedRipples) ? savedRipples : [];
        if (!profile.migrated) {
          const legacy = await readText(LEGACY_KEYS.state);
          ripples = mergeRipples(ripples, ripplesFromLegacyState(legacy));
          profile = {
            ...profile,
            migrated: true,
            countryCode: profile.countryCode ?? legacyCountry(legacy),
          };
        }
        if (cancelled) return;
        commit((current) => ({
          ...current,
          ready: true,
          profile,
          country: profile.countryCode ? "known" : "checking",
          ripples,
          seenWaveIds: Array.isArray(seenWaveIds) ? seenWaveIds : [],
          // Seed from seen so Waves opened before this field existed skip auto-reveal.
          revealedWaveIds: [
            ...new Set([
              ...(Array.isArray(revealedWaveIds) ? revealedWaveIds : []),
              ...(Array.isArray(seenWaveIds) ? seenWaveIds : []),
            ]),
          ],
          hidden: {
            photoIds: Array.isArray(hidden?.photoIds) ? hidden.photoIds : [],
            waveIds: Array.isArray(hidden?.waveIds) ? hidden.waveIds : [],
          },
          waves: Array.isArray(savedWaves) ? savedWaves : [],
          wavesKnown: Array.isArray(savedWaves),
        }));
        save("profile");
        save("ripples");
        save("revealed");

        if (profile.countryCode) {
          if (!cancelled) {
            setBoot("idle");
            setBootDetail(null);
          }
        } else {
          let fromServer: string | null = null;
          let countryError: string | null = null;
          try {
            fromServer = normalizeCountryCode(
              await withTimeout(
                backend.getCountry(),
                BOOT_COUNTRY_TIMEOUT_MS,
                "Profile request timed out",
              ),
            );
          } catch (error) {
            countryError =
              error instanceof Error && error.message
                ? error.message
                : "Couldn't reach SameWave";
            if (__DEV__) console.warn("[boot] getCountry failed", error);
          }
          if (cancelled) return;
          if (fromServer) {
            commit((current) => ({
              ...current,
              country: "known",
              profile: { ...current.profile, countryCode: fromServer, countrySaved: true },
            }));
            save("profile");
            setBoot("idle");
            setBootDetail(null);
          } else {
            // Server unreachable or no country yet — let them pick locally; sync later.
            commit((current) => ({ ...current, country: "needed" }));
            setBoot("idle");
            setBootDetail(null);
            if (countryError && __DEV__) {
              console.warn("[boot] continuing to country picker after", countryError);
            }
          }
        }

        void syncNow({ force: true });

        // Never prompts here: only refreshes the address if notifications are
        // already on in-app and at the OS. Skip register when the person opted out.
        const { readNotificationsEnabled } = await import("@/device/notificationPrefs");
        const wantsPush = await readNotificationsEnabled();
        if (wantsPush) {
          const address = await enablePushes({ ask: false });
          if (address && !cancelled) {
            await backend
              .registerPushToken(address, Platform.OS === "ios" ? "ios" : "android")
              .catch(() => undefined);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("[boot] failed", error);
        setBoot("failed");
        setBootDetail(
          error instanceof Error && error.message
            ? error.message
            : "Couldn't finish signing you in. Try again.",
        );
        commit((current) => ({
          ...current,
          ready: true,
          country: current.country === "known" ? "known" : "checking",
        }));
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(failTimer);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      clearTimeout(failTimer);
    };
  }, [accountId, backend, bootAttempt, commit, save, syncNow]);

  // Catch up whenever the app comes back to the front.
  useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") {
        setNow(Date.now());
        void syncNow();
      }
    });
    return () => subscription.remove();
  }, [syncNow]);

  useEffect(() => {
    configureForegroundPushes();
    return listenForPushes({
      onArrive: (target) => {
        // Foreground Wave: route to the reveal (or show the system banner via handler).
        if (target.waveId || (target.photoA && target.photoB)) {
          setPushTarget(target);
        }
        void syncNow({ force: true });
      },
      onOpen: (target) => {
        setPushTarget(target);
        void syncNow({ force: true });
      },
    });
  }, [syncNow]);

  const visibleWaves = useMemo(() => {
    const hiddenWaves = new Set(data.hidden.waveIds);
    const hiddenPhotos = new Set(data.hidden.photoIds);
    return sortWaves(
      data.waves.filter((w) => !hiddenWaves.has(w.id) && !hiddenPhotos.has(w.mine.photoId)),
    );
  }, [data.waves, data.hidden]);

  const newWaves = useMemo(
    () => unseenWaves(visibleWaves, data.seenWaveIds, data.profile.baselineAt),
    [visibleWaves, data.seenWaveIds, data.profile.baselineAt],
  );

  const pendingReveal = useMemo(
    () => unrevealedWaves(visibleWaves, data.revealedWaveIds, data.profile.baselineAt),
    [visibleWaves, data.revealedWaveIds, data.profile.baselineAt],
  );

  const travelling = useMemo(
    () => travellingRipple(data.ripples, visibleWaves, now),
    [data.ripples, visibleWaves, now],
  );

  const history = useMemo(() => {
    const hiddenPhotos = new Set(data.hidden.photoIds);
    return photoHistory(data.ripples, data.waves).filter((p) => !hiddenPhotos.has(p.photoId));
  }, [data.ripples, data.waves, data.hidden]);

  // While a Ripple is out and the app is open, look in on it now and then.
  const travellingId = travelling?.photoId ?? null;
  useEffect(() => {
    if (!travellingId) return;
    const timer = setInterval(() => {
      if (NativeAppState.currentState === "active") void syncNow({ force: true });
    }, TRAVEL_POLL_MS);
    return () => clearInterval(timer);
  }, [travellingId, syncNow]);

  const setCountry = useCallback(
    async (countryCode: string) => {
      const code = normalizeCountryCode(countryCode);
      if (!code) return;
      commit((current) => ({
        ...current,
        country: "known",
        profile: { ...current.profile, countryCode: code, countrySaved: false },
      }));
      save("profile");
      try {
        await backend.setCountry(code);
        commit((current) =>
          current.profile.countryCode === code
            ? { ...current, profile: { ...current.profile, countrySaved: true } }
            : current,
        );
        save("profile");
      } catch {
        // Kept on the device and sent again on the next sync.
      }
    },
    [backend, commit, save],
  );

  const sendRipple = useCallback(
    async (draft: RippleDraft): Promise<Ripple> => {
      // Preset-only: never upload a free-text Feeling or Topic.
      const emotion = emotionFor(draft.emotion)?.id ?? null;
      const topic = topicFor(draft.topic)?.id ?? null;
      if (!emotion || !topic) {
        throw new Error("Choose a Feeling and a Topic from the list before uploading.");
      }
      const forAccount = dataRef.current.accountId;
      const countryCode = dataRef.current.profile.countryCode;
      const [encoded, locatedCountryCode, recording] = await Promise.all([
        encodeForUpload(draft.photo.uri),
        draft.photo.source === "camera"
          ? countryHere()
          : draft.photo.coords
            ? countryAt(draft.photo.coords)
            : Promise.resolve(null),
        draft.recording
          ? readFileBase64(draft.recording.uri)
              .then((base64) => ({ base64, mime: draft.recording?.mime ?? "audio/mp4" }))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      const { captureCountryCode, captureCountrySource } = resolveCaptureCountry({
        photoSource: draft.photo.source,
        hasCoords: Boolean(draft.photo.coords),
        locatedCountryCode,
        homeCountryCode: countryCode,
      });
      const localUri = await keepRipplePhoto(encoded);
      let sent;
      try {
        sent = await backend.sendRipple({
          displayBase64: encoded.displayBase64,
          previewBase64: encoded.previewBase64,
          countryCode,
          captureCountryCode,
          captureCountrySource,
          capturedAt: draft.photo.takenAt,
          emotion,
          song: draft.song,
          topic,
          recording,
          localUri: localUri ?? draft.photo.uri,
        });
      } catch (error) {
        await removeRipplePhoto(localUri);
        throw error;
      }
      const ripple = newRipple({
        photoId: sent.photoId,
        sentAt: new Date().toISOString(),
        localUri,
        countryCode: captureCountryCode ?? countryCode,
        captureCountrySource,
        emotion,
        topic,
        vibe: draft.song ?? emotion,
        hasRecording: recording !== null,
        theme: topic ?? sent.theme,
        tags: sent.tags,
        subjects: sent.subjects,
      });
      if (dataRef.current.accountId === forAccount) {
        commit((current) => ({ ...current, ripples: mergeRipples([ripple], current.ripples) }));
        save("ripples");
        setNow(Date.now());
        setSentThisSession(true);
        // Upload only — Ripple-sent copy waits until Match offer (or reach).
        setPostSendRippleOffered(false);
        setPostSendWaiting(true);
        void syncNow({ force: true });
      }
      return ripple;
    },
    [backend, commit, save, syncNow],
  );

  const markPostSendRippleOffered = useCallback(() => setPostSendRippleOffered(true), []);

  const dismissPostSendWaiting = useCallback(() => {
    setPostSendWaiting(false);
    setPostSendRippleOffered(false);
  }, []);

  const recordMatchSeen = useCallback(
    (myPhotoId: string, theirIds: readonly string[]) => {
      if (!theirIds.length) return;
      commit((current) => ({
        ...current,
        ripples: current.ripples.map((r) =>
          r.photoId === myPhotoId
            ? {
                ...r,
                reach: {
                  ...r.reach,
                  offeredIds: [...new Set([...r.reach.offeredIds, ...theirIds])],
                },
              }
            : r,
        ),
      }));
      save("ripples");
    },
    [commit, save],
  );

  const finishMatchLook = useCallback(
    (myPhotoId: string, theirIds: readonly string[]) => {
      commit((current) => ({
        ...current,
        ripples: current.ripples.map((r) =>
          r.photoId === myPhotoId ? withReachPass(r, theirIds, Date.now()) : r,
        ),
      }));
      save("ripples");
    },
    [commit, save],
  );

  const respondToOffer = useCallback(
    async (offerId: string, verdict: "same" | "different") => {
      // Preview inbox fixture — no server write; local Wave after match-back.
      if (isPreviewOfferId(offerId)) {
        resolvePreviewOffer(
          offerId,
          verdict === "same" ? "accepted" : "dismissed",
        );
        const formed =
          verdict === "same" ? previewWaveAfterAccept(offerId) : null;
        commit((current) => {
          const without = current.offers.filter((o) => o.id !== offerId);
          if (!formed) {
            return { ...current, offers: without, offersKnown: true };
          }
          const waves = current.waves.some((w) => w.id === formed.id)
            ? current.waves
            : [formed, ...current.waves];
          return {
            ...current,
            offers: without,
            offersKnown: true,
            waves,
            wavesKnown: true,
          };
        });
        if (formed) save("waves");
        return;
      }

      if (verdict === "same") await backend.acceptOffer(offerId);
      else await backend.dismissOffer(offerId);
      // Optimistic removal; sync refreshes mutual Waves after Wave-back.
      commit((current) => ({
        ...current,
        offers: current.offers.filter((o) => o.id !== offerId),
      }));
      if (verdict === "same") {
        try {
          const waves = await backend.listWaves();
          const cached = await withCachedPhotos(waves);
          commit((current) => ({ ...current, waves: cached, wavesKnown: true }));
          save("waves");
        } catch {
          // Offer already removed; next sync will pick up the Wave.
        }
      }
    },
    [backend, commit, save],
  );

  const markWaveSeen = useCallback(
    (waveId: string) => {
      if (dataRef.current.seenWaveIds.includes(waveId)) return;
      commit((current) => ({ ...current, seenWaveIds: [...current.seenWaveIds, waveId] }));
      save("seen");
    },
    [commit, save],
  );

  const markWaveRevealed = useCallback(
    (waveId: string) => {
      if (!waveId) return;
      if (dataRef.current.revealedWaveIds.includes(waveId)) return;
      commit((current) => ({
        ...current,
        revealedWaveIds: withRevealedWaveId(current.revealedWaveIds, waveId),
        // Opening the reveal also counts as seen for the map badge.
        seenWaveIds: current.seenWaveIds.includes(waveId)
          ? current.seenWaveIds
          : [...current.seenWaveIds, waveId],
      }));
      save("revealed");
      save("seen");
    },
    [commit, save],
  );

  const shouldRevealWaveId = useCallback(
    (waveId: string) =>
      Boolean(waveId) && !dataRef.current.revealedWaveIds.includes(waveId),
    [],
  );

  const deletePhoto = useCallback(
    async (photoId: string) => {
      let serverGone = false;
      try {
        await backend.deletePhoto(photoId);
      } catch (error) {
        // Already missing on the server — still clear the local ledger.
        if (errorKind(error) === "not-found") serverGone = true;
        else throw error;
      }
      const ripple = dataRef.current.ripples.find((r) => r.photoId === photoId);
      commit((current) => ({
        ...current,
        ripples: current.ripples.filter((r) => r.photoId !== photoId),
        hidden: {
          ...current.hidden,
          photoIds: [...new Set([...current.hidden.photoIds, photoId])],
        },
      }));
      save("ripples");
      save("hidden");
      await removeRipplePhoto(ripple?.localUri ?? null);
      if (serverGone && __DEV__) {
        console.warn("[deletePhoto] server already missing", photoId);
      }
    },
    [backend, commit, save],
  );

  const reportWave = useCallback(
    async (wave: Wave, reason: string) => {
      await backend.reportPhoto(wave.theirs.photoId, reason);
      commit((current) => ({
        ...current,
        hidden: { ...current.hidden, waveIds: [...new Set([...current.hidden.waveIds, wave.id])] },
      }));
      save("hidden");
    },
    [backend, commit, save],
  );

  const askForPushes = useCallback(async (): Promise<PushPermission> => {
    commit((current) => ({ ...current, profile: { ...current.profile, pushAsked: true } }));
    save("profile");
    const { readNotificationsEnabled } = await import("@/device/notificationPrefs");
    if (!(await readNotificationsEnabled())) {
      return pushPermission();
    }
    const address = await enablePushes({ ask: true });
    if (address) {
      await backend
        .registerPushToken(address, Platform.OS === "ios" ? "ios" : "android")
        .catch(() => undefined);
    }
    return pushPermission();
  }, [backend, commit, save]);

  const clearPushTarget = useCallback(() => setPushTarget(null), []);

  const value = useMemo<AppStateValue>(
    () => ({
      ready: data.ready,
      country: data.country,
      countryCode: data.profile.countryCode,
      boot,
      bootDetail,
      retryBoot,
      waves: visibleWaves,
      wavesKnown: data.wavesKnown,
      offers: data.offers,
      offersKnown: data.offersKnown,
      respondToOffer,
      newWaves,
      unrevealedWaves: pendingReveal,
      markWaveRevealed,
      shouldRevealWave: shouldRevealWaveId,
      travelling,
      ripples: data.ripples,
      history,
      sync: data.sync,
      backend,
      pushTarget,
      clearPushTarget,
      setCountry,
      sendRipple,
      postSendWaiting,
      postSendRippleOffered,
      markPostSendRippleOffered,
      dismissPostSendWaiting,
      syncNow,
      recordMatchSeen,
      finishMatchLook,
      markWaveSeen,
      deletePhoto,
      reportWave,
      shouldAskForPushes: data.ready && !data.profile.pushAsked && sentThisSession,
      askForPushes,
    }),
    [
      data.ready,
      data.country,
      data.profile.countryCode,
      data.profile.pushAsked,
      data.ripples,
      boot,
      bootDetail,
      retryBoot,
      sentThisSession,
      postSendWaiting,
      postSendRippleOffered,
      markPostSendRippleOffered,
      dismissPostSendWaiting,
      data.wavesKnown,
      data.offers,
      data.offersKnown,
      data.sync,
      visibleWaves,
      newWaves,
      pendingReveal,
      markWaveRevealed,
      shouldRevealWaveId,
      travelling,
      history,
      backend,
      pushTarget,
      clearPushTarget,
      setCountry,
      sendRipple,
      syncNow,
      recordMatchSeen,
      finishMatchLook,
      respondToOffer,
      markWaveSeen,
      deletePhoto,
      reportWave,
      askForPushes,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
