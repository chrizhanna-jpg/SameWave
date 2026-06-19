import { Audio } from "expo-av";

import { isMuted, markUserInteracted, onMuteChange } from "@/utils/audio";
import { setFirecircleFocusSlot as publishFirecircleFocusSlot } from "@/utils/firecircleFocus";
import { dbToLinear } from "@/utils/dbLinear";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const OCEAN_LOOP = require("../assets/audio/firecircle/wave_loop.wav");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FIRE_LOOP = require("../assets/audio/firecircle/fire_loop.wav");

const DB = {
  ocean: -14,
  fire: -17,
  duckOcean: -10,
  duckFire: -11,
} as const;

const DUCK_MS = 1200;
const ZOOM_OUT_BREAK = 0.92;
const ZOOM_OUT_GAIN = 0.55;

let oceanSound: Audio.Sound | null = null;
let fireSound: Audio.Sound | null = null;

let started = false;
let duckUntil = 0;
let mapScale = 1;
let muteHooked = false;

function ensureMuteHook(): void {
  if (muteHooked) return;
  muteHooked = true;
  onMuteChange(() => {
    void syncFirecirclePlayback();
  });
}

async function syncFirecirclePlayback(): Promise<void> {
  if (!started || !oceanSound || !fireSound) return;
  try {
    if (isMuted()) {
      await oceanSound.pauseAsync();
      await fireSound.pauseAsync();
      return;
    }
    await applyVolumes();
    const playIfPaused = async (s: Audio.Sound) => {
      const status = await s.getStatusAsync();
      if (status.isLoaded && !status.isPlaying) {
        await s.playAsync();
      }
    };
    await playIfPaused(oceanSound);
    await playIfPaused(fireSound);
  } catch {
    /* non-fatal */
  }
}

function zoomMul(): number {
  return mapScale < ZOOM_OUT_BREAK ? ZOOM_OUT_GAIN : 1;
}

function effectiveLinear(baseDb: number, duckDb: number): number {
  const active = Date.now() < duckUntil;
  const db = active ? duckDb : baseDb;
  return dbToLinear(db) * zoomMul();
}

async function ensureLoaded() {
  if (oceanSound && fireSound) return;
  const o = await Audio.Sound.createAsync(OCEAN_LOOP, {
    isLooping: true,
    volume: 0,
    shouldPlay: false,
  });
  const f = await Audio.Sound.createAsync(FIRE_LOOP, {
    isLooping: true,
    volume: 0,
    shouldPlay: false,
  });
  oceanSound = o.sound;
  fireSound = f.sound;
}

async function applyVolumes() {
  if (!oceanSound || !fireSound) return;
  const vo = effectiveLinear(DB.ocean, DB.duckOcean);
  const vf = effectiveLinear(DB.fire, DB.duckFire);
  try {
    await oceanSound.setVolumeAsync(vo);
    await fireSound.setVolumeAsync(vf);
  } catch {
    /* non-fatal */
  }
}

let volTimer: ReturnType<typeof setInterval> | null = null;

function startVolumePump() {
  if (volTimer) return;
  volTimer = setInterval(() => {
    void applyVolumes();
  }, 160);
}

function stopVolumePump() {
  if (volTimer) {
    clearInterval(volTimer);
    volTimer = null;
  }
}

export function duckFirecircleActivity(): void {
  duckUntil = Date.now() + DUCK_MS;
  void applyVolumes();
}

export function setFirecircleMapScale(s: number): void {
  if (!Number.isFinite(s) || s <= 0) return;
  mapScale = s;
}

/** Stereo orbit focus — drives Wavefire center theme carousel. */
export function setFirecircleFocusSlot(index: number): void {
  publishFirecircleFocusSlot(index);
}

export async function startFirecircleAmbience(): Promise<void> {
  ensureMuteHook();
  markUserInteracted();
  if (started) {
    void syncFirecirclePlayback();
    return;
  }
  started = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    /* non-fatal */
  }
  await ensureLoaded();
  await applyVolumes();
  const play = async (s: Audio.Sound | null) => {
    if (!s) return;
    try {
      await s.setPositionAsync(0);
      await s.playAsync();
    } catch {
      /* non-fatal */
    }
  };
  if (!isMuted()) {
    await play(oceanSound);
    await play(fireSound);
  }
  startVolumePump();
}

export async function stopFirecircleAmbience(): Promise<void> {
  started = false;
  stopVolumePump();
  const unload = async (s: Audio.Sound | null) => {
    if (!s) return;
    try {
      await s.stopAsync();
      await s.unloadAsync();
    } catch {
      /* non-fatal */
    }
  };
  await unload(oceanSound);
  await unload(fireSound);
  oceanSound = null;
  fireSound = null;
}
