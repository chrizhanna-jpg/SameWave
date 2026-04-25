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
// Tracks whether the active clip is currently playing (vs. paused but
// still loaded). Surfaced via `isPlayingUrl()` so UI surfaces (e.g. the
// mic badge on a user's own photos) can render a "now playing" affordance
// and let the user toggle preview on/off without juggling lease state.
let activePlaying = false;
const playbackListeners = new Set<() => void>();
function notifyPlayback() {
  playbackListeners.forEach((cb) => cb());
}
// Tracks the most recent play() request so a slow load for an old clip
// can't clobber a newer one that the user has already moved on to.
// `playToken` doubles as the "lease" handed back to callers of
// playClip(): each call gets a unique number, and screens use that
// number with stopIfLease()/pauseIfLease() so an unmount cleanup
// only kills audio that THIS call started — never another screen's
// freshly-started playback. (URL-based ownership isn't enough: the
// clip pool is small, two screens can pick the same URL, and an old
// screen's cleanup would wrongly stop the new screen's audio.)
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
/** URL of the clip currently loaded in the singleton player, if any. */
export function getActiveUrl(): string | null {
  return activeUrl;
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
  // Allows playback while the device is on silent (otherwise iOS
  // swallows everything) and ducks other audio so a brief vibe clip
  // doesn't fight the user's Spotify. `allowsRecordingIOS: false`
  // is set explicitly so the camera screen's recorder can't leave
  // the global audio session in record mode (which on iOS routes
  // playback through the earpiece and on Android can outright
  // suppress music here).
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Older Expo runtimes may reject one of the keys — non-fatal.
  }
}

// Memoize the initial setup so we don't pay the native bridge cost
// (and risk interrupting an active sound) on every clip load. The
// camera screen calls `resetPlaybackMode()` after recording to
// re-arm the playback config — that's the only legit reason to
// re-run setAudioModeAsync mid-session.
let audioModePromise: Promise<void> | null = null;
function audioModeReady() {
  if (!audioModePromise) audioModePromise = ensureAudioMode();
  return audioModePromise;
}

/**
 * Force the global audio session back into the playback config used
 * by this singleton. Call this from any screen that mutates
 * `Audio.setAudioModeAsync` (the recorder is the only such screen
 * today) so the next `playClip()` actually produces sound.
 *
 * We re-issue the underlying `setAudioModeAsync` AND swap the
 * memoized promise so any in-flight `audioModeReady()` awaiters get
 * the freshly applied config too.
 */
export async function resetPlaybackMode(): Promise<void> {
  audioModePromise = ensureAudioMode();
  await audioModePromise;
}

function ensureAppStateHook() {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener("change", (s: AppStateStatus) => {
    // Only pause when the app is fully backgrounded. iOS fires
    // "inactive" extremely often for transient events — Control Centre
    // pulls, banner notifications, the brief moment a screen-push
    // animates, even some keyboard transitions — and treating those as
    // "stop the music" symptoms exactly like the bug we keep getting
    // reported: a clip plays for a second and then dies, with no way
    // to come back since nothing re-triggers playback. "background" is
    // the only state that genuinely means "the user has left the app".
    if (s === "background") {
      void pause();
    }
  });
}

async function unloadActive() {
  const s = activeSound;
  activeSound = null;
  activeUrl = null;
  const wasPlaying = activePlaying;
  activePlaying = false;
  if (wasPlaying) notifyPlayback();
  if (!s) return;
  try {
    await s.unloadAsync();
  } catch {}
}

/**
 * Play (or restart) the given clip URL on loop, returning a `lease`
 * number the caller should stash and pass to `stopIfLease()` /
 * `pauseIfLease()` on unmount. The lease is unique per call: if any
 * later `playClip()` runs (anywhere in the app), the prior lease is
 * silently invalidated and cleanup using it becomes a no-op. This is
 * how we prevent a stale screen's unmount cleanup from killing the
 * next screen's freshly-started audio.
 *
 * Returns 0 when the call no-ops (no URL, cold-start gate still
 * closed). Callers can store 0 safely — the *IfLease helpers ignore
 * 0 leases.
 *
 * If the same URL is already loaded we just resume — no reload jank
 * between two cards sharing the same clip. Honors the global mute flag.
 */
export function playClip(url: string | undefined | null): number {
  if (!url) {
    void pause();
    return 0;
  }
  // Cold-start gate: silently no-op until the user has actually
  // interacted. This prevents a freshly-launched app from blasting
  // music before the user even sees the first frame.
  if (!userInteracted) return 0;
  ensureAppStateHook();
  // Bump the token SYNCHRONOUSLY so the returned lease matches the
  // one this call's async work will check against — and so any older
  // in-flight load is invalidated immediately, even if `audioModeReady`
  // hasn't resolved yet.
  const lease = ++playToken;
  void _doPlay(url, lease);
  return lease;
}

