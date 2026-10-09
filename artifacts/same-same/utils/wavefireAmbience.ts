// Wavefire ambience: single beach + campfire loop (separate from global vibe
// clip singleton in utils/audio.ts so Atlas does not steal Match playback).

import { Audio } from "@/utils/expoAvCompat";

import { isMuted, onMuteChange } from "@/utils/audio";
import { createAudioCommandQueue } from "@/utils/audioCommandQueue";
import { dbToLinear } from "@/utils/dbLinear";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WAVEFIRE_AMBIENCE = require("../assets/audio/firecircle/wavefire_ambience.mp3");

const DB = -11;

const ZOOM_OUT_BREAK = 0.92;
const ZOOM_OUT_GAIN = 0.55;

let ambienceSound: Audio.Sound | null = null;
/** One start/stop at a time so a late play() cannot outlive a tab change. */
const ambienceCommands = createAudioCommandQueue();
let mapScale = 1;
/** True while Wavefire / explore should keep the loop running (honors global mute). */
let wantPlaying = false;
let muteHooked = false;

function ensureMuteHook(): void {
  if (muteHooked) return;
  muteHooked = true;
  onMuteChange(() => {
    void ambienceCommands.enqueue(() => syncAmbiencePlayback());
  });
}

async function syncAmbiencePlayback(): Promise<void> {
  if (!ambienceSound) return;
  try {
    if (!wantPlaying || isMuted()) {
      const status = await ambienceSound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await ambienceSound.pauseAsync();
      }
      return;
    }
    await applyVolume();
    const status = await ambienceSound.getStatusAsync();
    if (status.isLoaded && !status.isPlaying) {
      await ambienceSound.playAsync();
    }
  } catch {
    /* non-fatal */
  }
}

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
  void ambienceCommands.enqueue(() => applyVolume());
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

function stillCurrent(lease: number): boolean {
  return lease === ambienceCommands.current();
}

async function runStart(lease: number): Promise<void> {
  if (!stillCurrent(lease)) return;
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
  if (!stillCurrent(lease)) return;

  const ok = await ensureLoaded();
  if (!ok || !stillCurrent(lease)) return;

  await applyVolume();
  if (!stillCurrent(lease)) return;

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
    if (!stillCurrent(lease)) return;
    if (isMuted() || !wantPlaying) return;
    await ambienceSound!.playAsync();
  } catch {
    /* non-fatal */
  }
}

export function startWavefireAmbience(): Promise<void> {
  ensureMuteHook();
  wantPlaying = true;
  const lease = ambienceCommands.bump();
  return ambienceCommands.enqueue(() => runStart(lease));
}

export function stopWavefireAmbience(): Promise<void> {
  wantPlaying = false;
  // Invalidate an in-flight start(), but keep the decoded loop loaded so
  // the next visit to Atlas resumes without decoding the file again.
  // Unloading on every tab change is what made the beach loop lag the tap.
  const lease = ambienceCommands.bump();
  return ambienceCommands.enqueue(async () => {
    if (!stillCurrent(lease) || !ambienceSound) return;
    try {
      await ambienceSound.pauseAsync();
    } catch {
      /* non-fatal */
    }
  });
}

/** Pause loop while a photo vibe plays in explore fullscreen; does not unload. */
export function pauseWavefireAmbienceForOverlay(): Promise<void> {
  return stopWavefireAmbience();
}

/** Resume campfire / wave ambience after closing explore fullscreen. */
export function resumeWavefireAmbienceAfterOverlay(): Promise<void> {
  return startWavefireAmbience();
}
