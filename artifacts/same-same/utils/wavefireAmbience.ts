// Wavefire ambience: single beach + campfire loop (separate from global vibe
// clip singleton in utils/audio.ts so Atlas does not steal Match playback).

import { Audio } from "expo-av";

import { dbToLinear } from "@/utils/dbLinear";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WAVEFIRE_AMBIENCE = require("../assets/audio/firecircle/wavefire_ambience.mp3");

const DB = -11;

const ZOOM_OUT_BREAK = 0.92;
const ZOOM_OUT_GAIN = 0.55;

let ambienceSound: Audio.Sound | null = null;
/** Bumped on every stop so in-flight start() cannot play after leaving the screen. */
let playSession = 0;
let mapScale = 1;

function zoomMul(): number {
  return mapScale < ZOOM_OUT_BREAK ? ZOOM_OUT_GAIN : 1;
}

async function applyVolume(): Promise<void> {
  if (!ambienceSound) return;
  try {
    await ambienceSound.setVolumeAsync(dbToLinear(DB) * zoomMul());
  } catch {
    /* non-fatal */
  }
}

/** Softer when the user zooms out on the Wavefire map. */
export function setWavefireMapScale(s: number): void {
  if (!Number.isFinite(s) || s <= 0) return;
  mapScale = s;
  void applyVolume();
}

async function ensureLoaded(): Promise<boolean> {
  if (ambienceSound) return true;
  try {
    const { sound } = await Audio.Sound.createAsync(WAVEFIRE_AMBIENCE, {
      isLooping: true,
      volume: 0,
      shouldPlay: false,
    });
    ambienceSound = sound;
    return true;
  } catch {
    return false;
  }
}

function aborted(session: number): boolean {
  return session !== playSession;
}

export async function startWavefireAmbience(): Promise<void> {
  const session = playSession;
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

  const ok = await ensureLoaded();
  if (!ok || aborted(session)) return;

  await applyVolume();
  if (aborted(session)) return;

  try {
    const status = await ambienceSound!.getStatusAsync();
    if (
      status.isLoaded &&
      status.durationMillis != null &&
      status.durationMillis > 2000
    ) {
      const offsetMs = Math.floor(
        Math.random() * (status.durationMillis - 1000),
      );
      await ambienceSound!.setPositionAsync(offsetMs);
    } else {
      await ambienceSound!.setPositionAsync(0);
    }
    if (aborted(session)) return;
    await ambienceSound!.playAsync();
  } catch {
    /* non-fatal */
  }
}

export async function stopWavefireAmbience(): Promise<void> {
  playSession += 1;
  if (!ambienceSound) return;
  try {
    await ambienceSound.stopAsync();
    await ambienceSound.unloadAsync();
  } catch {
    /* non-fatal */
  }
  ambienceSound = null;
}

/** Pause loop while a photo vibe plays in explore fullscreen; does not unload. */
export async function pauseWavefireAmbienceForOverlay(): Promise<void> {
  if (!ambienceSound) return;
  try {
    await ambienceSound.pauseAsync();
  } catch {
    /* non-fatal */
  }
}

/** Resume campfire / wave ambience after closing explore fullscreen. */
export async function resumeWavefireAmbienceAfterOverlay(): Promise<void> {
  if (!ambienceSound) {
    void startWavefireAmbience();
    return;
  }
  try {
    await applyVolume();
    const status = await ambienceSound.getStatusAsync();
    if (status.isLoaded && !status.isPlaying) {
      await ambienceSound.playAsync();
    }
  } catch {
    /* non-fatal */
  }
}
