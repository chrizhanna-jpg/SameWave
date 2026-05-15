import { Audio } from "expo-av";

import { markUserInteracted } from "@/utils/audio";
import { dbToLinear } from "@/utils/dbLinear";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WAVE_LOOP = require("../assets/audio/firecircle/wave_loop.wav");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FIRE_LOOP = require("../assets/audio/firecircle/fire_loop.wav");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CHATTER_LOOP = require("../assets/audio/firecircle/chatter_loop.wav");

const DB = {
  wave: -12,
  fire: -18,
  chatter: -20,
  duckWave: -8,
  duckFire: -8,
  duckChatter: -12,
} as const;

const DUCK_MS = 1200;
const ZOOM_OUT_BREAK = 0.92;
const ZOOM_OUT_GAIN = 0.55;

let waveSound: Audio.Sound | null = null;
let fireSound: Audio.Sound | null = null;
let chatterSound: Audio.Sound | null = null;

let started = false;
let duckUntil = 0;
let mapScale = 1;
let focusSlot = 0;

function zoomMul(): number {
  return mapScale < ZOOM_OUT_BREAK ? ZOOM_OUT_GAIN : 1;
}

function effectiveLinear(baseDb: number, duckDb: number): number {
  const active = Date.now() < duckUntil;
  const db = active ? duckDb : baseDb;
  return dbToLinear(db) * zoomMul();
}

function panForStem(which: "wave" | "fire" | "chatter"): number {
  const u = focusSlot / 6 - 0.5;
  const pan = Math.max(-1, Math.min(1, u * 1.8));
  if (which === "wave") return Math.max(-1, Math.min(1, pan - 0.2));
  if (which === "fire") return pan;
  return Math.max(-1, Math.min(1, pan + 0.18));
}

async function ensureLoaded() {
  if (waveSound && fireSound && chatterSound) return;
  const w = await Audio.Sound.createAsync(WAVE_LOOP, {
    isLooping: true,
    volume: 0,
    shouldPlay: false,
  });
  const f = await Audio.Sound.createAsync(FIRE_LOOP, {
    isLooping: true,
    volume: 0,
    shouldPlay: false,
  });
  const c = await Audio.Sound.createAsync(CHATTER_LOOP, {
    isLooping: true,
    volume: 0,
    shouldPlay: false,
  });
  waveSound = w.sound;
  fireSound = f.sound;
  chatterSound = c.sound;
}

async function applyVolumes() {
  if (!waveSound || !fireSound || !chatterSound) return;
  const vw = effectiveLinear(DB.wave, DB.duckWave);
  const vf = effectiveLinear(DB.fire, DB.duckFire);
  const vc = effectiveLinear(DB.chatter, DB.duckChatter);
  try {
    await waveSound.setVolumeAsync(vw, panForStem("wave"));
    await fireSound.setVolumeAsync(vf, panForStem("fire"));
    await chatterSound.setVolumeAsync(vc, panForStem("chatter"));
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

/** Advance stereo focus around the seven tile slots (called from UI timer). */
export function setFirecircleFocusSlot(index: number): void {
  focusSlot = ((index % 7) + 7) % 7;
}

export async function startFirecircleAmbience(): Promise<void> {
  markUserInteracted();
  if (started) return;
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
  await play(waveSound);
  await play(fireSound);
  await play(chatterSound);
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
  await unload(waveSound);
  await unload(fireSound);
  await unload(chatterSound);
  waveSound = null;
  fireSound = null;
  chatterSound = null;
}
