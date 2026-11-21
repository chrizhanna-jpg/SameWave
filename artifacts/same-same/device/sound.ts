/**
 * The app's two sounds (a water drop when a Ripple is sent, a chime when a
 * Wave arrives) and the feeling clips that play on tap in a Wave.
 *
 * Sound is never essential here: every function fails silently so a phone
 * with no audio output behaves the same as one on silent.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

const EFFECTS = {
  drop: require("../assets/sounds/drop.mp3") as number,
  chime: require("../assets/sounds/chime.mp3") as number,
};
export type Effect = keyof typeof EFFECTS;

const EFFECT_VOLUME: Record<Effect, number> = { drop: 0.7, chime: 0.8 };

let modeReady: Promise<void> | null = null;

/** Follows the phone's silent switch and lets other audio keep playing quietly. */
function setPlaybackMode(): Promise<void> {
  modeReady ??= setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: false,
    shouldPlayInBackground: false,
    interruptionMode: "duckOthers",
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

/** Loads both sounds so the first one plays without a delay. */
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
