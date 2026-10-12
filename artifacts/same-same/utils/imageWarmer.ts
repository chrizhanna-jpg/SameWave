/**
 * Deck image warmer: downloads upcoming Ripple photos into the native image
 * cache before the card is shown, and remembers which ones are ready so the
 * deck can always pick a photo that is already on the device.
 *
 * Pure logic (no React Native imports) so it can be exercised against a fake
 * network. The runtime wiring lives in `deckImageWarmer.ts`.
 */

export type ResolvedImage = {
  /** Exact URI the image view will request (cache key). */
  uri: string;
  /** Needs no download at all (data: URI). */
  inline: boolean;
  /** Streams from the authenticated API — gentler concurrency. */
  authed: boolean;
};

export type WarmerEvent =
  | { type: "start"; uri: string }
  | { type: "ready"; uri: string; ms: number }
  | { type: "retry"; uri: string; ms: number }
  | { type: "failed"; uri: string; ms: number };

export type WarmerDeps = {
  resolve: (uri: string) => ResolvedImage | null;
  /** Resolves true when the image is in the cache, false/throws when not. */
  prefetch: (uri: string, authed: boolean) => Promise<boolean>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  maxConcurrent?: number;
  maxAuthedConcurrent?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  /** A failed photo is skipped by the deck until this long after the failure. */
  failedCooldownMs?: number;
  maxReady?: number;
  onEvent?: (e: WarmerEvent) => void;
};

type Entry = {
  uri: string;
  authed: boolean;
  priority: number;
  seq: number;
  attempts: number;
  startedAt: number;
  timeout?: unknown;
  retryTimer?: unknown;
};

export type ImageWarmer = {
  /** Queue photos in the order given; lower `priority` downloads sooner. */
  warm: (uris: readonly string[], priority?: number) => void;
  isReady: (uri: string) => boolean;
  hasFailed: (uri: string) => boolean;
  subscribe: (listener: () => void) => () => void;
  stats: () => { queued: number; active: number; ready: number; failed: number };
  reset: () => void;
};

const DEFAULTS = {
  maxConcurrent: 3,
  maxAuthedConcurrent: 1,
  timeoutMs: 20_000,
  retryDelayMs: 1_200,
  failedCooldownMs: 30_000,
  maxReady: 200,
  maxAttempts: 2,
};

