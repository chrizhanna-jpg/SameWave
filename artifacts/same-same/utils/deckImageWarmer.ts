import { Image } from "expo-image";
import {
  authedImageHeaders,
  explorePhotoUriNeedsAuth,
  refreshAuthedImageHeaders,
} from "@/utils/api";
import { deckImageUri } from "@/utils/remotePhotoSource";
import { createImageWarmer } from "@/utils/imageWarmer";

const warmer = createImageWarmer({
  resolve: (uri) => {
    const resolved = deckImageUri(uri);
    if (!resolved) return null;
    return {
      uri: resolved,
      inline: resolved.startsWith("data:"),
      authed: explorePhotoUriNeedsAuth(resolved),
    };
  },
  prefetch: async (uri, authed) => {
    if (!authed) return Image.prefetch(uri);
    let headers = await authedImageHeaders();
    if (!headers.Authorization?.startsWith("Bearer ")) {
      headers = await refreshAuthedImageHeaders();
    }
    if (!headers.Authorization?.startsWith("Bearer ")) return false;
    if (await Image.prefetch(uri, { headers })) return true;
    // A rejected request may mean the cached token expired — try a fresh one.
    const fresh = await refreshAuthedImageHeaders();
    if (!fresh.Authorization?.startsWith("Bearer ")) return false;
    return Image.prefetch(uri, { headers: fresh });
  },
  onEvent: (e) => {
    if (!__DEV__) return;
    if (e.type === "ready" || e.type === "failed" || e.type === "retry") {
      console.log(`[deck-img] ${e.type} ${e.ms}ms ${shortUri(e.uri)}`);
    }
  },
});

function shortUri(uri: string): string {
  return uri.length > 90 ? `${uri.slice(0, 90)}…` : uri;
}

/** Download these Ripple photos into the image cache, nearest card first. */
export function warmDeckImages(uris: readonly string[], priority = 0): void {
  warmer.warm(uris, priority);
}

export function isDeckImageReady(uri: string): boolean {
  return warmer.isReady(uri);
}

export function hasDeckImageFailed(uri: string): boolean {
  return warmer.hasFailed(uri);
}

export function subscribeDeckImages(listener: () => void): () => void {
  return warmer.subscribe(listener);
}
