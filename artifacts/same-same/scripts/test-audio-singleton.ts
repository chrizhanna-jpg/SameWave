/**
 * Behavioural checks for the vibe-clip singleton and the expo-audio shim, run
 * against fake native players (no device needed).
 * Run from artifacts/same-same: tsx scripts/test-audio-singleton.ts
 */
import Module from "node:module";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` (${detail})`}`);
  if (!ok) process.exitCode = 1;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Fake expo-audio ────────────────────────────────────────────────────
type Listener = (status: { isLoaded: boolean }) => void;
const loadMs = new Map<string, number>();
const failUrls = new Set<string>();

class FakePlayer {
  static all: FakePlayer[] = [];
  url: string;
  isLoaded = false;
  playing = false;
  removed = false;
  loop = false;
  volume = 1;
  currentTime = 0;
  duration = 10;
  private listeners = new Set<Listener>();
  constructor(source: { uri: string } | string | number | null) {
    this.url = typeof source === "object" && source ? source.uri : String(source);
    FakePlayer.all.push(this);
    const ms = loadMs.get(this.url) ?? 5;
    setTimeout(() => {
      if (this.removed || failUrls.has(this.url)) return;
      this.isLoaded = true;
      this.listeners.forEach((cb) => cb({ isLoaded: true }));
    }, ms);
  }
  addListener(_name: string, cb: Listener) {
    this.listeners.add(cb);
    return { remove: () => this.listeners.delete(cb) };
  }
  play() {
    if (this.removed) return;
    this.playing = true;
    sample();
  }
  pause() {
    this.playing = false;
    sample();
  }
  async seekTo() {}
  remove() {
    this.removed = true;
    this.playing = false;
    sample();
  }
}

let maxAudible = 0;
function audible(): FakePlayer[] {
  return FakePlayer.all.filter((p) => p.playing && !p.removed && p.isLoaded);
}
// A player that is told to play before it has loaded starts by itself once the
// download finishes, so count it as audible the moment it will be.
function willBeAudible(): FakePlayer[] {
  return FakePlayer.all.filter((p) => p.playing && !p.removed);
}
function sample() {
  maxAudible = Math.max(maxAudible, willBeAudible().length);
}

const fakeExpoAudio = {
  AudioModule: { AudioRecorder: class {} },
  RecordingPresets: { HIGH_QUALITY: {} },
  createAudioPlayer: (source: { uri: string }) => new FakePlayer(source),
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  setAudioModeAsync: async () => {},
};
const fakeReactNative = {
  AppState: { addEventListener: () => ({ remove() {} }) },
};

const load = (Module as unknown as {
  _load: (request: string, ...rest: unknown[]) => unknown;
})._load;
(Module as unknown as { _load: typeof load })._load = function (request, ...rest) {
  if (request === "expo-audio") return fakeExpoAudio;
  if (request === "react-native") return fakeReactNative;
  return load.call(this, request, ...rest);
};

function reset() {
  for (const p of FakePlayer.all) {
    p.removed = true;
    p.playing = false;
  }
  FakePlayer.all = [];
  maxAudible = 0;
  loadMs.clear();
  failUrls.clear();
}

async function main(): Promise<void> {
  const audio = await import("../utils/audio");
  const { Audio } = await import("../utils/expoAvCompat");
  const A = "https://clips.test/a.mp3";
  const B = "https://clips.test/b.mp3";
  const C = "https://clips.test/c.mp3";
  const D = "https://clips.test/d.mp3";

  // 1. Shim waits for the clip to load before handing it back.
  loadMs.set(A, 60);
  const t0 = Date.now();
  const made = await Audio.Sound.createAsync(
    { uri: A },
    { shouldPlay: false, isLooping: true },
  );
  assert(
    "createAsync resolves only after the clip loaded",
    FakePlayer.all[0].isLoaded && Date.now() - t0 >= 50,
  );
  await made.sound.unloadAsync();
  assert("unloadAsync pauses and removes the player", FakePlayer.all[0].removed && !FakePlayer.all[0].playing);
  reset();

  // 2. Cold start gate.
  const gated = audio.playClip(A);
  assert("playClip is a no-op before the first gesture", gated === 0 && FakePlayer.all.length === 0);
  audio.markUserInteracted();

  // 3. Slow first clip, then a swipe to a second one: only the latest plays.
  reset();
  loadMs.set(A, 120);
  loadMs.set(B, 20);
  audio.playClip(A);
  await delay(10);
  audio.playClip(B);
  await delay(400);
  assert("latest card's clip is the one playing", audible().length === 1 && audible()[0].url === B, audible().map((p) => p.url).join(","));
  assert("the skipped clip never played", !FakePlayer.all.some((p) => p.url === A && p.playing));
  assert("never two clips at once (slow load then swipe)", maxAudible <= 1, `max=${maxAudible}`);
  await audio.stop();

  // 4. A swipe silences the previous clip immediately, before the next loads.
  reset();
  loadMs.set(A, 10);
  loadMs.set(B, 300);
  audio.playClip(A);
  await delay(80);
  assert("first clip is audible", audible().length === 1 && audible()[0].url === A);
  audio.playClip(B);
  await delay(60);
  assert("previous clip is silent while the next one still loads", audible().length === 0, audible().map((p) => p.url).join(","));
  await delay(450);
  assert("next clip starts once loaded", audible().length === 1 && audible()[0].url === B);
  assert("never two clips at once (swipe during load)", maxAudible <= 1, `max=${maxAudible}`);
  await audio.stop();

  // 5. A slow load cannot hold back a pause (tab change).
  reset();
  loadMs.set(A, 400);
  audio.playClip(A);
  await delay(20);
  const t1 = Date.now();
  await audio.pause();
  assert("pause is not queued behind a slow download", Date.now() - t1 < 100, `${Date.now() - t1}ms`);
  await delay(600);
  assert("clip stays silent after the tab change", audible().length === 0 && maxAudible === 0, `max=${maxAudible}`);
  await audio.stop();

  // 6. Five quick swipes: only the last clip is ever audible.
  reset();
  const urls = [A, B, C, D, "https://clips.test/e.mp3"];
  urls.forEach((u, i) => loadMs.set(u, 30 + i * 15));
  for (const u of urls) {
    audio.playClip(u);
    await delay(15);
  }
  await delay(500);
  assert("only the last of five swipes plays", audible().length === 1 && audible()[0].url === urls[4], audible().map((p) => p.url).join(","));
  assert("never two clips at once (rapid swipes)", maxAudible <= 1, `max=${maxAudible}`);
  await audio.stop();

  // 7. Prewarmed next clip starts immediately and nothing doubles up.
  reset();
  loadMs.set(A, 10);
  loadMs.set(B, 10);
  audio.playClip(A);
  audio.prewarmClip(B);
  await delay(100);
  assert("prewarm does not play", audible().length === 1 && audible()[0].url === A);
  audio.playClip(B);
  await delay(40);
  assert("prewarmed clip takes over", audible().length === 1 && audible()[0].url === B);
  assert("never two clips at once (prewarm hand-off)", maxAudible <= 1, `max=${maxAudible}`);
  assert("hand-off reuses the prewarmed player", FakePlayer.all.filter((p) => p.url === B).length === 1);
  await audio.stop();

  // 8. A clip that fails to load stays silent and does not wedge the queue.
  reset();
  failUrls.add(C);
  loadMs.set(D, 10);
  audio.playClip(C);
  await delay(50);
  audio.playClip(D);
  await delay(10_300);
  assert("a later clip still plays after a failed load", audible().length === 1 && audible()[0].url === D, audible().map((p) => p.url).join(","));
  assert("failed clip never played", !FakePlayer.all.some((p) => p.url === C && p.playing));
  assert("failed player is released", FakePlayer.all.filter((p) => p.url === C).every((p) => p.removed));
  await audio.stop();

  // 9. Same URL again resumes instead of reloading.
  reset();
  loadMs.set(A, 10);
  audio.playClip(A);
  await delay(60);
  await audio.pause();
  assert("pause silences the clip", audible().length === 0);
  audio.playClip(A);
  await delay(40);
  assert("same clip resumes without a second player", audible().length === 1 && FakePlayer.all.length === 1);
  await audio.stop();

  // 10. Mute keeps a wanted clip silent; unmute restores it.
  reset();
  loadMs.set(A, 10);
  audio.playClip(A);
  await delay(60);
  audio.setMuted(true);
  await delay(30);
  assert("mute silences the clip", audible().length === 0);
  audio.setMuted(false);
  await delay(30);
  assert("unmute restores the wanted clip", audible().length === 1);
  await audio.stop();

  console.log("Done. exitCode=", process.exitCode ?? 0);
}

void main();