export function createImageWarmer(deps: WarmerDeps): ImageWarmer {
  const now = deps.now ?? (() => Date.now());
  const setTimer =
    deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer =
    deps.clearTimer ??
    ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const maxConcurrent = deps.maxConcurrent ?? DEFAULTS.maxConcurrent;
  const maxAuthed = deps.maxAuthedConcurrent ?? DEFAULTS.maxAuthedConcurrent;
  const timeoutMs = deps.timeoutMs ?? DEFAULTS.timeoutMs;
  const retryDelayMs = deps.retryDelayMs ?? DEFAULTS.retryDelayMs;
  const cooldownMs = deps.failedCooldownMs ?? DEFAULTS.failedCooldownMs;
  const maxReady = deps.maxReady ?? DEFAULTS.maxReady;

  const ready = new Set<string>();
  const failed = new Map<string, number>();
  const queued = new Map<string, Entry>();
  const active = new Map<string, Entry>();
  const waitingRetry = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let seq = 0;
  let epoch = 0;

  const emit = (e: WarmerEvent) => {
    try {
      deps.onEvent?.(e);
    } catch {
      /* observers never break the warmer */
    }
  };
  const notify = () => {
    listeners.forEach((l) => {
      try {
        l();
      } catch {
        /* ignore */
      }
    });
  };

  const markReady = (uri: string) => {
    ready.delete(uri);
    ready.add(uri);
    failed.delete(uri);
    while (ready.size > maxReady) {
      const oldest = ready.values().next().value;
      if (oldest === undefined) break;
      ready.delete(oldest);
    }
  };

  const activeAuthed = () => {
    let n = 0;
    active.forEach((e) => {
      if (e.authed) n += 1;
    });
    return n;
  };

  const nextStartable = (): Entry | null => {
    const authedBusy = activeAuthed() >= maxAuthed;
    let best: Entry | null = null;
    queued.forEach((e) => {
      if (e.authed && authedBusy) return;
      if (
        !best ||
        e.priority < best.priority ||
        (e.priority === best.priority && e.seq < best.seq)
      ) {
        best = e;
      }
    });
    return best;
  };

  const finish = (entry: Entry, ok: boolean, token: number) => {
    if (token !== epoch) return;
    if (active.get(entry.uri) !== entry) return;
    active.delete(entry.uri);
    if (entry.timeout !== undefined) clearTimer(entry.timeout);
    entry.timeout = undefined;
    const ms = now() - entry.startedAt;
    if (ok) {
      markReady(entry.uri);
      emit({ type: "ready", uri: entry.uri, ms });
    } else if (entry.attempts < DEFAULTS.maxAttempts) {
      emit({ type: "retry", uri: entry.uri, ms });
      waitingRetry.set(entry.uri, entry);
      entry.retryTimer = setTimer(() => {
        if (token !== epoch) return;
        if (waitingRetry.get(entry.uri) !== entry) return;
        waitingRetry.delete(entry.uri);
        queued.set(entry.uri, entry);
        pump();
      }, retryDelayMs);
    } else {
      failed.set(entry.uri, now());
      emit({ type: "failed", uri: entry.uri, ms });
    }
    notify();
    pump();
  };

  const start = (entry: Entry) => {
    queued.delete(entry.uri);
    active.set(entry.uri, entry);
    entry.attempts += 1;
    entry.startedAt = now();
    const token = epoch;
    emit({ type: "start", uri: entry.uri });
    entry.timeout = setTimer(() => finish(entry, false, token), timeoutMs);
    let p: Promise<boolean>;
    try {
      p = Promise.resolve(deps.prefetch(entry.uri, entry.authed));
    } catch {
      p = Promise.resolve(false);
    }
    p.then(
      (ok) => finish(entry, ok === true, token),
      () => finish(entry, false, token),
    );
  };

  function pump() {
    while (active.size < maxConcurrent) {
      const entry = nextStartable();
      if (!entry) return;
      start(entry);
    }
  }

  return {
    warm(uris, priority = 0) {
      let changed = false;
      uris.forEach((raw, index) => {
        if (typeof raw !== "string" || raw.trim().length === 0) return;
        const r = deps.resolve(raw);
        if (!r || !r.uri) return;
        const p = priority + index;
        if (r.inline) {
          if (!ready.has(r.uri)) {
            markReady(r.uri);
            changed = true;
          }
          return;
        }
        if (ready.has(r.uri)) return;
        const failedAt = failed.get(r.uri);
        if (failedAt !== undefined) {
          if (now() - failedAt < cooldownMs) return;
          failed.delete(r.uri);
          changed = true;
        }
        const running = active.get(r.uri);
        if (running) {
          running.priority = Math.min(running.priority, p);
          return;
        }
        const waiting = waitingRetry.get(r.uri);
        if (waiting) {
          waiting.priority = Math.min(waiting.priority, p);
          return;
        }
        const existing = queued.get(r.uri);
        if (existing) {
          existing.priority = Math.min(existing.priority, p);
          return;
        }
        seq += 1;
        queued.set(r.uri, {
          uri: r.uri,
          authed: r.authed,
          priority: p,
          seq,
          attempts: 0,
          startedAt: 0,
        });
      });
      if (changed) notify();
      pump();
    },
    isReady(uri) {
      const r = deps.resolve(uri);
      if (!r || !r.uri) return false;
      return r.inline || ready.has(r.uri);
    },
    hasFailed(uri) {
      const r = deps.resolve(uri);
      if (!r || !r.uri || r.inline) return false;
      const at = failed.get(r.uri);
      return at !== undefined && now() - at < cooldownMs;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stats() {
      return {
        queued: queued.size,
        active: active.size,
        ready: ready.size,
        failed: failed.size,
      };
    },
    reset() {
      epoch += 1;
      active.forEach((e) => e.timeout !== undefined && clearTimer(e.timeout));
      waitingRetry.forEach(
        (e) => e.retryTimer !== undefined && clearTimer(e.retryTimer),
      );
      queued.clear();
      active.clear();
      waitingRetry.clear();
      ready.clear();
      failed.clear();
      notify();
    },
  };
}
