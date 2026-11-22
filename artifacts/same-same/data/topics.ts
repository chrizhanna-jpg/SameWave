/**
 * Preset Topics for a Ripple — everyday life moments and occasions
 * (not abstract photo categories). Type-ahead uses labels, aliases,
 * and short descriptions. Ids reuse challenge/theme ids the server
 * already scores when a close match exists.
 *
 * Preset-only: typing never saves free text — it only filters this list.
 * Prefer broad everyday Topics so matching stays dense.
 *
 * Approved by Chris — edit this file only when intentionally changing the list.
 */

import { closestPresets } from "./typeahead";

export interface Topic {
  id: string;
  label: string;
  /** One short line shown under the label in type-ahead. */
  description: string;
  /** Extra words that surface this Topic in the type-ahead. */
  aliases: readonly string[];
}

export const SUGGESTION_LIMIT = 6;

/** Shown before the person types — everyday starters, not the full list. */
export const POPULAR_TOPICS: readonly string[] = [
  "family",
  "friends",
  "coffee",
  "home",
  "walk",
  "pets",
];

export const TOPICS: readonly Topic[] = [
  { id: "family", label: "Family", description: "People you share a home or blood with", aliases: ["mum", "mom", "dad", "parents", "kids", "child", "children", "relatives", "siblings", "cousin"] },
  { id: "friends", label: "Friends", description: "Mates, hangouts, the people you choose", aliases: ["friend", "mate", "mates", "buddy", "crew", "gang", "hangout", "hang out"] },
  { id: "date", label: "Date", description: "A romantic outing or evening together", aliases: ["dating", "partner", "boyfriend", "girlfriend", "romantic", "dinner date"] },
  { id: "baby", label: "Baby", description: "Tiny humans and new-parent life", aliases: ["infant", "newborn", "toddler", "buggy", "pram", "nursery"] },
  { id: "pets", label: "Pets", description: "The animals who live with you", aliases: ["dog", "cat", "puppy", "kitten", "pet", "animal", "dog walk", "zoo", "aquarium"] },
  { id: "breakfast", label: "Breakfast", description: "The first meal of the day", aliases: ["morning meal", "toast", "cereal", "eggs"] },
  { id: "brunch", label: "Brunch", description: "Late breakfast that stretches into lunch", aliases: ["late breakfast", "weekend brunch", "avocado"] },
  { id: "lunch", label: "Lunch", description: "The midday meal", aliases: ["midday", "sandwich", "salad", "soup", "noon meal"] },
  { id: "dinner", label: "Dinner", description: "The evening meal at the table", aliases: ["supper", "evening meal", "roast", "takeaway"] },
  { id: "picnic", label: "Picnic", description: "Eating outside on a blanket", aliases: ["outdoor lunch", "blanket meal", "park lunch", "hamper"] },
  { id: "coffee", label: "Coffee & tea", description: "What's in your cup right now", aliases: ["tea", "latte", "espresso", "cappuccino", "cuppa", "drink", "brew", "coffee"] },
  { id: "cafe", label: "Café", description: "The place you go for a drink and a sit", aliases: ["coffee shop", "coffeehouse", "bakery sit-in", "tea room", "patisserie"] },
  { id: "cooking", label: "Cooking", description: "Making food with your own hands", aliases: ["bake", "baking", "kitchen", "recipe", "chopping", "stove", "oven", "meal prep"] },
  { id: "groceries", label: "Groceries", description: "What you bought or brought home", aliases: ["supermarket", "market shop", "food shop", "trolley"] },
  { id: "holiday", label: "Holiday", description: "Time away from the usual routine", aliases: ["vacation", "trip away", "getaway", "abroad", "resort", "break"] },
  { id: "roadtrip", label: "Road trip", description: "Miles of road and the view from the car", aliases: ["roadtrip", "drive", "highway", "car journey", "scenic drive"] },
  { id: "travel", label: "Travel", description: "Getting somewhere — bags, tickets, transit", aliases: ["airport", "flight", "passport", "suitcase", "journey", "station"] },
  { id: "camping", label: "Camping", description: "Sleeping outdoors under canvas", aliases: ["tent", "campsite", "glamping", "campfire", "sleep under stars"] },
  { id: "city", label: "City", description: "Streets, skyline, urban energy", aliases: ["urban", "downtown", "skyline", "street", "town centre"] },
  { id: "commute", label: "Commute", description: "How you get to work or school", aliases: ["bus", "train", "tube", "metro", "subway", "drive to work", "on the way"] },
  { id: "wheels", label: "On wheels", description: "Anything that rolls you along", aliases: ["car", "bike", "bicycle", "scooter", "motorbike", "driving", "cycling"] },
  { id: "work", label: "Work", description: "Your desk, your job, your day of work", aliases: ["office", "job", "desk", "meeting", "colleague", "workplace", "wfh"] },
  { id: "study", label: "Study", description: "Learning, homework, exams", aliases: ["school", "uni", "university", "college", "homework", "revision", "exam"] },
  { id: "shopping", label: "Shopping", description: "Browsing or buying on the high street", aliases: ["shop", "stores", "high street", "mall", "haul", "browsing"] },
  { id: "nightout", label: "Night out", description: "Out after dark with drinks or dancing", aliases: ["going out", "bar", "pub", "club", "drinks", "evening out"] },
  { id: "nature", label: "Nature", description: "Green, wild, or growing things", aliases: ["outdoors", "woods", "forest", "park", "wild"] },
  { id: "beach", label: "Beach", description: "Sand, shore, and salt air", aliases: ["seaside", "sand", "shore", "coast", "ocean", "sea swim"] },
  { id: "mountains", label: "Mountains", description: "Hills, peaks, and trails", aliases: ["hike", "hiking", "hill", "peak", "trail", "alpine", "summit"] },
  { id: "countryside", label: "Countryside", description: "Fields, lanes, and quiet villages", aliases: ["rural", "fields", "farm", "farm visit", "barn", "village", "country lane", "meadow"] },
  { id: "garden", label: "Garden", description: "Your outdoor patch, however small", aliases: ["yard", "backyard", "allotment", "patio", "balcony garden"] },
  { id: "plants", label: "Plants", description: "A plant you noticed up close", aliases: ["houseplant", "flower", "flowers", "pot plant", "greenery"] },
  { id: "water", label: "By the water", description: "Lake, river, canal, or harbour", aliases: ["lake", "river", "canal", "pond", "harbour", "dock", "ferry", "boat", "kayak", "sailing"] },
  { id: "sunset", label: "Sunset", description: "The sky as the day ends", aliases: ["dusk", "golden hour", "evening sky", "sundown"] },
  { id: "sunrise", label: "Sunrise", description: "First light and the morning sky", aliases: ["dawn sky", "first light", "morning sky"] },
  { id: "sky", label: "Sky", description: "Looking up — clouds, blue, horizon", aliases: ["clouds", "blue sky", "horizon", "looking up"] },
  { id: "rain", label: "Rain", description: "Wet weather and puddles", aliases: ["rainy", "umbrella", "drizzle", "wet day", "puddles"] },
  { id: "snow", label: "Snow", description: "White ground and cold air", aliases: ["snowy", "winter day", "frost", "snowfall"] },
  { id: "weather", label: "Weather", description: "Whatever the day is doing outside", aliases: ["storm", "wind", "fog", "mist", "sunny day", "cloudy"] },
  { id: "home", label: "Home", description: "Inside the place you live", aliases: ["house", "flat", "apartment", "living room", "sofa", "couch", "bedroom", "at home", "window", "looking out"] },
  { id: "morning", label: "Morning", description: "The start of your day", aliases: ["dawn", "early", "waking up", "start of day"] },
  { id: "night", label: "Night in", description: "Staying in after dark", aliases: ["evening in", "cosy night", "movie night", "sofa night"] },
  { id: "weekend", label: "Weekend", description: "Days off and slower time", aliases: ["saturday", "sunday", "days off", "lie-in", "free day"] },
  { id: "ritual", label: "Daily ritual", description: "The small thing you do every day", aliases: ["routine", "habit", "every day", "small ritual"] },
  { id: "chores", label: "Chores", description: "The jobs that keep life running", aliases: ["laundry", "dishes", "cleaning", "tidying", "housework"] },
  { id: "furniture", label: "Favourite chair", description: "The seat you always choose", aliases: ["sofa", "armchair", "seat", "desk chair"] },
  { id: "objects", label: "Something I love", description: "An object that means something", aliases: ["favourite thing", "keepsake", "gift", "shelf", "treasure"] },
  { id: "door", label: "Front door", description: "Where you come and go", aliases: ["entrance", "hallway", "keys", "coming home", "leaving home"] },
  { id: "smallthing", label: "A small good thing", description: "Tiny, easy to miss, made the day better", aliases: ["tiny joy", "little moment", "made my day", "small win"] },
  { id: "party", label: "Party", description: "A gathering with noise and people", aliases: ["house party", "gathering", "do"] },
  { id: "birthday", label: "Birthday", description: "Cake, candles, another year", aliases: ["bday", "cake", "candles", "birthday party"] },
  { id: "wedding", label: "Wedding", description: "Ceremony, vows, celebration", aliases: ["marriage", "bride", "groom", "ceremony", "reception", "hen do", "stag"] },
  { id: "celebration", label: "Celebration", description: "A toast, milestone, or festive moment", aliases: ["cheers", "toast", "anniversary", "milestone", "congrats", "festive", "fireworks", "sparklers"] },
  { id: "festival", label: "Festival", description: "Outdoor fest, music, carnival energy", aliases: ["fest", "outdoor festival", "music fest", "carnival"] },
  { id: "concert", label: "Concert", description: "Live music in a venue", aliases: ["gig", "live music", "show", "venue", "band night"] },
  { id: "walk", label: "Walk", description: "On foot with nowhere urgent", aliases: ["stroll", "amble", "evening walk", "footpath"] },
  { id: "run", label: "Run", description: "Jogging, parkrun, a proper run", aliases: ["jog", "jogging", "running", "parkrun", "sprint"] },
  { id: "gym", label: "Gym", description: "Weights, classes, getting stronger", aliases: ["workout", "weights", "fitness", "training", "exercise class"] },
  { id: "movement", label: "Sport", description: "A match, game, or active session", aliases: ["sports", "match", "game day", "football", "tennis", "yoga", "swim", "swimming"] },
  { id: "playing", label: "Play", description: "Playground, toys, unstructured fun", aliases: ["playground", "toys", "fun", "kids play", "park play"] },
  { id: "music", label: "Music", description: "What's playing — any way you hear it", aliases: ["headphones", "vinyl", "playlist", "singing", "song"] },
  { id: "listening", label: "Listening", description: "Podcast, audiobook, or the radio", aliases: ["podcast", "audiobook", "radio"] },
  { id: "reading", label: "Reading", description: "Words on a page or a screen", aliases: ["book", "books", "novel", "magazine", "kindle", "page", "library"] },
  { id: "art", label: "Art", description: "Making or looking at art", aliases: ["gallery", "museum", "drawing", "painting", "sketch", "exhibition"] },
  { id: "made", label: "Something I made", description: "Your hands made this", aliases: ["craft", "diy", "project", "handmade", "creative", "built"] },
  { id: "hobbies", label: "Hobby", description: "What you've been into lately", aliases: ["pastime", "into lately", "side project", "craft night"] },
  { id: "games", label: "Games", description: "Board, cards, console, or puzzle", aliases: ["board game", "video game", "cards", "console", "puzzle"] },
  { id: "wearing", label: "Outfit", description: "What you're wearing today", aliases: ["clothes", "fashion", "what I'm wearing", "shoes", "look of the day"] },
  { id: "selfie", label: "Selfie", description: "Today's you, however you feel", aliases: ["me today", "mirror selfie", "portrait of me"] },
  // Broad everyday additions (kept lean for denser matching — niche moments
  // fold into aliases on neighbouring Topics instead of new rows).
  { id: "bedtime", label: "Bedtime", description: "Settling down for the night", aliases: ["sleep", "bed", "pyjamas", "pajamas", "goodnight", "lights out"] },
  { id: "cinema", label: "Cinema", description: "At the pictures or a film night out", aliases: ["movie", "film", "movies", "theatre screening", "picturehouse"] },
  { id: "treat", label: "Treat", description: "Something sweet you chose for yourself", aliases: ["dessert", "ice cream", "cake slice", "pudding", "sweet", "gelato", "pastry", "croissant", "bakery"] },
  { id: "market", label: "Market", description: "Stalls, produce, market day", aliases: ["farmers market", "stalls", "outdoor market", "food market"] },
  { id: "waiting", label: "Waiting", description: "In a queue, on a platform, killing time", aliases: ["queue", "platform wait", "waiting room", "delayed"] },
  { id: "selfcare", label: "Self-care", description: "Bath, skincare, a moment for yourself", aliases: ["bath", "spa", "skincare", "massage", "pamper", "soak"] },
  { id: "phone", label: "On the phone", description: "A call with someone who matters", aliases: ["call", "facetime", "video call", "catching up by phone"] },
];