async function _doPlay(url: string, lease: number): Promise<void> {
  await audioModeReady();
  if (lease !== playToken) return;

  // Same URL already loaded — just make sure it's playing (or muted).
  if (activeSound && activeUrl === url) {
    try {
      if (muted) {
        await activeSound.setStatusAsync({ shouldPlay: false });
        if (activePlaying) {
          activePlaying = false;
          notifyPlayback();
        }
      } else {
        await activeSound.setStatusAsync({ shouldPlay: true, isLooping: true });
        if (!activePlaying) {
          activePlaying = true;
          notifyPlayback();
        }
      }
    } catch {}
    return;
  }

  // Tear down whatever's currently playing before loading the new clip.
  await unloadActive();
  if (lease !== playToken) return; // user moved on while we were tearing down

  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: !muted, isLooping: true, volume: 0.55 },
    );
    if (lease !== playToken) {
      // A newer play() landed while we were loading — discard.
      try { await sound.unloadAsync(); } catch {}
      return;
    }
    activeSound = sound;
    activeUrl = url;
    const nowPlaying = !muted;
    if (activePlaying !== nowPlaying) {
      activePlaying = nowPlaying;
      notifyPlayback();
    } else {
      // URL changed even if play state didn't — listeners that key off
      // a specific URL still need to re-evaluate.
      notifyPlayback();
    }
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
  if (activePlaying) {
    activePlaying = false;
    notifyPlayback();
  }
  try {
    await activeSound.setStatusAsync({ shouldPlay: false });
  } catch {}
}

/** Stop and fully release the active clip. Call on screen unmount. */
export async function stop(): Promise<void> {
  playToken++; // invalidate any in-flight loads
  await unloadActive();
}

/**
 * Stop the active clip ONLY if `lease` is still the current lease.
 *
 * Pass the lease returned by your screen's most recent `playClip()`
 * call. If any other code (another screen, a vibe-swap on the same
 * screen) has called playClip since, your lease is stale and this
 * is a no-op — so you can't accidentally kill audio another owner
 * just started. This is what lets us safely clean up on unmount in
 * a router that mounts/unmounts screens in racing orders.
 */
export async function stopIfLease(lease: number): Promise<void> {
  if (!lease) return;
  if (lease !== playToken) return;
  await stop();
}

/**
 * Pause the active clip ONLY if `lease` is still the current lease.
 * Same ownership contract as `stopIfLease`: a stale lease no-ops
 * instead of pausing audio that some other screen now owns.
 */
export async function pauseIfLease(lease: number): Promise<void> {
  if (!lease) return;
  if (lease !== playToken) return;
  await pause();
}

/** Toggle the global mute flag. Affects the active clip immediately. */
export function setMuted(next: boolean) {
  if (muted === next) return;
  muted = next;
  muteListeners.forEach((cb) => cb(muted));
  if (activeSound) {
    activeSound.setStatusAsync({ shouldPlay: !muted }).catch(() => {});
    const nowPlaying = !muted;
    if (activePlaying !== nowPlaying) {
      activePlaying = nowPlaying;
      notifyPlayback();
    }
  }
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Returns true when the singleton player is actively playing the given URL.
 * Use this to drive "now playing" affordances on per-photo mic badges so the
 * UI can flip to a "tap to pause" state without any extra bookkeeping.
 */
export function isPlayingUrl(url: string | null | undefined): boolean {
  return !!url && activeUrl === url && activePlaying;
}

/**
 * Subscribe to playback-state changes (URL or play/pause swap). Pair with
 * `isPlayingUrl()` to keep a per-clip badge in sync as other surfaces start
 * or stop their own clips. Returns an unsubscribe so React effects can
 * clean up correctly.
 */
export function onPlaybackChange(cb: () => void): () => void {
  playbackListeners.add(cb);
  return () => {
    playbackListeners.delete(cb);
  };
}

/**
 * Toggle preview playback for a user-owned clip URL. If this URL is already
 * the active clip and playing, pause it; otherwise start it. Counts as a
 * user gesture so the cold-start gate opens automatically — callers don't
 * need to wire up `markUserInteracted()` separately.
 */
export function togglePreview(url: string | null | undefined): void {
  if (!url) return;
  markUserInteracted();
  if (isPlayingUrl(url)) {
    void pause();
  } else {
    playClip(url);
  }
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
