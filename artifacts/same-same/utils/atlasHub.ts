/** Lets Match / Profile refresh the Atlas tab without prop drilling. */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Notify any mounted Atlas screen to refetch `/api/photos/atlas`. */
export function requestAtlasRefresh(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  }
}

export function registerAtlasRefreshListener(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
