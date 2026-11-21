/**
 * Preset Topics for a Ripple. The user picks one from this list (never types
 * a free theme). Ids align with challenge/theme ids the server already scores
 * when possible, so upload and candidate matching keep working unchanged.
 */

export interface Topic {
  id: string;
  label: string;
  /** Extra words that surface this Topic in the type-ahead. */
  aliases: readonly string[];
}

/**
 * Broad enough to cover almost any photograph, short enough to scan.
 * Roughly two dozen everyday buckets.
 */
export const TOPICS: readonly Topic[] = [
  { id: "nature", label: "Nature", aliases: ["tree", "forest", "park", "flower", "garden", "outdoors", "landscape"] },
  { id: "sky", label: "Sky", aliases: ["cloud", "clouds", "sunset", "sunrise", "horizon", "stars"] },
  { id: "weather", label: "Weather", aliases: ["rain", "snow", "fog", "storm", "sun", "wind"] },
  { id: "water", label: "Water", aliases: ["sea", "ocean", "beach", "lake", "river", "pool", "rain"] },
  { id: "people", label: "People", aliases: ["person", "friend", "friends", "family", "crowd", "portrait", "selfie"] },
  { id: "pets", label: "Pets", aliases: ["dog", "cat", "puppy", "kitten", "animal", "bird"] },
  { id: "food", label: "Food", aliases: ["meal", "lunch", "dinner", "breakfast", "snack", "cooking", "plate"] },
  { id: "coffee", label: "Drinks", aliases: ["tea", "drink", "cafe", "café", "cup", "coffee"] },
  { id: "home", label: "Home", aliases: ["house", "room", "sofa", "kitchen", "bedroom", "furniture"] },
  { id: "city", label: "City", aliases: ["street", "building", "urban", "skyline", "downtown", "architecture"] },
  { id: "travel", label: "Travel", aliases: ["trip", "holiday", "vacation", "airport", "train", "passport"] },
  { id: "work", label: "Work", aliases: ["office", "desk", "laptop", "meeting", "job", "workspace"] },
  { id: "movement", label: "Movement", aliases: ["walk", "run", "sport", "gym", "bike", "dance", "workout"] },
  { id: "music", label: "Music", aliases: ["concert", "guitar", "piano", "headphones", "song", "band"] },
  { id: "art", label: "Art", aliases: ["drawing", "painting", "craft", "made", "creative", "design"] },
  { id: "reading", label: "Reading", aliases: ["book", "books", "page", "library", "magazine"] },
  { id: "night", label: "Night", aliases: ["evening", "dark", "lights", "moon"] },
  { id: "morning", label: "Morning", aliases: ["dawn", "breakfast", "early"] },
  { id: "commute", label: "Commute", aliases: ["bus", "car", "metro", "subway", "road", "wheels"] },
  { id: "shopping", label: "Shopping", aliases: ["shop", "store", "market", "groceries", "haul"] },
  { id: "clothes", label: "Clothes", aliases: ["outfit", "fashion", "wearing", "shoes", "dress"] },
  { id: "objects", label: "Objects", aliases: ["thing", "gift", "tool", "phone", "camera"] },
  { id: "celebration", label: "Celebration", aliases: ["party", "birthday", "wedding", "festival", "cheers"] },
  { id: "quiet", label: "Quiet", aliases: ["alone", "still", "empty", "peace", "silence"] },
];

export function topicFor(id: string | null | undefined): Topic | null {
  if (!id) return null;
  return TOPICS.find((t) => t.id === id) ?? null;
}

/**
 * Topics whose label or aliases match the typed text.
 * From the first letter the list shortens; by three letters it is clearly narrowed.
 */
export function filterTopics(query: string): Topic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...TOPICS];
  const scored = TOPICS.map((topic) => {
    const label = topic.label.toLowerCase();
    const id = topic.id.toLowerCase();
    let score = 0;
    if (label === q || id === q) score = 100;
    else if (label.startsWith(q) || id.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 50;
    else {
      for (const alias of topic.aliases) {
        const a = alias.toLowerCase();
        if (a === q) {
          score = Math.max(score, 90);
          break;
        }
        if (a.startsWith(q)) score = Math.max(score, 70);
        else if (q.length >= 3 && a.includes(q)) score = Math.max(score, 40);
      }
    }
    return { topic, score };
  }).filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score || a.topic.label.localeCompare(b.topic.label));
  return scored.map((row) => row.topic);
}

/** Same Topic → 1, otherwise 0 (Topics are presets, not a graded family). */
export function topicAffinity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  return a === b ? 1 : 0;
}
