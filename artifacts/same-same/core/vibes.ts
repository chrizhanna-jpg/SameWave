/**
 * Looking up the feeling that travelled with a photo.
 */
import { CLIP_BASE, VIBES, type Vibe } from "../data/vibes";

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

/** The clip for a feeling. The same photo always gets the same clip. */
export function clipUrlFor(id: string | null | undefined, seed: string): string | null {
  const vibe = vibeFor(id);
  if (!vibe || vibe.clips.length === 0) return null;
  const clip = vibe.clips[hash(seed) % vibe.clips.length];
  return clip ? CLIP_BASE + clip : null;
}
