export interface SamplePhoto {
  id: string;
  uri: string;
  country: string;
  countryCode: string;
  countryFlag: string;
  theme: string;
  minutesAgo: number;
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
  },
  {
    id: "2",
    uri: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400",
    country: "Japan",
    countryCode: "JP",
    countryFlag: "🇯🇵",
    theme: "morning",
    minutesAgo: 127,
  },
  {
    id: "3",
    uri: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    country: "Mexico",
    countryCode: "MX",
    countryFlag: "🇲🇽",
    theme: "food",
    minutesAgo: 210,
  },
  {
    id: "4",
    uri: "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400",
    country: "India",
    countryCode: "IN",
    countryFlag: "🇮🇳",
    theme: "food",
    minutesAgo: 68,
  },
  {
    id: "5",
    uri: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400",
    country: "Peru",
    countryCode: "PE",
    countryFlag: "🇵🇪",
    theme: "work",
    minutesAgo: 361,
  },
  {
    id: "6",
    uri: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400",
    country: "Germany",
    countryCode: "DE",
    countryFlag: "🇩🇪",
    theme: "work",
    minutesAgo: 22,
  },
  {
    id: "7",
    uri: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    country: "Norway",
    countryCode: "NO",
    countryFlag: "🇳🇴",
    theme: "nature",
    minutesAgo: 720,
  },
  {
    id: "8",
    uri: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400",
    country: "Kenya",
    countryCode: "KE",
    countryFlag: "🇰🇪",
    theme: "nature",
    minutesAgo: 244,
  },
  {
    id: "9",
    uri: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=400",
    country: "Brazil",
    countryCode: "BR",
    countryFlag: "🇧🇷",
    theme: "joy",
    minutesAgo: 18,
  },
  {
    id: "10",
    uri: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400",
    country: "South Korea",
    countryCode: "KR",
    countryFlag: "🇰🇷",
    theme: "joy",
    minutesAgo: 480,
  },
  {
    id: "11",
    uri: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400",
    country: "Morocco",
    countryCode: "MA",
    countryFlag: "🇲🇦",
    theme: "hands",
    minutesAgo: 153,
  },
  {
    id: "12",
    uri: "https://images.unsplash.com/photo-1574169208507-84376144848b?w=400",
    country: "Argentina",
    countryCode: "AR",
    countryFlag: "🇦🇷",
    theme: "hands",
    minutesAgo: 1090,
  },
  {
    id: "13",
    uri: "https://images.unsplash.com/photo-1548247416-ec66f4900b2e?w=400",
    country: "Finland",
    countryCode: "FI",
    countryFlag: "🇫🇮",
    theme: "pets",
    minutesAgo: 96,
  },
  {
    id: "14",
    uri: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
    country: "Australia",
    countryCode: "AU",
    countryFlag: "🇦🇺",
    theme: "pets",
    minutesAgo: 1440,
  },
  {
    id: "15",
    uri: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400",
    country: "China",
    countryCode: "CN",
    countryFlag: "🇨🇳",
    theme: "commute",
    minutesAgo: 305,
  },
  {
    id: "16",
    uri: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400",
    country: "United Kingdom",
    countryCode: "GB",
    countryFlag: "🇬🇧",
    theme: "commute",
    minutesAgo: 185,
  },
  {
    id: "17",
    uri: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400",
    country: "Maldives",
    countryCode: "MV",
    countryFlag: "🇲🇻",
    theme: "sky",
    minutesAgo: 2160,
  },
  {
    id: "18",
    uri: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400",
    country: "Mongolia",
    countryCode: "MN",
    countryFlag: "🇲🇳",
    theme: "sky",
    minutesAgo: 425,
  },
];

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
