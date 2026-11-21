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
import { createSampleBackend, type SampleBackend } from "@/backend/sample";
import { errorKind, type Backend } from "@/backend/types";
import { apiOrigin, SAMPLE_MODE } from "@/config/env";
import {
  mergeRipples,
  newRipple,
  photoHistory,
  ripplesFromLegacyState,
  type HistoryPhoto,
} from "@/core/history";
import {
  MATCH,
  offersToAccept,
  reachDecision,
  selectReachTargets,
  travellingRipple,
  withReachPass,
} from "@/core/reach";
import type { Candidate, Ripple, Wave } from "@/core/types";
import { sortWaves, unseenWaves } from "@/core/waves";
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
  deviceKey,
  LEGACY_KEYS,
  legacyDeviceId,
  readJson,
  readText,
  writeJson,
  writeText,
} from "@/device/storage";
import { useSession } from "@/state/session";

export type SyncStatus = "idle" | "syncing" | "offline" | "failed";
export type CountryStatus = "checking" | "known" | "needed";

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
  seenWaveIds: string[];
  hidden: Hidden;
  sync: SyncStatus;
}

export interface AppStateValue {
  ready: boolean;
  sample: boolean;
  country: CountryStatus;
  countryCode: string | null;
  /** Waves on the map, newest first. */
  waves: Wave[];
  wavesKnown: boolean;
  /** Waves that have arrived and not been opened, oldest first. */
  newWaves: Wave[];
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
  syncNow(options?: { force?: boolean }): Promise<void>;
  markWaveSeen(waveId: string): void;
  deletePhoto(photoId: string): Promise<void>;
  reportWave(wave: Wave, reason: string): Promise<void>;
  /** True once the first Ripple has gone and the notification prompt has not been shown. */
  shouldAskForPushes: boolean;
  askForPushes(): Promise<PushPermission>;
  /** Present only in sample mode. */
  sampleTools: { arriveNow(): Promise<void>; reset(): Promise<void> } | null;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside AppStateProvider");
  return value;
}

