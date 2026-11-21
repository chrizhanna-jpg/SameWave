/**
 * The app's sounds: a water drop when a Ripple is sent, a chime when a Wave
 * arrives, the feeling clips on a Wave, and a short ocean-wave swoosh for
 * launch splash, Home focus, and photo upload.
 *
 * Sound is never essential: every function fails silently so a phone with
 * no audio output behaves the same as one on silent.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

const EFFECTS = {
  drop: require("../assets/sounds/drop.mp3") as number,
  chime: require("../assets/sounds/chime.mp3") as number,
};
export type Effect = keyof typeof EFFECTS;

const EFFECT_VOLUME: Record<Effect, number> = { drop: 0.7, chime: 0.8 };

/**
 * Real ocean field recording (CC0). See assets/sounds/wave-swoosh.LICENSE.txt.
 * Trimmed ~2.2s with baked-in fade-in (0.25s) and fade-out (last 0.9s).
 * Production asset — always bundled (unlike test photos).
 */
const WAVE_SWOOSH = require("../assets/sounds/wave-swoosh.mp3") as number;
const WAVE_SWOOSH_VOLUME = 0.5;

let modeReady: Promise<void> | null = null;

/** Follows the phone's silent switch and mixes with other audio (no ducking). */
function setPlaybackMode(): Promise<void> {
  modeReady ??= setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: "mixWithOthers",
    shouldRouteThroughEarpiece: false,
  }).catch(() => undefined);
  return modeReady;
}

/** Recording changes the audio mode; the next sound must set it back. */
export function playbackModeChanged(): void {
  modeReady = null;
}

const effectPlayers = new Map<Effect, AudioPlayer>();

function effectPlayer(effect: Effect): AudioPlayer {
  let player = effectPlayers.get(effect);
  if (!player) {
    player = createAudioPlayer(EFFECTS[effect]);
    player.volume = EFFECT_VOLUME[effect];
    effectPlayers.set(effect, player);
  }
  return player;
}

let swooshPlayer: AudioPlayer | null = null;
/** Bumps on each play/stop so a late async play cannot restart after cut. */
let swooshGeneration = 0;
let swooshPlaying = false;

function ensureSwooshPlayer(): AudioPlayer {
  if (!swooshPlayer) {
    swooshPlayer = createAudioPlayer(WAVE_SWOOSH);
    swooshPlayer.volume = WAVE_SWOOSH_VOLUME;
  }
  return swooshPlayer;
}

async function waitUntilLoaded(player: AudioPlayer, ms = 1500): Promise<boolean> {
  if (player.isLoaded) return true;
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (player.isLoaded) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return player.isLoaded;
}

/** Loads cue sounds + ocean swoosh so the first play is not racing asset decode. */
export function prepareEffects(): void {
  try {
    void setPlaybackMode();
    effectPlayer("drop");
    effectPlayer("chime");
    ensureSwooshPlayer();
  } catch {
    // No audio on this device.
  }
}

export async function playEffect(effect: Effect): Promise<void> {
  try {
    await setPlaybackMode();
    const player = effectPlayer(effect);
    await player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // Silent is an acceptable outcome.
  }
}

/**
 * Plays the ocean swoosh (splash / Home / photo upload).
 * Preloaded player; seek + play; waits for `isLoaded` so Expo Go actually hears it.
 * Safe to call again — restarts from the start.
 */
export async function playWaveSwoosh(): Promise<void> {
  const generation = ++swooshGeneration;
  try {
    await setPlaybackMode();
    if (generation !== swooshGeneration) return;
    const player = ensureSwooshPlayer();
    player.volume = WAVE_SWOOSH_VOLUME;
    const loaded = await waitUntilLoaded(player);
    if (generation !== swooshGeneration) return;
    if (!loaded) {
      // Recreate once if the first instance never loaded (Expo Go quirk).
      try {
        player.remove();
      } catch {
        /* */
      }
      swooshPlayer = null;
      const retry = ensureSwooshPlayer();
      retry.volume = WAVE_SWOOSH_VOLUME;
      await waitUntilLoaded(retry);
      if (generation !== swooshGeneration) return;
    }
    const active = ensureSwooshPlayer();
    await active.seekTo(0).catch(() => undefined);
    if (generation !== swooshGeneration) return;
    swooshPlaying = true;
    active.play();
  } catch {
    // Fail silently — splash / Home / upload continue without audio.
  }
}

/** Alias — same production ocean asset as splash. */
export const playOceanSound = playWaveSwoosh;

/** Stops the swoosh early (splash dismissed / Home must not overlap) and keeps the player for reuse. */
export function stopWaveSwoosh(): void {
  swooshGeneration += 1;
  swooshPlaying = false;
  const player = swooshPlayer;
  if (!player) return;
  try {
    player.volume = 0;
    player.pause();
  } catch {
    /* */
  }
  try {
    void player.seekTo(0).catch(() => undefined);
  } catch {
    /* */
  }
  try {
    player.volume = WAVE_SWOOSH_VOLUME;
  } catch {
    /* */
  }
}

export function isWaveSwooshPlaying(): boolean {
  return swooshPlaying;
}

let activeClip: { player: AudioPlayer; ended: () => void } | null = null;

function releaseClip(notify: boolean): void {
  const clip = activeClip;
  if (!clip) return;
  activeClip = null;
  try {
    clip.player.pause();
  } catch {
    // Already stopped.
  }
  try {
    clip.player.remove();
  } catch {
    // Already released.
  }
  if (notify) clip.ended();
}

/**
 * Plays one clip at a time. Starting another stops the first. `onEnd` is
 * called once, when the clip finishes, is replaced, or cannot be played.
 */
export async function playClip(uri: string, onEnd: () => void): Promise<void> {
  releaseClip(true);
  try {
    await setPlaybackMode();
    const player = createAudioPlayer({ uri });
    player.volume = 0.9;
    const clip = { player, ended: onEnd };
    activeClip = clip;
    player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish && activeClip === clip) releaseClip(true);
    });
    player.play();
  } catch {
    releaseClip(false);
    onEnd();
  }
}

export function stopClip(): void {
  releaseClip(true);
}
