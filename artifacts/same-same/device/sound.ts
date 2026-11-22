/**
 * The app's sounds: upload drop, Wave-arrival chime, Match ripple / wave cues,
 * and the splash ocean swell. Sound is never essential — every function fails
 * silently so a silent phone behaves the same as one with audio.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

const EFFECTS = {
  drop: require("../assets/sounds/drop.mp3") as number,
  chime: require("../assets/sounds/chime.mp3") as number,
};
export type Effect = keyof typeof EFFECTS;

const EFFECT_VOLUME: Record<Effect, number> = { drop: 0.7, chime: 0.8 };

/** Synthesised ocean swell — see assets/sounds/wave-swoosh.LICENSE.txt. */
const WAVE_SWOOSH = require("../assets/sounds/wave-swoosh.mp3") as number;
const WAVE_SWOOSH_VOLUME = 0.55;

/** Hand-in-water swish for Match "Offer a Ripple". */
const RIPPLE_CUE = require("../assets/sounds/ripple.mp3") as number;
const RIPPLE_VOLUME = 0.7;

/** Gentler rolling wave for Match "Offer a Wave" (match-back). */
const WAVE_CUE = require("../assets/sounds/wave.mp3") as number;
const WAVE_VOLUME = 0.75;

let modeReady: Promise<void> | null = null;

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
let swooshGeneration = 0;
let swooshPlaying = false;
/** True after the launch splash has played the swell once this session. */
let launchSwooshConsumed = false;

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

async function playAsset(
  ensure: () => AudioPlayer,
  volume: number,
  recreate: () => void,
): Promise<void> {
  try {
    await setPlaybackMode();
    const player = ensure();
    player.volume = volume;
    const loaded = await waitUntilLoaded(player);
    if (!loaded) {
      try {
        player.remove();
      } catch {
        /* */
      }
      recreate();
      const retry = ensure();
      retry.volume = volume;
      await waitUntilLoaded(retry);
    }
    const active = ensure();
    await active.seekTo(0).catch(() => undefined);
    active.play();
  } catch {
    /* silent ok */
  }
}

let ripplePlayer: AudioPlayer | null = null;
let wavePlayer: AudioPlayer | null = null;

function ensureRipplePlayer(): AudioPlayer {
  if (!ripplePlayer) {
    ripplePlayer = createAudioPlayer(RIPPLE_CUE);
    ripplePlayer.volume = RIPPLE_VOLUME;
  }
  return ripplePlayer;
}

function ensureWavePlayer(): AudioPlayer {
  if (!wavePlayer) {
    wavePlayer = createAudioPlayer(WAVE_CUE);
    wavePlayer.volume = WAVE_VOLUME;
  }
  return wavePlayer;
}

export function prepareEffects(): void {
  try {
    void setPlaybackMode();
    effectPlayer("drop");
    effectPlayer("chime");
    ensureSwooshPlayer();
    ensureRipplePlayer();
    ensureWavePlayer();
  } catch {
    /* */
  }
}

export async function playEffect(effect: Effect): Promise<void> {
  try {
    await setPlaybackMode();
    const player = effectPlayer(effect);
    await player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    /* */
  }
}

/**
 * Splash / later Home focus ocean swell.
 * Pass `{ fromLaunch: true }` from the splash so Home can skip the immediate replay.
 */
export async function playWaveSwoosh(options?: { fromLaunch?: boolean }): Promise<void> {
  const generation = ++swooshGeneration;
  try {
    await setPlaybackMode();
    if (generation !== swooshGeneration) return;
    const player = ensureSwooshPlayer();
    player.volume = WAVE_SWOOSH_VOLUME;
    const loaded = await waitUntilLoaded(player);
    if (generation !== swooshGeneration) return;
    if (!loaded) {
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
    if (options?.fromLaunch) launchSwooshConsumed = true;
    active.play();
  } catch {
    /* */
  }
}

/** Same swell as splash — used after photo pick / later Home returns. */
export const playOceanSound = playWaveSwoosh;

/**
 * Home focus should play the swell only when returning later — not right after
 * the launch splash already played it.
 */
export function shouldPlayHomeOceanOnFocus(): boolean {
  if (!launchSwooshConsumed) return true;
  // First Home focus after splash: skip. Later focuses: play.
  const skip = launchSwooshConsumed;
  launchSwooshConsumed = false;
  return !skip;
}

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

/** Match right-hand Offer a Ripple — soft hand-in-water swish. */
export async function playRipple(): Promise<void> {
  await playAsset(ensureRipplePlayer, RIPPLE_VOLUME, () => {
    ripplePlayer = null;
  });
}

/** Match Offer a Wave (match-back) — fuller rolling wave. Not the arrival chime. */
export async function playWave(): Promise<void> {
  await playAsset(ensureWavePlayer, WAVE_VOLUME, () => {
    wavePlayer = null;
  });
}

let activeClip: { player: AudioPlayer; ended: () => void } | null = null;

function releaseClip(notify: boolean): void {
  const clip = activeClip;
  if (!clip) return;
  activeClip = null;
  try {
    clip.player.pause();
  } catch {
    /* */
  }
  try {
    clip.player.remove();
  } catch {
    /* */
  }
  if (notify) clip.ended();
}

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
