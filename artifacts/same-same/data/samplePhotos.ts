export interface SamplePhoto {
  id: string;
  uri: string;
  country: string;
  countryCode: string;
  countryFlag: string;
  theme: string;
  minutesAgo: number;
  tags: string[];
}

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "1",
    uri: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400",
    country: "Ethiopia",
    countryCode: "ET",
    countryFlag: "🇪🇹",
    theme: "morning",
    minutesAgo: 45,
    tags: ["coffee","drink","people","art","warm"],
  },
  {
    id: "2",
    uri: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400",
    country: "Japan",
    countryCode: "JP",
    countryFlag: "🇯🇵",
    theme: "morning",
    minutesAgo: 127,
    tags: ["coffee","drink","people","art","warm"],
  },
  {
    id: "3",
    uri: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    country: "Mexico",
    countryCode: "MX",
    countryFlag: "🇲🇽",
    theme: "food",
    minutesAgo: 210,
    tags: ["meal"],
  },
  {
    id: "4",
    uri: "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400",
    country: "India",
    countryCode: "IN",
    countryFlag: "🇮🇳",
    theme: "food",
    minutesAgo: 68,
    tags: ["meal","bread","drink","warm"],
  },
  {
    id: "5",
    uri: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400",
    country: "Peru",
    countryCode: "PE",
    countryFlag: "🇵🇪",
    theme: "work",
    minutesAgo: 361,
    tags: ["people","coffee","laptop","desk"],
  },
  {
    id: "6",
    uri: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400",
    country: "Germany",
    countryCode: "DE",
    countryFlag: "🇩🇪",
    theme: "work",
    minutesAgo: 22,
    tags: ["people","desk","laptop"],
  },
  {
    id: "7",
    uri: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    country: "Norway",
    countryCode: "NO",
    countryFlag: "🇳🇴",
    theme: "nature",
    minutesAgo: 720,
    tags: ["mountains","clouds","sunset","outdoors"],
  },
  {
    id: "8",
    uri: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400",
    country: "Kenya",
    countryCode: "KE",
    countryFlag: "🇰🇪",
    theme: "nature",
    minutesAgo: 244,
    tags: ["sunset","water","outdoors","clouds","trees","warm"],
  },
  {
    id: "9",
    uri: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=400",
    country: "Brazil",
    countryCode: "BR",
    countryFlag: "🇧🇷",
    theme: "joy",
    minutesAgo: 18,
    tags: ["people"],
  },
  {
    id: "10",
    uri: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400",
    country: "South Korea",
    countryCode: "KR",
    countryFlag: "🇰🇷",
    theme: "joy",
    minutesAgo: 480,
    tags: ["water","art"],
  },
  {
    id: "11",
    uri: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400",
    country: "Morocco",
    countryCode: "MA",
    countryFlag: "🇲🇦",
    theme: "hands",
    minutesAgo: 153,
    tags: ["warm"],
  },
  {
    id: "12",
    uri: "https://images.unsplash.com/photo-1574169208507-84376144848b?w=400",
    country: "Argentina",
    countryCode: "AR",
    countryFlag: "🇦🇷",
    theme: "hands",
    minutesAgo: 1090,
    tags: ["art","clouds","water","night","stars","sunset"],
  },
  {
    id: "13",
    uri: "https://images.unsplash.com/photo-1548247416-ec66f4900b2e?w=400",
    country: "Finland",
    countryCode: "FI",
    countryFlag: "🇫🇮",
    theme: "pets",
    minutesAgo: 96,
    tags: ["cat","animal","wildlife"],
  },
  {
    id: "14",
    uri: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
    country: "Australia",
    countryCode: "AU",
    countryFlag: "🇦🇺",
    theme: "pets",
    minutesAgo: 1440,
    tags: ["dog","animal","smile","outdoors","water"],
  },
  {
    id: "15",
    uri: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400",
    country: "China",
    countryCode: "CN",
    countryFlag: "🇨🇳",
    theme: "commute",
    minutesAgo: 305,
    tags: ["transit","mountains","night","outdoors"],
  },
  {
    id: "16",
    uri: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400",
    country: "United Kingdom",
    countryCode: "GB",
    countryFlag: "🇬🇧",
    theme: "commute",
    minutesAgo: 185,
    tags: ["city","water","outdoors","sunset","clouds"],
  },
  {
    id: "17",
    uri: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400",
    country: "Maldives",
    countryCode: "MV",
    countryFlag: "🇲🇻",
    theme: "sky",
    minutesAgo: 2160,
    tags: ["water","clouds","sunset","outdoors"],
  },
  {
    id: "18",
    uri: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400",
    country: "Mongolia",
    countryCode: "MN",
    countryFlag: "🇲🇳",
    theme: "sky",
    minutesAgo: 425,
    tags: ["stars","night","mountains","outdoors"],
  },
  {
    id: "19",
    uri: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400",
    country: "Canada",
    countryCode: "CA",
    countryFlag: "🇨🇦",
    theme: "nature",
    minutesAgo: 95,
    tags: ["sunset","clouds","mountains","outdoors"],
  },
  {
    id: "20",
    uri: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400",
    country: "South Africa",
    countryCode: "ZA",
    countryFlag: "🇿🇦",
    theme: "sky",
    minutesAgo: 38,
    tags: ["sunset","outdoors","trees","warm"],
  },
  {
    id: "21",
    uri: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400",
    country: "New Zealand",
    countryCode: "NZ",
    countryFlag: "🇳🇿",
    theme: "nature",
    minutesAgo: 510,
    tags: ["trees","outdoors","clouds","warm","sunset"],
  },
];

