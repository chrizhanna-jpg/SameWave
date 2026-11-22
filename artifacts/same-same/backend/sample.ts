/**
 * In-memory stand-in server used only by unit tests. The app never imports
 * this module — production and Expo Go always talk to the real HTTP API.
 */
import type { Wave } from "../core/types";
import {
  BackendError,
  type Backend,
  type RippleUpload,
  type SentRipple,
  type WaveDetail,
} from "./types";

export interface SampleStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export interface SampleBackend extends Backend {
  /** Makes any Wave that is on its way arrive on the next sync. */
  arriveNow(): Promise<void>;
  reset(): Promise<void>;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How long a sample Ripple travels before its Wave arrives. */
export const SAMPLE_TRAVEL_MS = 20_000;

function stock(id: string): string {
  return `https://images.unsplash.com/photo-${id}?w=720&q=70&auto=format&fit=crop`;
}

interface Seed {
  id: string;
  mine: { photo: string; country: string; vibe: string | null };
  theirs: { photo: string; country: string; vibe: string | null };
  /** When the user's photo was taken. */
  takenAt: string;
  /** How long after that the other photo was taken. */
  gapMs: number;
}

/** Fixed dates in the past, so these are already on the map and never "arrive". */
const SEEDS: readonly Seed[] = [
  {
    id: "sample-hour-country",
    mine: { photo: "1495474472287-4d71bcdd2085", country: "GB", vibe: "content" },
    theirs: { photo: "1509042239860-f550ce710b93", country: "GB", vibe: "calm" },
    takenAt: "2026-10-30T08:10:00Z",
    gapMs: 20 * 60 * 1000,
  },
  {
    id: "sample-day-continent",
    mine: { photo: "1568901346375-23c9450c58cd", country: "GB", vibe: "cheers" },
    theirs: { photo: "1551782450-a2132b4ba21d", country: "FR", vibe: "joy" },
    takenAt: "2026-10-24T12:30:00Z",
    gapMs: 5 * HOUR,
  },
  {
    id: "sample-week",
    mine: { photo: "1573865526739-10659fec78a5", country: "GB", vibe: "love" },
    theirs: { photo: "1592194996308-7b43878e84a6", country: "JP", vibe: "joy" },
    takenAt: "2026-10-12T17:00:00Z",
    gapMs: 3 * DAY,
  },
  {
    id: "sample-month-country",
    mine: { photo: "1506905925346-21bda4d32df4", country: "GB", vibe: "wonder" },
    theirs: { photo: "1470770841072-f978cf4d019e", country: "GB", vibe: null },
    takenAt: "2026-09-18T06:45:00Z",
    gapMs: 20 * DAY,
  },
  {
    id: "sample-continent",
    mine: { photo: "1419242902214-272b3f66ee7a", country: "GB", vibe: "wonder" },
    theirs: { photo: "1444080748397-f442aa95c3e5", country: "IT", vibe: "hope" },
    takenAt: "2026-08-02T22:15:00Z",
    gapMs: 95 * DAY,
  },
  {
    id: "sample-no-bonus",
    mine: { photo: "1500382017468-9049fed747ef", country: "GB", vibe: "calm" },
    theirs: { photo: "1507525428034-b723cf961d3e", country: "BR", vibe: "nostalgia" },
    takenAt: "2026-06-20T19:40:00Z",
    gapMs: 120 * DAY,
  },
  {
    id: "sample-day-country",
    mine: { photo: "1497935586351-b67a49e012bf", country: "GB", vibe: "content" },
    theirs: { photo: "1542990253-0d0f5be5f0ed", country: "GB", vibe: "gratitude" },
    takenAt: "2026-10-05T09:20:00Z",
    gapMs: 7 * HOUR,
  },
  {
    id: "sample-hour",
    mine: { photo: "1548247416-ec66f4900b2e", country: "GB", vibe: "love" },
    theirs: { photo: "1587300003388-59208cc962cb", country: "US", vibe: "joy" },
    takenAt: "2026-09-27T15:05:00Z",
    gapMs: 40 * 60 * 1000,
  },
];

/** What answers each Ripple sent in sample mode, in turn: one per bonus level. */
const ANSWERS: readonly { photo: string; country: "same" | string; gapMs: number; vibe: string }[] = [
  { photo: "1469474968028-56623f02e42e", country: "FR", gapMs: 2 * HOUR, vibe: "wonder" },
  { photo: "1472214103451-9374bd1c798e", country: "same", gapMs: 25 * 60 * 1000, vibe: "calm" },
  { photo: "1512100356356-de1b84283e18", country: "AU", gapMs: 4 * DAY, vibe: "joy" },
  { photo: "1565299624946-b28f40a0ae38", country: "same", gapMs: 18 * DAY, vibe: "cheers" },
  { photo: "1565958011703-44f9829ba187", country: "DE", gapMs: 70 * DAY, vibe: "content" },
  { photo: "1497206365907-f5e630693df0", country: "BR", gapMs: 90 * DAY, vibe: "hope" },
];

interface SampleRipple {
  photoId: string;
  uri: string;
  country: string;
  /** Song / vibe clip id (musicGenre). */
  vibe: string | null;
  /** Feeling id — distinct from vibe. */
  emotion: string | null;
  topic: string | null;
  recording: string | null;
  takenAt: string;
  answer: number;
  /** When its Wave arrives. */
  dueAt: number;
}

interface SampleState {
  country: string | null;
  ripples: SampleRipple[];
}

const EMPTY: SampleState = { country: "GB", ripples: [] };

export function createSampleBackend(
  store: SampleStore,
  clock: () => number = Date.now,
): SampleBackend {
  let state: SampleState | null = null;

  async function load(): Promise<SampleState> {
    if (state) return state;
    try {
      const raw = await store.read();
      const parsed = raw ? (JSON.parse(raw) as Partial<SampleState>) : null;
      state = {
        country: parsed?.country === undefined ? EMPTY.country : parsed.country,
        ripples: Array.isArray(parsed?.ripples) ? parsed.ripples : [],
      };
    } catch {
      state = { ...EMPTY, ripples: [] };
    }
    return state;
  }

  async function save(): Promise<void> {
    if (state) await store.write(JSON.stringify(state)).catch(() => {});
  }

  function seedWave(seed: Seed): Wave {
    const theirsAt = new Date(Date.parse(seed.takenAt) + seed.gapMs).toISOString();
    return {
      id: seed.id,
      formedAt: new Date(Date.parse(theirsAt) + 2 * DAY).toISOString(),
      mine: {
        photoId: `${seed.id}-mine`,
        uri: stock(seed.mine.photo),
        countryCode: seed.mine.country,
        takenAt: new Date(Date.parse(seed.takenAt)).toISOString(),
      },
      theirs: {
        photoId: `${seed.id}-theirs`,
        uri: stock(seed.theirs.photo),
        countryCode: seed.theirs.country,
        takenAt: theirsAt,
      },
    };
  }

  function answerFor(ripple: SampleRipple) {
    return ANSWERS[ripple.answer % ANSWERS.length] as (typeof ANSWERS)[number];
  }

  function rippleWave(ripple: SampleRipple): Wave {
    const answer = answerFor(ripple);
    return {
      id: `sample-wave-${ripple.photoId}`,
      formedAt: new Date(ripple.dueAt).toISOString(),
      mine: {
        photoId: ripple.photoId,
        uri: ripple.uri,
        countryCode: ripple.country,
        takenAt: ripple.takenAt,
      },
      theirs: {
        photoId: `${ripple.photoId}-answer`,
        uri: stock(answer.photo),
        countryCode: answer.country === "same" ? ripple.country : answer.country,
        takenAt: new Date(Date.parse(ripple.takenAt) - answer.gapMs).toISOString(),
      },
    };
  }

  return {
    async getCountry() {
      return (await load()).country;
    },

    async setCountry(countryCode) {
      (await load()).country = countryCode;
      await save();
    },

    async sendRipple(upload: RippleUpload): Promise<SentRipple> {
      const current = await load();
      const now = clock();
      const photoId = `sample-ripple-${now}`;
      current.ripples.push({
        photoId,
        uri: upload.localUri,
        country: upload.captureCountryCode ?? upload.countryCode ?? current.country ?? "GB",
        vibe: upload.song ?? null,
        emotion: upload.emotion ?? null,
        topic: upload.topic,
        recording: upload.recording
          ? `data:${upload.recording.mime};base64,${upload.recording.base64}`
          : null,
        takenAt: upload.capturedAt ?? new Date(now).toISOString(),
        answer: current.ripples.length,
        dueAt: now + SAMPLE_TRAVEL_MS,
      });
      await save();
      return {
        photoId,
        theme: upload.topic ?? "sample",
        tags: upload.topic ? [upload.topic] : [],
        subjects: [],
      };
    },

    async deletePhoto(photoId) {
      const current = await load();
      current.ripples = current.ripples.filter((r) => r.photoId !== photoId);
      await save();
    },

    async reportPhoto() {},

    async findCandidates() {
      return [];
    },

    async offer() {
      return "skipped";
    },

    async pass() {},

    async listOffers() {
      return [];
    },

    async acceptOffer() {},

    async listWaves(): Promise<Wave[]> {
      const current = await load();
      const now = clock();
      const arrived = current.ripples.filter((r) => r.dueAt <= now).map(rippleWave);
      return [...arrived, ...SEEDS.map(seedWave)];
    },

    async getWaveDetail(wave: Wave): Promise<WaveDetail> {
      const seed = SEEDS.find((s) => s.id === wave.id);
      if (seed) {
        // Seeds only store vibe (clip); feeling is unknown → null (not vibe).
        return {
          mine: {
            vibe: seed.mine.vibe,
            recordingUri: null,
            emotion: null,
            topic: null,
          },
          theirs: {
            vibe: seed.theirs.vibe,
            recordingUri: null,
            emotion: null,
            topic: null,
          },
        };
      }
      const ripple = (await load()).ripples.find((r) => r.photoId === wave.mine.photoId);
      if (!ripple) throw new BackendError("not-found", "No such sample Wave", 404);
      const answer = answerFor(ripple);
      return {
        mine: {
          vibe: ripple.vibe,
          recordingUri: ripple.recording,
          emotion: ripple.emotion,
          topic: ripple.topic,
        },
        theirs: {
          vibe: answer.vibe,
          recordingUri: null,
          // Sample answers only have a clip vibe — no separate feeling.
          emotion: null,
          topic: null,
        },
      };
    },

    async registerPushToken() {},

    async photoSource(photoId) {
      const ripple = (await load()).ripples.find((r) => r.photoId === photoId);
      if (!ripple) throw new BackendError("not-found", "No such sample photo", 404);
      return { uri: ripple.uri };
    },

    async arriveNow() {
      const current = await load();
      const now = clock();
      for (const ripple of current.ripples) {
        if (ripple.dueAt > now) ripple.dueAt = now;
      }
      await save();
    },

    async reset() {
      state = { ...EMPTY, ripples: [] };
      await save();
    },
  };
}
