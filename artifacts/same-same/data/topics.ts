/**
 * Preset Topics for a Ripple — everyday life moments and occasions
 * (not abstract photo categories). One flat list; type-ahead uses labels
 * and aliases. Ids reuse challenge/theme ids the server already scores
 * when a close match exists.
 *
 * Base style from Chris (Holiday, Road trip, Family, Dinner, Coffee & tea…).
 * Additions beyond his examples (flag in report / PR): Brunch, Picnic,
 * Café, Camping, Groceries, Cooking, Night in, Daily ritual, Chores,
 * Favourite chair, Something I love, Front door, A small good thing,
 * On wheels, By the water, Plants, Sunrise, Sky, Weather, Listening,
 * Something I made, Hobby, Games, Outfit, Selfie, and similar fill-ins
 * at the same grain.
 *
 * Approved by Chris — edit this file only when intentionally changing the list.
 */

export interface Topic {
  id: string;
  label: string;
  /** Extra words that surface this Topic in the type-ahead. */
  aliases: readonly string[];
}

export const TOPICS: readonly Topic[] = [
  { id: "family", label: "Family", aliases: ["mum", "mom", "dad", "parents", "kids", "child", "children", "relatives", "siblings", "cousin"] },
  { id: "friends", label: "Friends", aliases: ["friend", "mate", "mates", "buddy", "crew", "gang", "hangout", "hang out"] },
  { id: "date", label: "Date", aliases: ["dating", "partner", "boyfriend", "girlfriend", "romantic", "dinner date"] },
  { id: "baby", label: "Baby", aliases: ["infant", "newborn", "toddler", "buggy", "pram", "nursery"] },
  { id: "pets", label: "Pets", aliases: ["dog", "cat", "puppy", "kitten", "pet", "animal", "dog walk"] },

  { id: "breakfast", label: "Breakfast", aliases: ["morning meal", "toast", "cereal", "eggs"] },
  { id: "brunch", label: "Brunch", aliases: ["late breakfast", "weekend brunch", "avocado"] },
  { id: "lunch", label: "Lunch", aliases: ["midday", "sandwich", "salad", "soup", "noon meal"] },
  { id: "dinner", label: "Dinner", aliases: ["supper", "evening meal", "roast", "takeaway"] },
  { id: "picnic", label: "Picnic", aliases: ["outdoor lunch", "blanket meal", "park lunch", "hamper"] },
  { id: "coffee", label: "Coffee & tea", aliases: ["tea", "latte", "espresso", "cappuccino", "cuppa", "drink", "brew", "coffee"] },
  { id: "cafe", label: "Café", aliases: ["coffee shop", "coffeehouse", "bakery sit-in", "tea room"] },
  { id: "cooking", label: "Cooking", aliases: ["bake", "baking", "kitchen", "recipe", "chopping", "stove", "oven", "meal prep"] },
  { id: "groceries", label: "Groceries", aliases: ["supermarket", "market shop", "food shop", "trolley"] },

  { id: "holiday", label: "Holiday", aliases: ["vacation", "trip away", "getaway", "abroad", "resort", "break"] },
  { id: "roadtrip", label: "Road trip", aliases: ["roadtrip", "drive", "highway", "car journey", "scenic drive"] },
  { id: "travel", label: "Travel", aliases: ["airport", "flight", "passport", "suitcase", "journey", "station"] },
  { id: "camping", label: "Camping", aliases: ["tent", "campsite", "glamping", "campfire", "sleep under stars"] },
  { id: "city", label: "City", aliases: ["urban", "downtown", "skyline", "street", "town centre"] },
  { id: "commute", label: "Commute", aliases: ["bus", "train", "tube", "metro", "subway", "drive to work", "on the way"] },
  { id: "wheels", label: "On wheels", aliases: ["car", "bike", "bicycle", "scooter", "motorbike", "driving", "cycling"] },
  { id: "work", label: "Work", aliases: ["office", "job", "desk", "meeting", "colleague", "workplace", "wfh"] },
  { id: "study", label: "Study", aliases: ["school", "uni", "university", "college", "homework", "revision", "exam"] },
  { id: "shopping", label: "Shopping", aliases: ["shop", "stores", "high street", "mall", "haul", "browsing"] },
  { id: "nightout", label: "Night out", aliases: ["going out", "bar", "pub", "club", "drinks", "evening out"] },

  { id: "nature", label: "Nature", aliases: ["outdoors", "woods", "forest", "park", "wild"] },
  { id: "beach", label: "Beach", aliases: ["seaside", "sand", "shore", "coast", "ocean", "sea swim"] },
  { id: "mountains", label: "Mountains", aliases: ["hike", "hiking", "hill", "peak", "trail", "alpine", "summit"] },
  { id: "countryside", label: "Countryside", aliases: ["rural", "fields", "farm", "village", "country lane", "meadow"] },
  { id: "garden", label: "Garden", aliases: ["yard", "backyard", "allotment", "patio", "balcony garden"] },
  { id: "plants", label: "Plants", aliases: ["houseplant", "flower", "flowers", "pot plant", "greenery"] },
  { id: "water", label: "By the water", aliases: ["lake", "river", "canal", "pond", "harbour", "dock"] },
  { id: "sunset", label: "Sunset", aliases: ["dusk", "golden hour", "evening sky", "sundown"] },
  { id: "sunrise", label: "Sunrise", aliases: ["dawn sky", "first light", "morning sky"] },
  { id: "sky", label: "Sky", aliases: ["clouds", "blue sky", "horizon", "looking up"] },
  { id: "rain", label: "Rain", aliases: ["rainy", "umbrella", "drizzle", "wet day", "puddles"] },
  { id: "snow", label: "Snow", aliases: ["snowy", "winter day", "frost", "snowfall"] },
  { id: "weather", label: "Weather", aliases: ["storm", "wind", "fog", "mist", "sunny day", "cloudy"] },

  { id: "home", label: "Home", aliases: ["house", "flat", "apartment", "living room", "sofa", "couch", "bedroom", "at home"] },
  { id: "morning", label: "Morning", aliases: ["dawn", "early", "waking up", "start of day"] },
  { id: "night", label: "Night in", aliases: ["evening in", "cosy night", "movie night", "sofa night"] },
  { id: "weekend", label: "Weekend", aliases: ["saturday", "sunday", "days off", "lie-in", "free day"] },
  { id: "ritual", label: "Daily ritual", aliases: ["routine", "habit", "every day", "small ritual"] },
  { id: "chores", label: "Chores", aliases: ["laundry", "dishes", "cleaning", "tidying", "housework"] },
  { id: "furniture", label: "Favourite chair", aliases: ["sofa", "armchair", "seat", "desk chair"] },
  { id: "objects", label: "Something I love", aliases: ["favourite thing", "keepsake", "gift", "shelf", "treasure"] },
  { id: "door", label: "Front door", aliases: ["entrance", "hallway", "keys", "coming home", "leaving home"] },
  { id: "smallthing", label: "A small good thing", aliases: ["tiny joy", "little moment", "made my day", "small win"] },

  { id: "party", label: "Party", aliases: ["house party", "gathering", "do"] },
  { id: "birthday", label: "Birthday", aliases: ["bday", "cake", "candles", "birthday party"] },
  { id: "wedding", label: "Wedding", aliases: ["marriage", "bride", "groom", "ceremony", "reception", "hen do", "stag"] },
  { id: "celebration", label: "Celebration", aliases: ["cheers", "toast", "anniversary", "milestone", "congrats", "festive"] },
  { id: "festival", label: "Festival", aliases: ["fest", "outdoor festival", "music fest", "carnival"] },
  { id: "concert", label: "Concert", aliases: ["gig", "live music", "show", "venue", "band night"] },

  { id: "walk", label: "Walk", aliases: ["stroll", "amble", "evening walk", "footpath"] },
  { id: "run", label: "Run", aliases: ["jog", "jogging", "running", "parkrun", "sprint"] },
  { id: "gym", label: "Gym", aliases: ["workout", "weights", "fitness", "training", "exercise class"] },
  { id: "movement", label: "Sport", aliases: ["sports", "match", "game day", "football", "tennis", "yoga", "swim", "swimming"] },
  { id: "playing", label: "Play", aliases: ["playground", "toys", "fun", "kids play", "park play"] },

  { id: "music", label: "Music", aliases: ["headphones", "vinyl", "playlist", "singing", "song"] },
  { id: "listening", label: "Listening", aliases: ["podcast", "audiobook", "radio"] },
  { id: "reading", label: "Reading", aliases: ["book", "books", "novel", "magazine", "kindle", "page"] },
  { id: "art", label: "Art", aliases: ["gallery", "museum", "drawing", "painting", "sketch", "exhibition"] },
  { id: "made", label: "Something I made", aliases: ["craft", "diy", "project", "handmade", "creative", "built"] },
  { id: "hobbies", label: "Hobby", aliases: ["pastime", "into lately", "side project", "craft night"] },
  { id: "games", label: "Games", aliases: ["board game", "video game", "cards", "console", "puzzle"] },
  { id: "wearing", label: "Outfit", aliases: ["clothes", "fashion", "what I'm wearing", "shoes", "look of the day"] },
  { id: "selfie", label: "Selfie", aliases: ["me today", "mirror selfie", "portrait of me"] },
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
        const a = alias.toLowerCase().trim();
        if (!a) continue;
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
