/**
 * Soundtrack + playback-queue checks. No native modules.
 * Run: pnpm exec tsx scripts/test-tab-audio.ts
 */
import { createAudioCommandQueue } from "../utils/audioCommandQueue";
import { focusActions } from "../utils/tabSoundtrackPolicy";

function assert(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const home = focusActions("home");
assert("home pauses the ripple vibe", home.includes("pause-vibe"));
assert("home stops atlas ambience", home.includes("stop-ambience"));
assert("home does not start ambience", !home.includes("start-ambience"));

const waves = focusActions("waves");
assert(
  "waves silences both players",
  waves.includes("pause-vibe") && waves.includes("stop-ambience"),
);

const profile = focusActions("profile");
assert(
  "my path silences both players",
  profile.includes("pause-vibe") && profile.includes("stop-ambience"),
);

const atlas = focusActions("atlas");
assert("atlas pauses the ripple vibe", atlas.includes("pause-vibe"));
assert("atlas starts its own ambience", atlas.includes("start-ambience"));
assert(
  "atlas focus does not stop the loop it just started",
  !atlas.includes("stop-ambience"),
);

const match = focusActions("match");
assert("ripple stops atlas ambience", match.includes("stop-ambience"));
assert(
  "ripple focus does not pause its own card",
  !match.includes("pause-vibe"),
);
assert("ripple plays the visible card on focus", match.includes("play-ripple"));

async function main(): Promise<void> {
  const events: string[] = [];
  const queue = createAudioCommandQueue();
  const playLease = queue.bump();
  const playing = queue.enqueue(async () => {
    await delay(30);
    if (playLease !== queue.current()) {
      events.push("stale-play-skipped");
      return;
    }
    events.push("played");
  });
  const pauseLease = queue.bump();
  const pausing = queue.enqueue(async () => {
    if (pauseLease !== queue.current()) {
      events.push("stale-pause-skipped");
      return;
    }
    events.push("paused");
  });
  await playing;
  await pausing;
  assert(
    "in-flight swipe play does not start after a newer command",
    events[0] === "stale-play-skipped",
  );
  assert("pause applies after that in-flight play", events[1] === "paused");
  assert("the older clip never starts", !events.includes("played"));

  const swipes: string[] = [];
  const swipeQueue = createAudioCommandQueue();
  const first = swipeQueue.bump();
  const firstTask = swipeQueue.enqueue(async () => {
    await delay(20);
    if (first !== swipeQueue.current()) return;
    swipes.push("old");
  });
  const second = swipeQueue.bump();
  const secondTask = swipeQueue.enqueue(async () => {
    if (second !== swipeQueue.current()) return;
    swipes.push("new");
  });
  await firstTask;
  await secondTask;
  assert(
    "only the latest swipe finishes",
    swipes.length === 1 && swipes[0] === "new",
  );

  console.log("Done. exitCode=", process.exitCode ?? 0);
}

void main();
