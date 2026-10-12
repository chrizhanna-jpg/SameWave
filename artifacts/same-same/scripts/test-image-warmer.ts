/**
 * Behavioural checks for the Ripple deck image warmer and the ready-first deck
 * queue, run on a virtual clock against a fake network (no device needed).
 * Run from artifacts/same-same: tsx scripts/test-image-warmer.ts
 */
import { createImageWarmer, type WarmerEvent } from "../utils/imageWarmer";
import { takeReadyFirst } from "../utils/deckQueue";
import {
  POOL_MAX_AGE_MS,
  POOL_REFETCH_MIN_UNSEEN,
  shouldRefetchDeckPool,
} from "../utils/deckPoolRefresh";

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok || !detail ? "" : ` (${detail})`}`);
  if (!ok) process.exitCode = 1;
}

class VirtualClock {
  t = 0;
  private seq = 0;
  private timers: { at: number; id: number; fn: () => void }[] = [];
  now = () => this.t;
  setTimer = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.timers.push({ at: this.t + ms, id, fn });
    return id;
  };
  clearTimer = (h: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== h);
  };
  async advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      await Promise.resolve();
      await Promise.resolve();
      const due = this.timers
        .filter((x) => x.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x.id !== due.id);
      this.t = Math.max(this.t, due.at);
      due.fn();
    }
    this.t = target;
    await Promise.resolve();
    await Promise.resolve();
  }
}

type NetOpts = {
  latency?: (uri: string) => number;
  fail?: (uri: string, attempt: number) => boolean;
  hang?: (uri: string) => boolean;
};

function makeWarmer(clock: VirtualClock, net: NetOpts = {}, extra = {}) {
  const log: { uri: string; at: number }[] = [];
  const events: WarmerEvent[] = [];
  const attempts = new Map<string, number>();
  let active = 0;
  let maxActive = 0;
  let maxAuthedActive = 0;
  let authedActive = 0;
  const warmer = createImageWarmer({
    resolve: (uri) => ({
      uri,
      inline: uri.startsWith("data:"),
      authed: uri.includes("/api/photos/"),
    }),
    prefetch: (uri, authed) =>
      new Promise<boolean>((resolve) => {
        const n = (attempts.get(uri) ?? 0) + 1;
        attempts.set(uri, n);
        log.push({ uri, at: clock.t });
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (authed) {
          authedActive += 1;
          maxAuthedActive = Math.max(maxAuthedActive, authedActive);
        }
        const done = (ok: boolean) => {
          active -= 1;
          if (authed) authedActive -= 1;
          resolve(ok);
        };
        if (net.hang?.(uri)) {
          clock.setTimer(() => done(false), 10 * 60_000);
          return;
        }
        clock.setTimer(
          () => done(!(net.fail?.(uri, n) ?? false)),
          net.latency?.(uri) ?? 100,
        );
      }),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onEvent: (e) => events.push(e),
    ...extra,
  });
  return { warmer, log, events, attempts, stats: () => ({ maxActive, maxAuthedActive }) };
}

const cdn = (n: number) => `https://images.unsplash.com/photo-${n}?w=960`;
const api = (n: number) => `https://api.test/api/photos/p${n}/image?w=960`;

