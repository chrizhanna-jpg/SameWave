// Singleton audio playback for the music-vibe feature. Holds at most ONE
// active Sound at a time (we never want two clips overlapping), pauses
// itself when the app backgrounds, and exposes a global mute switch
// surfaced by the Match header.
//
// All methods are best-effort: a missing URL, a 404 on the clip CDN, or
// a permissions denial silently no-ops rather than crashing the swipe
// flow. The whole feature is "nice to have" — never block matching on
// audio.

import { Audio } from "expo-av";
import { AppState, type AppStateStatus } from "react-native";

let activeSound: Audio.Sound | null = null;
let activeUrl: string | null = null;
// Tracks the most recent play() request so a slow load for an old clip
// can't clobber a newer one that the user has already moved on to.
let playToken = 0;
let muted = false;
const muteListeners = new Set<(m: boolean) => void>();
let appStateSub: { remove: () => void } | null = null;

// Cold-start gesture gate. Music must NEVER play before the user has
// performed at least one explicit interaction in this session — opening
// the app and seeing a tab swap in is not consent to play audio. Every
// playClip call no-ops until markUserInteracted() flips this. The flag
// resets on every JS reload (which is what cold-start means in Expo),
// so a fresh launch is always silent until the user touches something.
let userInteracted = false;
const interactionListeners = new Set<() => void>();
export function markUserInteracted(): void {
  if (userInteracted) return;
  userInteracted = true;
  interactionListeners.forEach((cb) => cb());
  interactionListeners.clear();
}
export function hasUserInteracted(): boolean {
  return userInteracted;
}
/** Subscribe once: callback fires the first time the user interacts. */
export function onUserInteracted(cb: () => void): () => void {
  if (userInteracted) {
    cb();
    return () => {};
  }
  interactionListeners.add(cb);
  return () => interactionListeners.delete(cb);
}

async function ensureAudioMode() {
  // Run once. Allows playback while the device is on silent (otherwise
  // iOS swallows everything) and ducks other audio so a brief vibe clip
  // doesn't fight the user's Spotify.
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Older Expo runtimes may reject one of the keys — non-fatal.
  }
}

let audioModePromise: Promise<void> | null = null;
function audioModeReady() {
  if (!audioModePromise) audioModePromise = ensureAudioMode();
  return audioModePromise;
}

function ensureAppStateHook() {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener("change", (s: AppStateStatus) => {
    if (s !== "active") {
      // Backgrounded / inactive — pause whatever's playing. We don't
      // resume on return; the next photo will trigger play on its own.
      void pause();
    }
  });
}

async function unloadActive() {
  const s = activeSound;
  activeSound = null;
  activeUrl = null;
  if (!s) return;
  try {
    await s.unloadAsync();
  } catch {}
}

/**
 * Play (or restart) the given clip URL on loop. If the same URL is
 * already loaded we just resume — no reload jank between two cards
 * sharing the same clip. Honors the global mute flag.
 */
export async function playClip(url: string | undefined | null): Promise<void> {
  if (!url) {
    await pause();
    return;
  }
  // Cold-start gate: silently no-op until the user has actually
  // interacted. This prevents a freshly-launched app from blasting
  // music before the user even sees the first frame.
  if (!userInteracted) return;
  ensureAppStateHook();
  await audioModeReady();
  const token = ++playToken;

  // Same URL already loaded — just make sure it's playing (or muted).
  if (activeSound && activeUrl === url) {
    try {
      if (muted) {
        await activeSound.setStatusAsync({ shouldPlay: false });
      } else {
        await activeSound.setStatusAsync({ shouldPlay: true, isLooping: true });
      }
    } catch {}
    return;
  }

  // Tear down whatever's currently playing before loading the new clip.
  await unloadActive();
  if (token !== playToken) return; // user moved on while we were tearing down

  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: !muted, isLooping: true, volume: 0.55 },
    );
    if (token !== playToken) {
      // A newer play() landed while we were loading — discard.
      try { await sound.unloadAsync(); } catch {}
      return;
    }
    activeSound = sound;
    activeUrl = url;
  } catch {
    // 404, network blip, or codec mismatch. Swallow — feature is optional.
  }
}

/**
 * Pause the active clip without unloading. Cheap to call repeatedly.
 *
 * Importantly, bumps `playToken` so any in-flight `createAsync` from a
 * prior `playClip()` call sees the mismatch and discards itself instead
 * of starting playback after we've already been told to stop. Without
 * this, an audio clip can begin playing milliseconds after the app is
 * backgrounded or a fullscreen modal opens — violating the "auto-pause
 * on background/fullscreen" guarantee the Match screen relies on.
 */
export async function pause(): Promise<void> {
  playToken++;
  if (!activeSound) return;
  try {
    await activeSound.setStatusAsync({ shouldPlay: false });
  } catch {}
}

/** Stop and fully release the active clip. Call on screen unmount. */
export async function stop(): Promise<void> {
  playToken++; // invalidate any in-flight loads
  await unloadActive();
}

/** Toggle the global mute flag. Affects the active clip immediately. */
export function setMuted(next: boolean) {
  if (muted === next) return;
  muted = next;
  muteListeners.forEach((cb) => cb(muted));
  if (activeSound) {
    activeSound.setStatusAsync({ shouldPlay: !muted }).catch(() => {});
  }
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Subscribe to mute-state changes. Returns an unsubscribe function so
 * React effects can clean up correctly.
 */
export function onMuteChange(cb: (m: boolean) => void): () => void {
  muteListeners.add(cb);
  return () => {
    muteListeners.delete(cb);
  };
}