export function topicFor(id: string | null | undefined): Topic | null {
  if (!id) return null;
  return TOPICS.find((t) => t.id === id) ?? null;
}

/**
 * Type-ahead for Topics. Empty query → no suggestions (compose shows the
 * input alone). Otherwise match label, id, aliases, and description — then
 * keep the top few. Always presets only; never invents a custom Topic. When
 * nothing scores a direct hit, returns the closest presets.
 */
export function filterTopics(query: string, limit = SUGGESTION_LIMIT): Topic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = TOPICS.map((topic) => {
    const label = topic.label.toLowerCase();
    const id = topic.id.toLowerCase();
    const description = topic.description.toLowerCase();
    let score = 0;
    if (label === q || id === q) score = 100;
    else if (label.startsWith(q) || id.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 50;
    else if (description.includes(q)) score = 35;
    for (const alias of topic.aliases) {
      const a = alias.toLowerCase().trim();
      if (!a) continue;
      if (a === q) { score = Math.max(score, 90); break; }
      if (a.startsWith(q)) score = Math.max(score, 70);
      else if (q.length >= 3 && a.includes(q)) score = Math.max(score, 40);
    }
    return { topic, score };
  }).filter((row) => row.score > 0);
  scored.sort((a, b) => b.score - a.score || a.topic.label.localeCompare(b.topic.label));
  if (scored.length > 0) return scored.slice(0, limit).map((row) => row.topic);
  return closestPresets(
    TOPICS,
    q,
    (topic) => [topic.label, topic.id, topic.description, ...topic.aliases],
    limit,
  );
}

/** Same Topic → 1, otherwise 0 (Topics are presets, not a graded family). */
export function topicAffinity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  return a === b ? 1 : 0;
}