async function main() {
  // ── Basics ───────────────────────────────────────────────────────────
  {
    const clock = new VirtualClock();
    const { warmer, log } = makeWarmer(clock);
    warmer.warm([cdn(1), cdn(1), cdn(2)]);
    warmer.warm([cdn(1)]);
    await clock.advance(10);
    assert("a photo requested several times downloads once", log.filter((l) => l.uri === cdn(1)).length === 1);
    assert("a photo is not ready before its download finishes", !warmer.isReady(cdn(1)));
    await clock.advance(200);
    assert("a photo is ready once downloaded", warmer.isReady(cdn(1)) && warmer.isReady(cdn(2)));
    warmer.warm([cdn(1)]);
    await clock.advance(200);
    assert("a ready photo is never downloaded again", log.filter((l) => l.uri === cdn(1)).length === 1);
  }

  {
    const clock = new VirtualClock();
    const { warmer, log } = makeWarmer(clock);
    const inline = "data:image/jpeg;base64,AAAA";
    warmer.warm([inline]);
    assert("inline previews are ready without any download", warmer.isReady(inline) && log.length === 0);
    assert("inline previews never count as failed", !warmer.hasFailed(inline));
  }

  // ── Concurrency and ordering ─────────────────────────────────────────
  {
    const clock = new VirtualClock();
    const { warmer, stats, log } = makeWarmer(clock);
    warmer.warm([cdn(1), cdn(2), cdn(3), cdn(4), cdn(5), cdn(6)]);
    warmer.warm([api(1), api(2), api(3)]);
    await clock.advance(2000);
    const s = stats();
    assert("at most three downloads run together", s.maxActive <= 3, String(s.maxActive));
    assert("the server stream is fetched one photo at a time", s.maxAuthedActive === 1, String(s.maxAuthedActive));
    assert("photos from a CDN are not held up behind the server stream", log.slice(0, 3).some((l) => l.uri.startsWith("https://images")));
    assert("everything queued eventually downloads", [cdn(6), api(3)].every((u) => warmer.isReady(u)));
  }

  {
    const clock = new VirtualClock();
    const { warmer, log } = makeWarmer(clock, { latency: () => 500 }, { maxConcurrent: 1 });
    warmer.warm([cdn(1)]);
    warmer.warm([cdn(2), cdn(3), cdn(4)], 5);
    warmer.warm([cdn(4)], -1);
    await clock.advance(3000);
    const order = log.map((l) => l.uri);
    assert(
      "the nearest card downloads first, and a card that moves up jumps the line",
      order[0] === cdn(1) && order[1] === cdn(4) && order[2] === cdn(2) && order[3] === cdn(3),
      order.join(","),
    );
  }

  // ── Failure handling ────────────────────────────────────────────────
  {
    const clock = new VirtualClock();
    const { warmer, attempts } = makeWarmer(clock, { fail: (_u, n) => n === 1 });
    warmer.warm([cdn(1)]);
    await clock.advance(150);
    assert("a first failure is not final", !warmer.hasFailed(cdn(1)) && !warmer.isReady(cdn(1)));
    await clock.advance(2000);
    assert("a transient failure is retried and the photo becomes ready", warmer.isReady(cdn(1)) && attempts.get(cdn(1)) === 2);
  }

  {
    const clock = new VirtualClock();
    const { warmer, attempts } = makeWarmer(clock, { fail: () => true });
    warmer.warm([cdn(9)]);
    await clock.advance(3000);
    assert("a photo that keeps failing is reported as failed", warmer.hasFailed(cdn(9)) && !warmer.isReady(cdn(9)));
    assert("failed photos stop retrying", attempts.get(cdn(9)) === 2);
    warmer.warm([cdn(9)]);
    await clock.advance(500);
    assert("a failed photo is left alone during its cooldown", attempts.get(cdn(9)) === 2);
    await clock.advance(31_000);
    assert("the failure expires so the deck can try the photo again", !warmer.hasFailed(cdn(9)));
    warmer.warm([cdn(9)]);
    await clock.advance(200);
    assert("a photo is retried after the cooldown", attempts.get(cdn(9)) === 3);
  }

  {
    const clock = new VirtualClock();
    const { warmer, log } = makeWarmer(clock, { hang: (u) => u === cdn(1) }, { maxConcurrent: 1 });
    warmer.warm([cdn(1), cdn(2)]);
    await clock.advance(1000);
    assert("a stalled download holds the line only until its timeout", !log.some((l) => l.uri === cdn(2)));
    await clock.advance(20_000);
    assert("the next photo starts after the stalled one times out", log.some((l) => l.uri === cdn(2)));
  }

  {
    const clock = new VirtualClock();
    const { warmer } = makeWarmer(clock);
    let calls = 0;
    const off = warmer.subscribe(() => (calls += 1));
    warmer.warm([cdn(1)]);
    await clock.advance(500);
    assert("listeners hear when a photo becomes ready", calls > 0);
    off();
    const before = calls;
    warmer.warm([cdn(2)]);
    await clock.advance(500);
    assert("unsubscribed listeners hear nothing", calls === before);
  }

  {
    const clock = new VirtualClock();
    const { warmer } = makeWarmer(clock, { latency: () => 300 });
    warmer.warm([cdn(1)]);
    await clock.advance(100);
    warmer.reset();
    await clock.advance(1000);
    assert("a download that finishes after a reset does not mark anything ready", !warmer.isReady(cdn(1)));
  }

  // ── Ready-first queue ───────────────────────────────────────────────
  {
    type Card = { photo: { uri: string } };
    const keyOf = (u: string) => u.replace(/\?.*/, "");
    const queue: Card[] = [cdn(1), cdn(2), cdn(3), cdn(4)].map((u) => ({ photo: { uri: u } }));
    const readySet = new Set([cdn(3)]);
    const failedSet = new Set<string>();
    const opts = {
      keyOf,
      isExcluded: (k: string) => k === keyOf(cdn(4)),
      isReady: (u: string) => readySet.has(u),
      hasFailed: (u: string) => failedSet.has(u),
    };
    const first = takeReadyFirst(queue, opts);
    assert("a downloaded card is taken ahead of one still downloading", first?.photo.uri === cdn(3));
    assert("the skipped card keeps its place and excluded cards are dropped", queue.map((c) => c.photo.uri).join() === [cdn(1), cdn(2)].join());
    const second = takeReadyFirst(queue, opts);
    assert("with nothing downloaded the head of the queue is taken", second?.photo.uri === cdn(1));
    failedSet.add(cdn(2));
    assert("a card whose photo failed is never shown", takeReadyFirst(queue, opts) === null && queue.length === 0);
  }

  // ── Pool refetch policy ─────────────────────────────────────────────
  {
    const poolKeys = Array.from({ length: 24 }, (_, i) => `photo-${i}`);
    const seen = (n: number) => new Set(poolKeys.slice(0, n));
    const base = { sameQuery: true, poolKeys, ageMs: 1000 };
    assert("a swipe on a healthy pool does not hit the server", !shouldRefetchDeckPool({ ...base, seenKeys: seen(3) }));
    assert(
      "the pool is refetched when it runs low",
      shouldRefetchDeckPool({ ...base, seenKeys: seen(24 - POOL_REFETCH_MIN_UNSEEN + 1) }),
    );
    assert("a changed theme or tags refetch immediately", shouldRefetchDeckPool({ ...base, sameQuery: false, seenKeys: seen(0) }));
    assert("an empty pool is always refetched", shouldRefetchDeckPool({ ...base, poolKeys: [], seenKeys: seen(0) }));
    assert("a stale pool is refreshed so new uploads join the deck", shouldRefetchDeckPool({ ...base, ageMs: POOL_MAX_AGE_MS, seenKeys: seen(0) }));
  }

  // ── Deck session on a slow network ──────────────────────────────────
  // Each photo takes 3s to arrive and the viewer swipes every 1.2s. Compare waiting
  // time at swipe for the old shape (two cards ahead, strict order, one
  // server photo at a time) against the new one (four ahead, ready-first).
  async function session(opts: { lookahead: number; readyFirst: boolean }) {
    const clock = new VirtualClock();
    const latency = () => 3000;
    const { warmer } = makeWarmer(clock, { latency });
    const pool = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? api(i) : cdn(i)));
    let cursor = 0;
    let queue: { photo: { uri: string } }[] = [];
    const refill = () => {
      while (queue.length < opts.lookahead && cursor < pool.length) {
        queue.push({ photo: { uri: pool[cursor++] } });
      }
      warmer.warm(queue.map((c) => c.photo.uri));
    };
    refill();
    await clock.advance(6000);
    let waits = 0;
    let swipes = 0;
    for (let i = 0; i < 15; i++) {
      await clock.advance(1200);
      const next = opts.readyFirst
        ? takeReadyFirst(queue, {
            keyOf: (u) => u,
            isExcluded: () => false,
            isReady: (u) => warmer.isReady(u),
            hasFailed: () => false,
          })
        : queue.shift() ?? null;
      swipes += 1;
      if (next && !warmer.isReady(next.photo.uri)) waits += 1;
      refill();
    }
    return { waits, swipes };
  }
  const before = await session({ lookahead: 2, readyFirst: false });
  const after = await session({ lookahead: 4, readyFirst: true });
  console.log(`INFO slow network, 15 swipes: before ${before.waits} waits, after ${after.waits} waits`);
  assert("the new deck waits on far fewer swipes than the old one", after.waits < before.waits, `${before.waits} vs ${after.waits}`);
  assert("the new deck waits on at most one swipe even on a slow network", after.waits <= 1, String(after.waits));

  console.log(`Done. exitCode= ${process.exitCode ?? 0}`);
}

void main();
