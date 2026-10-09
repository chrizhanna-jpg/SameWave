/**
 * Serializes vibe-clip commands so a slow load cannot start after a newer
 * swipe or a tab change has already moved on.
 *
 * `bump()` invalidates every earlier command synchronously. Each command
 * runs only after the previous one finishes, then no-ops when its token
 * is no longer current.
 */
export function createAudioCommandQueue() {
  let chain: Promise<void> = Promise.resolve();
  let token = 0;

  function bump(): number {
    token += 1;
    return token;
  }

  function current(): number {
    return token;
  }

  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return { bump, current, enqueue };
}
