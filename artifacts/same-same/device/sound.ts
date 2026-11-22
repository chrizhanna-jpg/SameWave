/**
 * The app's sounds: Wave-arrival chime, Match ripple / wave cues, and the
 * splash / Home ocean swell. Photo capture, library pick, and upload are
 * silent. Sound is never essential — every function fails silently so a
 * silent phone behaves the same as one with audio.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { AppState, type NativeEventSubscription } from "react-native";

import {
  fadeVolumeAt,
  SWOOSH_FADE_MS,
  SWOOSH_FADE_STEP_MS,
  SWOOSH_FADE_STEPS,
} from "@/core/volumeFade";

const EFFECTS = {
  chime: require("../assets/sounds/chime.mp3") as number,
};
export type Effect = keyof typeof EFFECTS;

const EFFECT_VOLUME: Record<Effect, number> = { chime: 0.8 };

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
let swooshFadeTimer: ReturnType<typeof setInterval> | null = null;
let swooshAppStateSub: NativeEventSubscription | null = null;

function clearSwooshFade(): void {
  if (swooshFadeTimer == null) return;
  clearInterval(swooshFadeTimer);
  swooshFadeTimer = null;
}

/** Park the player at full volume after a fade (or aborted fade). */
function parkSwooshPlayer(player: AudioPlayer): void {
  swooshPlaying = false;
  try {
    player.loop = false;
  } catch {
    /* */
  }
  try {
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

/**
 * Keep audio flowing through a long fade: the swell file is shorter than
 * splash-min + 3.5 s fade when splash runs long, so loop (and nudge play)
 * until volume reaches zero.
 */
function keepSwooshAudibleDuringFade(player: AudioPlayer): void {
  try {
    player.loop = true;
  } catch {
    /* */
  }
  try {
    // If the native player already finished before loop engaged, restart.
    const nearEnd =
      typeof player.duration === "number" &&
      player.duration > 0 &&
      typeof player.currentTime === "number" &&
      player.currentTime >= Math.max(0, player.duration - 0.08);
    if (nearEnd || player.duration === 0) {
      void player.seekTo(0.35).catch(() => undefined); // skip the soft attack
    }
  } catch {
    /* */
  }
  try {
    if (!player.playing) player.play();
  } catch {
    /* */
  }
}

/**
 * Backgrounding mid-fade must not leave a timer or a half-muted player.
 * Finish (pause + reset volume) as soon as the app leaves the foreground.
 */
function ensureSwooshFadeAppStateGuard(): void {
  if (swooshAppStateSub) return;
  swooshAppStateSub = AppState.addEventListener("change", (next) => {
    if (next === "active") return;
    if (swooshFadeTimer == null) return;
    clearSwooshFade();
    swooshGeneration += 1;
    if (swooshPlayer) parkSwooshPlayer(swooshPlayer);
  });
}

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
  // Cancel any in-flight fade so a re-launch never leaves a stuck ramp.
  clearSwooshFade();
  const generation = ++swooshGeneration;
  try {
    await setPlaybackMode();
    if (generation !== swooshGeneration) return;
    const player = ensureSwooshPlayer();
    try {
      player.loop = false;
    } catch {
      /* */
    }
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

/** Same swell as splash — used when Home comes back into focus. */
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

/**
 * Fade the splash / ocean swell to silence (~3.5 s perceptual ramp), then pause.
 * Visual splash timing is unchanged — callers fire this when the overlay goes
 * away; audio tails off underneath Home. The swell file (~4.86 s) may end
 * before a late splash dismiss + 3.5 s fade, so we loop for the ramp only.
 * A newer play/stop cancels the ramp.
 */
export function stopWaveSwoosh(): void {
  clearSwooshFade();
  const generation = ++swooshGeneration;
  const player = swooshPlayer;
  if (!player) {
    swooshPlaying = false;
    return;
  }

  let from = WAVE_SWOOSH_VOLUME;
  try {
    const current = player.volume;
    if (typeof current === "number" && Number.isFinite(current)) from = current;
  } catch {
    /* */
  }

  // Already silent — just park the player for the next play.
  if (from <= 0.001) {
    parkSwooshPlayer(player);
    return;
  }

  ensureSwooshFadeAppStateGuard();
  keepSwooshAudibleDuringFade(player);

  const steps = SWOOSH_FADE_STEPS;
  const stepMs = SWOOSH_FADE_STEP_MS;
  let step = 0;
  // Keep swooshPlaying true through the fade so Home's focus handler waits
  // instead of starting a second swell.
  swooshFadeTimer = setInterval(() => {
    if (generation !== swooshGeneration) {
      clearSwooshFade();
      return;
    }
    step += 1;
    keepSwooshAudibleDuringFade(player);
    const volume = fadeVolumeAt(step / steps, from, 0);
    try {
      player.volume = volume;
    } catch {
      /* */
    }
    if (step < steps) return;

    clearSwooshFade();
    parkSwooshPlayer(player);
  }, stepMs);
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

let activeClip: { player: AudioPlayer; ended: () => void; gen: number } | null = null;
let clipGeneration = 0;

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

export type ClipSource = number | string | { uri: string };

/**
 * Play a bundled module id, a file URI, or `{ uri }`.
 * Waits until the player reports loaded before play(); surfaces load errors
 * via `onError` instead of swallowing them.
 */
export async function playClip(
  source: ClipSource,
  onEnd: () => void,
  options?: { fadeInMs?: number; volume?: number; onError?: (error: unknown) => void },
): Promise<void> {
  releaseClip(true);
  const gen = ++clipGeneration;
  const fadeInMs = options?.fadeInMs ?? 0;
  const targetVolume = options?.volume ?? 0.9;
  try {
    await setPlaybackMode();
    const player =
      typeof source === "number"
        ? createAudioPlayer(source)
        : typeof source === "string"
          ? createAudioPlayer({ uri: source })
          : createAudioPlayer(source);
    player.volume = fadeInMs > 0 ? 0 : targetVolume;
    const clip = { player, ended: onEnd, gen };
    activeClip = clip;

    let started = false;
    const startPlayback = () => {
      if (started || activeClip !== clip) return;
      started = true;
      try {
        player.play();
      } catch (error) {
        options?.onError?.(error);
        if (activeClip === clip) releaseClip(true);
        return;
      }
      if (fadeInMs > 0) {
        const steps = Math.max(6, Math.round(fadeInMs / 50));
        let step = 0;
        const timer = setInterval(() => {
          if (activeClip !== clip) {
            clearInterval(timer);
            return;
          }
          step += 1;
          const t = Math.min(1, step / steps);
          try {
            player.volume = targetVolume * t;
          } catch {
            /* */
          }
          if (t >= 1) clearInterval(timer);
        }, fadeInMs / steps);
      }
    };

    player.addListener("playbackStatusUpdate", (status) => {
      if (activeClip !== clip) return;
      if (status.isLoaded && !started) startPlayback();
      if (status.didJustFinish) releaseClip(true);
    });

    // Already loaded (common for bundled modules).
    if (player.isLoaded) startPlayback();
    else {
      // Soft timeout so a stuck load still surfaces.
      setTimeout(() => {
        if (activeClip !== clip || started) return;
        if (player.isLoaded) startPlayback();
        else {
          const error = new Error("Clip failed to load");
          options?.onError?.(error);
          releaseClip(true);
        }
      }, 8000);
    }
  } catch (error) {
    options?.onError?.(error);
    if (clipGeneration === gen) {
      releaseClip(false);
      onEnd();
    }
  }
}

/** Fade volume to zero then stop (gentle leave). */
export function fadeStopClip(fadeMs = 600): void {
  const clip = activeClip;
  if (!clip) return;
  const { player } = clip;
  const from = typeof player.volume === "number" ? player.volume : 0.9;
  const steps = Math.max(4, Math.round(fadeMs / 50));
  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    const t = Math.min(1, step / steps);
    try {
      player.volume = from * (1 - t);
    } catch {
      /* */
    }
    if (t >= 1) {
      clearInterval(timer);
      releaseClip(true);
    }
  }, fadeMs / steps);
}

export function stopClip(): void {
  releaseClip(true);
}
