/**
 * Server mirror of `artifacts/same-same/data/subjectMatch.ts`.
 */

const SUBJECT_STOPWORDS = new Set([
  "scene", "object", "thing", "stuff", "item", "items", "photo", "photograph",
  "picture", "image", "background", "foreground",
]);

const SUBJECT_GROUPS: Record<string, string[]> = {
  vegetable: [
    "vegetable", "vegetables", "veggie", "veggies", "produce", "tomato", "tomatoes",
    "carrot", "carrots", "pepper", "peppers", "onion", "onions", "lettuce",
    "cucumber", "broccoli", "spinach", "cabbage", "potato", "potatoes", "corn",
    "zucchini", "aubergine", "eggplant", "mushroom", "mushrooms", "salad", "greens",
  ],
  fruit: [
    "fruit", "fruits", "apple", "apples", "banana", "bananas", "orange", "oranges",
    "berry", "berries", "strawberry", "grape", "grapes", "melon", "watermelon",
    "peach", "pear", "mango", "lemon", "lime", "avocado",
  ],
  food: [
    "food", "meal", "meals", "dish", "plate", "bowl", "snack", "breakfast", "lunch",
    "dinner", "bread", "pasta", "rice", "soup", "sandwich", "pizza", "burger", "egg",
    "eggs", "cheese", "meat", "fish", "seafood", "dessert", "cake", "pastry",
  ],
  drink: [
    "drink", "drinks", "beverage", "coffee", "tea", "latte", "espresso", "cappuccino",
    "juice", "water", "wine", "beer", "cocktail", "smoothie", "mug", "cup", "glass",
  ],
  pet: [
    "pet", "pets", "dog", "dogs", "puppy", "puppies", "cat", "cats", "kitten",
    "kittens", "hamster", "hamsters", "rabbit", "rabbits", "guinea pig", "parrot",
  ],
  animal: [
    "animal", "animals", "wildlife", "bird", "birds", "squirrel", "deer", "horse",
    "horses", "cow", "sheep", "duck", "goose",
  ],
  plant: [
    "plant", "plants", "houseplant", "succulent", "cactus", "fern", "pothos",
    "monstera", "herb", "herbs", "basil", "mint",
  ],
  flower: [
    "flower", "flowers", "bloom", "blooms", "bouquet", "rose", "roses", "tulip",
    "daisy", "sunflower", "orchid",
  ],
  hand: [
    "hand", "hands", "finger", "fingers", "palm", "fist", "knuckle", "thumb",
    "manicure", "typing",
  ],
  face: [
    "face", "faces", "selfie", "portrait", "smile", "eyes", "person", "people",
  ],
  baby: [
    "baby", "babies", "infant", "newborn", "toddler", "child", "kids",
  ],
  footwear: [
    "shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "sandal", "sandals",
    "slipper", "footwear", "trainer", "trainers",
  ],
  vehicle: [
    "car", "cars", "bike", "bicycle", "scooter", "bus", "train", "plane", "airplane",
    "motorcycle", "truck", "vehicle",
  ],
  book: [
    "book", "books", "novel", "magazine", "newspaper", "journal", "notebook", "reading",
  ],
  instrument: [
    "guitar", "piano", "violin", "drum", "drums", "ukulele", "instrument", "keyboard",
    "saxophone", "trumpet",
  ],
  sky: [
    "sky", "cloud", "clouds", "sunset", "sunrise", "horizon", "moon", "stars",
  ],
  water: [
    "water", "ocean", "sea", "lake", "river", "pool", "rain", "wave", "waves", "beach",
  ],
};

const tokenToGroups = new Map<string, Set<string>>();

function basicNormalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 \-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

for (const [groupId, members] of Object.entries(SUBJECT_GROUPS)) {
  for (const raw of [groupId, ...members]) {
    const t = basicNormalize(raw);
    if (!t || SUBJECT_STOPWORDS.has(t)) continue;
    if (!tokenToGroups.has(t)) tokenToGroups.set(t, new Set());
    tokenToGroups.get(t)!.add(groupId);
  }
}

export function normalizeSubjectToken(raw: string): string {
  const cleaned = basicNormalize(raw);
  if (!cleaned || SUBJECT_STOPWORDS.has(cleaned)) return "";
  if (cleaned.endsWith("ies") && cleaned.length > 4) {
    return cleaned.slice(0, -3) + "y";
  }
  if (cleaned.endsWith("s") && cleaned.length > 3 && !cleaned.endsWith("ss")) {
    const singular = cleaned.slice(0, -1);
    if (tokenToGroups.has(singular)) return singular;
  }
  return cleaned;
}

export function expandSubjectToken(token: string): Set<string> {
  const n = normalizeSubjectToken(token);
  const out = new Set<string>();
  if (!n) return out;
  out.add(n);

  const groups = new Set(tokenToGroups.get(n) ?? []);
  if (SUBJECT_GROUPS[n]) {
    groups.add(n);
    for (const m of SUBJECT_GROUPS[n]) out.add(normalizeSubjectToken(m));
  }

  for (const g of groups) {
    out.add(g);
    for (const m of SUBJECT_GROUPS[g] ?? []) {
      const mn = normalizeSubjectToken(m);
      if (mn) out.add(mn);
    }
  }
  return out;
}

export function expandSubjectsForQuery(subjects: string[], cap = 48): string[] {
  const out = new Set<string>();
  for (const s of subjects) {
    for (const t of expandSubjectToken(s)) out.add(t);
  }
  return [...out].filter(Boolean).slice(0, cap);
}

export function enrichSubjects(subjects: string[]): string[] {
  const out = new Set<string>();
  for (const s of subjects) {
    const n = normalizeSubjectToken(s);
    if (!n) continue;
    out.add(n);
    for (const g of tokenToGroups.get(n) ?? []) out.add(g);
  }
  return [...out].slice(0, 6);
}

export function hasSubjectMatch(mine: string[], theirs: string[]): boolean {
  if (mine.length === 0 || theirs.length === 0) return false;
  for (const m of mine) {
    for (const t of theirs) {
      const a = normalizeSubjectToken(m);
      const b = normalizeSubjectToken(t);
      if (!a || !b) continue;
      if (a === b) return true;
      const ga = tokenToGroups.get(a) ?? new Set<string>();
      const gb = tokenToGroups.get(b) ?? new Set<string>();
      for (const g of ga) {
        if (gb.has(g)) return true;
      }
      if (a.length >= 4 && b.includes(a)) return true;
      if (b.length >= 4 && a.includes(b)) return true;
    }
  }
  return false;
}