const SYNC_MIN_GAP_MS = 60_000;
const TRAVEL_POLL_MS = SAMPLE_MODE ? 4_000 : 3 * 60_000;
const MAX_EXCLUDE_IDS = 200;

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
    seenWaveIds: [],
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

  const backend = useMemo<Backend>(() => {
    if (SAMPLE_MODE) {
      const key = deviceKey("sample-server");
      return createSampleBackend({
        read: () => readText(key),
        write: (value) => writeText(key, value),
      });
    }
    return createHttpBackend({ origin: apiOrigin(), getToken, getDeviceId: legacyDeviceId });
  }, [getToken]);

  const [data, setData] = useState<Data>(emptyData);
  const dataRef = useRef(data);
  const [now, setNow] = useState(() => Date.now());
  const [pushTarget, setPushTarget] = useState<PushTarget | null>(null);
  const [sentThisSession, setSentThisSession] = useState(false);

  /** Updates what the screens see and what background work reads, together. */
  const commit = useCallback((change: (current: Data) => Data) => {
    const next = change(dataRef.current);
    dataRef.current = next;
    setData(next);
    return next;
  }, []);

  const save = useCallback((name: "profile" | "ripples" | "seen" | "hidden" | "waves") => {
    const current = dataRef.current;
    if (!current.accountId) return;
    const key = accountKey(current.accountId, name);
    if (name === "profile") void writeJson(key, current.profile);
    else if (name === "ripples") void writeJson(key, current.ripples);
    else if (name === "seen") void writeJson(key, current.seenWaveIds);
    else if (name === "hidden") void writeJson(key, current.hidden);
    else void writeJson(key, wavesForStorage(current.waves));
  }, []);

  const syncing = useRef<Promise<void> | null>(null);
  const lastSyncAt = useRef(0);

  /** Looks once for a match for the latest Ripple, if it is time to. */
  const reach = useCallback(
    async (forAccount: string): Promise<boolean> => {
      const ripple = dataRef.current.ripples[0];
      if (!ripple) return false;
      const decision = reachDecision(ripple, dataRef.current.waves, Date.now());
      if (!decision.due) return false;

      const looked: string[] = [];
      let targets: Candidate[] = [];
      for (let page = 0; page < MATCH.maxPages && targets.length === 0; page++) {
        const topic = ripple.topic ?? ripple.theme ?? null;
        const emotion = ripple.emotion ?? ripple.vibe ?? null;
        const candidates = await backend.findCandidates({
          theme: topic ?? ripple.theme,
          tags: ripple.tags,
          subjects: ripple.subjects,
          emotion,
          limit: MATCH.pageSize,
          excludeIds: [...ripple.reach.offeredIds, ...looked].slice(-MAX_EXCLUDE_IDS),
        });
        targets = selectReachTargets(candidates, {
          minScore: decision.minScore,
          limit: MATCH.offersPerPass,
          alreadyOffered: ripple.reach.offeredIds,
          emotion,
          topic,
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

      const [offers, firstWaves] = await Promise.all([backend.listOffers(), backend.listWaves()]);
      let waves = firstWaves;
      let changed = false;
      for (const offer of offersToAccept(offers, waves)) {
        try {
          await backend.acceptOffer(offer.id);
          changed = true;
        } catch (error) {
          // An offer whose photo has since been removed cannot be accepted. Leave it.
          if (errorKind(error) === "unreachable") throw error;
        }
      }
      if (changed) waves = await backend.listWaves();
      if (!stillCurrent()) return;

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

  // Load what the device remembers for this account, then catch up with the server.
  useEffect(() => {
    lastSyncAt.current = 0;
    if (!accountId) {
      commit(() => emptyData());
      return;
    }
    let cancelled = false;
    commit(() => ({ ...emptyData(), accountId }));
    void (async () => {
      const [savedProfile, savedRipples, seenWaveIds, hidden, savedWaves] = await Promise.all([
        readJson<Profile | null>(accountKey(accountId, "profile"), null),
        readJson<Ripple[]>(accountKey(accountId, "ripples"), []),
        readJson<string[]>(accountKey(accountId, "seen"), []),
        readJson<Hidden>(accountKey(accountId, "hidden"), { photoIds: [], waveIds: [] }),
        readJson<Wave[] | null>(accountKey(accountId, "waves"), null),
      ]);
      let profile: Profile = { ...freshProfile(), ...(savedProfile ?? {}) };
      let ripples = Array.isArray(savedRipples) ? savedRipples : [];
      if (!profile.migrated && !SAMPLE_MODE) {
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
        hidden: {
          photoIds: Array.isArray(hidden?.photoIds) ? hidden.photoIds : [],
          waveIds: Array.isArray(hidden?.waveIds) ? hidden.waveIds : [],
        },
        waves: Array.isArray(savedWaves) ? savedWaves : [],
        wavesKnown: Array.isArray(savedWaves),
      }));
      save("profile");
      save("ripples");

      if (!profile.countryCode) {
        let fromServer: string | null = null;
        try {
          fromServer = normalizeCountryCode(await backend.getCountry());
        } catch {
          // Unknown for now; the person can choose, and it is saved when the server answers.
        }
        if (cancelled) return;
        commit((current) => ({
          ...current,
          country: fromServer ? "known" : "needed",
          profile: fromServer
            ? { ...current.profile, countryCode: fromServer, countrySaved: true }
            : current.profile,
        }));
        save("profile");
      }

      void syncNow({ force: true });

      // Never prompts here: only refreshes the address if notifications are already on.
      const address = await enablePushes({ ask: false });
      if (address && !cancelled) {
        await backend
          .registerPushToken(address, Platform.OS === "ios" ? "ios" : "android")
          .catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, backend, commit, save, syncNow]);

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
      onArrive: () => void syncNow({ force: true }),
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
      const forAccount = dataRef.current.accountId;
      const countryCode = dataRef.current.profile.countryCode;
      const [encoded, captureCountryCode, recording] = await Promise.all([
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
      const localUri = await keepRipplePhoto(encoded);
      let sent;
      try {
        sent = await backend.sendRipple({
          displayBase64: encoded.displayBase64,
          previewBase64: encoded.previewBase64,
          countryCode,
          captureCountryCode,
          capturedAt: draft.photo.takenAt,
          emotion: draft.emotion,
          song: draft.song,
          topic: draft.topic,
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
        emotion: draft.emotion,
        topic: draft.topic,
        vibe: draft.song ?? draft.emotion,
        hasRecording: recording !== null,
        theme: draft.topic ?? sent.theme,
        tags: sent.tags,
        subjects: sent.subjects,
      });
      if (dataRef.current.accountId === forAccount) {
        commit((current) => ({ ...current, ripples: mergeRipples([ripple], current.ripples) }));
        save("ripples");
        setNow(Date.now());
        setSentThisSession(true);
        void syncNow({ force: true });
      }
      return ripple;
    },
    [backend, commit, save, syncNow],
  );

  const markWaveSeen = useCallback(
    (waveId: string) => {
      if (dataRef.current.seenWaveIds.includes(waveId)) return;
      commit((current) => ({ ...current, seenWaveIds: [...current.seenWaveIds, waveId] }));
      save("seen");
    },
    [commit, save],
  );

  const deletePhoto = useCallback(
    async (photoId: string) => {
      await backend.deletePhoto(photoId);
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
    const address = await enablePushes({ ask: true });
    if (address) {
      await backend
        .registerPushToken(address, Platform.OS === "ios" ? "ios" : "android")
        .catch(() => undefined);
    }
    return pushPermission();
  }, [backend, commit, save]);

  const clearPushTarget = useCallback(() => setPushTarget(null), []);

  const sampleTools = useMemo(() => {
    if (!SAMPLE_MODE) return null;
    const sample = backend as SampleBackend;
    return {
      arriveNow: async () => {
        await sample.arriveNow();
        await syncNow({ force: true });
      },
      reset: async () => {
        await sample.reset();
        commit((current) => ({
          ...current,
          ripples: [],
          seenWaveIds: [],
          hidden: { photoIds: [], waveIds: [] },
        }));
        save("ripples");
        save("seen");
        save("hidden");
        await syncNow({ force: true });
      },
    };
  }, [backend, commit, save, syncNow]);

  const value = useMemo<AppStateValue>(
    () => ({
      ready: data.ready,
      sample: SAMPLE_MODE,
      country: data.country,
      countryCode: data.profile.countryCode,
      waves: visibleWaves,
      wavesKnown: data.wavesKnown,
      newWaves,
      travelling,
      history,
      sync: data.sync,
      backend,
      pushTarget,
      clearPushTarget,
      setCountry,
      sendRipple,
      syncNow,
      markWaveSeen,
      deletePhoto,
      reportWave,
      shouldAskForPushes: data.ready && !data.profile.pushAsked && sentThisSession,
      askForPushes,
      sampleTools,
    }),
    [
      data.ready,
      data.country,
      data.profile.countryCode,
      data.profile.pushAsked,
      sentThisSession,
      data.wavesKnown,
      data.sync,
      visibleWaves,
      newWaves,
      travelling,
      history,
      backend,
      pushTarget,
      clearPushTarget,
      setCountry,
      sendRipple,
      syncNow,
      markWaveSeen,
      deletePhoto,
      reportWave,
      askForPushes,
      sampleTools,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