// Tag library — what users can pick to describe their photo. Grouped so the
// camera screen can suggest the most relevant chips per theme.
export const TAG_LIBRARY: { id: string; emoji: string; label: string }[] = [
  { id: "coffee", emoji: "☕", label: "Coffee" },
  { id: "drink", emoji: "🥤", label: "Drink" },
  { id: "meal", emoji: "🍽️", label: "Meal" },
  { id: "bread", emoji: "🥖", label: "Bread" },
  { id: "warm", emoji: "🔥", label: "Warm" },
  { id: "trees", emoji: "🌳", label: "Trees" },
  { id: "sunset", emoji: "🌅", label: "Sunset" },
  { id: "clouds", emoji: "☁️", label: "Clouds" },
  { id: "stars", emoji: "✨", label: "Stars" },
  { id: "night", emoji: "🌙", label: "Night" },
  { id: "mountains", emoji: "🏔️", label: "Mountains" },
  { id: "outdoors", emoji: "🌲", label: "Outdoors" },
  { id: "water", emoji: "🌊", label: "Water" },
  { id: "wildlife", emoji: "🦌", label: "Wildlife" },
  { id: "dog", emoji: "🐕", label: "Dog" },
  { id: "cat", emoji: "🐈", label: "Cat" },
  { id: "animal", emoji: "🐾", label: "Animal" },
  { id: "people", emoji: "👤", label: "People" },
  { id: "smile", emoji: "😊", label: "Smile" },
  { id: "celebration", emoji: "🎉", label: "Celebration" },
  { id: "art", emoji: "🎨", label: "Art" },
  { id: "desk", emoji: "🖥️", label: "Desk" },
  { id: "laptop", emoji: "💻", label: "Laptop" },
  { id: "transit", emoji: "🚇", label: "Transit" },
  { id: "city", emoji: "🏙️", label: "City" },
];

// Suggested tag IDs surfaced first per theme on the camera screen.
export const SUGGESTED_TAGS_BY_THEME: Record<string, string[]> = {
  morning: ["coffee", "drink", "sunset", "warm"],
  food: ["meal", "bread", "drink", "coffee"],
  hands: ["art", "people"],
  sky: ["sunset", "clouds", "stars", "night", "trees"],
  commute: ["transit", "city"],
  work: ["laptop", "desk", "coffee"],
  joy: ["smile", "celebration", "people"],
  nature: ["trees", "mountains", "outdoors", "water", "sunset", "wildlife"],
  pets: ["dog", "cat", "animal"],
};

export const DAILY_CHALLENGES = [
  { id: "morning", title: "Your morning", description: "What does your morning look like?", emoji: "☀️" },
  { id: "food", title: "What you ate", description: "Share your meal", emoji: "🍽️" },
  { id: "hands", title: "Your hands", description: "Show us your hands right now", emoji: "👐" },
  { id: "sky", title: "Your sky", description: "Look up. What do you see?", emoji: "🌤️" },
  { id: "commute", title: "Your commute", description: "How do you get around?", emoji: "🚌" },
  { id: "work", title: "Where you work", description: "Show your workspace", emoji: "💼" },
  { id: "joy", title: "Something joyful", description: "What made you smile today?", emoji: "😊" },
  { id: "nature", title: "Nature near you", description: "Any plant, tree or sky", emoji: "🌿" },
  { id: "pets", title: "An animal", description: "Pet, wild, or neighbor's", emoji: "🐾" },
];

// Themes that "feel" related — used as fallback when the active theme
// pool is exhausted so the user can still find a match nearby.
export const THEME_ADJACENCY: Record<string, string[]> = {
  morning: ["food", "commute", "sky"],
  food: ["morning", "hands", "joy"],
  hands: ["food", "work", "joy"],
  sky: ["nature", "morning"],
  commute: ["morning", "work", "sky"],
  work: ["commute", "hands"],
  joy: ["pets", "food", "hands"],
  nature: ["sky", "pets"],
  pets: ["nature", "joy"],
};

export function getThemeChain(theme: string): string[] {
  const adj = THEME_ADJACENCY[theme] ?? [];
  return [theme, ...adj];
}

export function getTodaysChallenge(): typeof DAILY_CHALLENGES[0] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_CHALLENGES[dayOfYear % DAILY_CHALLENGES.length];
}

export function getRandomPair(exclude?: string[]): [SamplePhoto, SamplePhoto] {
  const pool = exclude
    ? SAMPLE_PHOTOS.filter((p) => !exclude.includes(p.id))
    : SAMPLE_PHOTOS;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}
