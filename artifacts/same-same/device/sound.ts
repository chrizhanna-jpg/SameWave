/**
 * The app's sounds: a water drop when a Ripple is sent, a chime when a Wave
 * arrives, the feeling clips on a Wave, and a short ocean-wave swoosh for
 * launch / Wave-received reveal.
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
 */
const WAVE_SWOOSH = require("../assets/sounds/wave-swoosh.mp3") as number;
const WAVE_SWOOSH_VOLUME = 0.5;

let modeReady: Promise<void> | null = null;

/** Follows the phone's silent switch and mixes with other audio (no ducking). */
function setPlaybackMode(): Promise<void> {
  modeReady ??= setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: false,
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

/** Loads both cue sounds so the first one plays without a delay. */
export function prepareEffects(): void {
  try {
    void setPlaybackMode();
    effectPlayer("drop");
    effectPlayer("chime");
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

let swooshPlayer: AudioPlayer | null = null;

/**
 * Plays the launch / Wave-received ocean swoosh once, then unloads.
 * Volume ~0.5; respects the iOS silent switch; mixes with other audio.
 * Safe to call again — a previous player is released first.
 */
export async function playWaveSwoosh(): Promise<void> {
  try {
    if (swooshPlayer) {
      try {
        swooshPlayer.pause();
      } catch {
        /* already stopped */
      }
      try {
        swooshPlayer.remove();
      } catch {
        /* already released */
      }
      swooshPlayer = null;
    }
    await setPlaybackMode();
    const player = createAudioPlayer(WAVE_SWOOSH);
    player.volume = WAVE_SWOOSH_VOLUME;
    swooshPlayer = player;
    const finish = () => {
      if (swooshPlayer !== player) return;
      swooshPlayer = null;
      try {
        player.pause();
      } catch {
        /* */
      }
      try {
        player.remove();
      } catch {
        /* */
      }
    };
    player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) finish();
    });
    player.play();
  } catch {
    // Fail silently — splash / reveal continue without audio.
  }
}

/** Stops the swoosh early (e.g. splash skipped) and unloads. */
export function stopWaveSwoosh(): void {
  const player = swooshPlayer;
  if (!player) return;
  swooshPlayer = null;
  try {
    // Soft volume ramp isn't available on all platforms; pause + unload is enough
    // because the file itself already has a baked-in fade-out for normal play.
    player.volume = 0;
    player.pause();
  } catch {
    /* */
  }
  try {
    player.remove();
  } catch {
    /* */
  }
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
