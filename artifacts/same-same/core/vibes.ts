/**
 * Looking up the feeling that travelled with a photo, and its clip identity.
 * Bundled module resolution lives in `clipSourceFor` (lazy) so unit tests
 * never pull Metro asset requires.
 */
import { CLIP_TITLES } from "../data/musicCredits";
import { VIBES, type Vibe } from "../data/vibes";

export function vibeFor(id: string | null | undefined): Vibe | null {
  if (!id) return null;
  return VIBES.find((v) => v.id === id) ?? null;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Decode a vibe clip entry to its original filename key. */
export function clipFileFor(id: string | null | undefined, seed: string): string | null {
  const vibe = vibeFor(id);
  if (!vibe || vibe.clips.length === 0) return null;
  const encoded = vibe.clips[hash(seed) % vibe.clips.length];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/** Human track title for the seeded clip. */
export function clipTitleFor(id: string | null | undefined, seed: string): string | null {
  const file = clipFileFor(id, seed);
  if (!file) return null;
  return CLIP_TITLES[file] ?? file.replace(/\.mp3$/i, "");
}

/** Bundled require() module for a feeling + seed, or null. */
export function clipSourceFor(id: string | null | undefined, seed: string): number | null {
  const file = clipFileFor(id, seed);
  if (!file) return null;
  // Lazy so node:test can import clipFileFor / vibeFor without Metro assets.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CLIP_MODULES } = require("../assets/music/registry") as {
    CLIP_MODULES: Record<string, number>;
  };
  return CLIP_MODULES[file] ?? null;
}

/**
 * @deprecated Hotlinked URLs removed — use clipSourceFor for playback.
 */
export function clipUrlFor(_id: string | null | undefined, _seed: string): string | null {
  return null;
}
