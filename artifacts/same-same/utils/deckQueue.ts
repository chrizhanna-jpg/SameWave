type QueuedCard = { photo: { uri: string } };

/**
 * Takes the next card from the upcoming queue, mutating it. Cards that are
 * excluded or whose photo failed to download are dropped; among the rest the
 * first one whose photo has already downloaded wins, so a swipe never waits on
 * a slow photo while a ready one sits behind it. The skipped card keeps its
 * place and comes next once it arrives. When nothing is ready yet the head of
 * the queue is taken and loads as it is shown.
 */
export function takeReadyFirst<T extends QueuedCard>(
  queue: T[],
  opts: {
    keyOf: (uri: string) => string;
    isExcluded: (key: string) => boolean;
    isReady: (uri: string) => boolean;
    hasFailed: (uri: string) => boolean;
  },
): T | null {
  let firstReady = -1;
  for (let i = 0; i < queue.length; i++) {
    const uri = queue[i].photo.uri;
    const key = opts.keyOf(uri);
    if (!key || opts.isExcluded(key) || opts.hasFailed(uri)) {
      queue.splice(i, 1);
      i -= 1;
      continue;
    }
    if (firstReady === -1 && opts.isReady(uri)) firstReady = i;
  }
  if (queue.length === 0) return null;
  return queue.splice(firstReady === -1 ? 0 : firstReady, 1)[0] ?? null;
}
