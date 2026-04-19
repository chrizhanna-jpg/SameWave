export const TAG_EMOJI: Record<string, string> = {
  coffee: "☕", drink: "🥤", meal: "🍽️", bread: "🥖", dessert: "🍰",
  cooking: "🍳", baking: "🧁", warm: "🔥",
  trees: "🌳", sunset: "🌇", clouds: "☁️", stars: "⭐", night: "🌙",
  mountains: "⛰️", outdoors: "🌲", water: "💧", beach: "🏖️", snow: "❄️",
  plants: "🪴", flowers: "🌸",
  dog: "🐶", cat: "🐱", animal: "🐾", wildlife: "🦌",
  people: "👥", smile: "😊", celebration: "🎉", family: "👨‍👩‍👧",
  friends: "🫂", party: "🥳", kids: "🧒",
  art: "🎨", photography: "📸", music: "🎵", reading: "📚",
  crafts: "🧶", fashion: "👗",
  fitness: "💪", yoga: "🧘", hiking: "🥾", cycling: "🚴", running: "🏃",
  sports: "⚽", dancing: "💃", gaming: "🎮",
  travel: "✈️", home: "🏠", garden: "🌱", vintage: "📻", cozy: "🛋️",
  work: "💻", study: "📖",
  city: "🏙️", transit: "🚇", cafe: "☕",
  desk: "🖥️", laptop: "💻",
};

export function tagEmoji(tag: string): string {
  return TAG_EMOJI[tag] ?? "✨";
}

export function tagLabel(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export function computeMyVibe(
  photos: { tags?: string[] }[],
  limit = 6,
): string[] {
  const counts = new Map<string, number>();
  for (const p of photos) {
    for (const t of p.tags ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}

// Lifestyle/hobby-leaning tags used to pad out a match's "vibe" beyond the
// single photo's visual subjects, so two strangers feel like more than just
// "two people who both photographed coffee today".
const LIFESTYLE_FILLER = [
  "travel", "music", "reading", "fitness", "cooking", "art", "photography",
  "gaming", "yoga", "hiking", "cozy", "vintage", "fashion", "garden",
  "dancing", "crafts",
];

function seedFrom(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Expand a single photo's tags into a small "vibe" set (3–5 tags) by adding
 * 1–2 lifestyle tags derived deterministically from a seed (e.g. the photo
 * URI). Stable across renders so the same match always shows the same vibe.
 */
export function expandToVibe(photoTags: string[], seed: string): string[] {
  const out = new Set(photoTags);
  const filler = LIFESTYLE_FILLER.filter((t) => !out.has(t));
  if (filler.length === 0) return [...out].slice(0, 5);
  const s = seedFrom(seed);
  out.add(filler[s % filler.length]);
  if (filler.length > 1) {
    out.add(filler[(s * 7 + 13) % filler.length]);
  }
  return [...out].slice(0, 5);
}

export function commonInterests(
  myVibe: string[],
  theirVibe: string[],
): string[] {
  const set = new Set(myVibe);
  return theirVibe.filter((t) => set.has(t));
}
