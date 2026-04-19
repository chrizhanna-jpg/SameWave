import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface MatchedCountry {
  code: string;
  name: string;
  flag: string;
  matchedAt: string;
}

export interface MyPhoto {
  uri: string;
  uploadedAt: string;
  theme: string;
  tags?: string[];
}

export interface Match {
  id: string;
  myPhoto: string;
  myPhotoUploadedAt?: string;
  theirPhoto: string;
  myCountry: string;
  theirCountry: string;
  theirCountryFlag: string;
  theirCountryCode: string;
  similarityScore: number;
  verdict: "same" | "different" | null;
  timestamp: string;
  theme?: string;
  theirPhotoMinutesAgo?: number;
  sharedTags?: string[];
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  earnedAt?: string;
}

interface AppState {
  matchedCountries: MatchedCountry[];
  matches: Match[];
  streakCount: number;
  totalMatches: number;
  badges: Badge[];
  myPhotos: MyPhoto[];
  onboardingComplete: boolean;
  proUnlocked: boolean;
}

interface AppContextValue extends AppState {
  addMatch: (match: Match) => void;
  removeMatch: (id: string) => void;
  addMyPhoto: (uri: string, theme: string, tags?: string[]) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  unlockPro: () => void;
  getWorldMapCoverage: () => number;
}

const defaultBadges: Badge[] = [
  { id: "explorer", name: "Global Explorer", description: "Match with 5 countries", earned: false },
  { id: "connector", name: "World Connector", description: "Match with 10 countries", earned: false },
  { id: "sameday", name: "Same Day", description: "Match with someone within 24 hours", earned: false },
  { id: "streak5", name: "5-Day Streak", description: "Match 5 days in a row", earned: false },
  { id: "asia", name: "Asia Bound", description: "Match with an Asian country", earned: false },
  { id: "africa", name: "Africa Bound", description: "Match with an African country", earned: false },
  { id: "americas", name: "Americas Connected", description: "Match with North or South America", earned: false },
];

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    matchedCountries: [],
    matches: [],
    streakCount: 0,
    totalMatches: 0,
    badges: defaultBadges,
    myPhotos: [],
    onboardingComplete: false,
    proUnlocked: false,
  });

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const stored = await AsyncStorage.getItem("samesame_state");
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate old myPhotos formats to current MyPhoto[]
        const migratedPhotos: MyPhoto[] = (parsed.myPhotos || []).map(
          (p: string | Partial<MyPhoto>) => {
            if (typeof p === "string") {
              return {
                uri: p,
                uploadedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                theme: "joy",
              };
            }
            return {
              uri: p.uri ?? "",
              uploadedAt: p.uploadedAt ?? new Date().toISOString(),
              theme: p.theme ?? "joy",
              tags: p.tags ?? [],
            };
          }
        );
        setState((prev) => ({
          ...prev,
          ...parsed,
          myPhotos: migratedPhotos,
          badges: defaultBadges.map((b) => {
            const stored = parsed.badges?.find((sb: Badge) => sb.id === b.id);
            return stored ? { ...b, ...stored } : b;
          }),
        }));
      }
    } catch {}
  };

  const saveState = async (newState: AppState) => {
    try {
      await AsyncStorage.setItem("samesame_state", JSON.stringify(newState));
    } catch {}
  };

  const addMatch = useCallback((match: Match) => {
    setState((prev) => {
      const alreadyHasCountry = prev.matchedCountries.some(
        (c) => c.code === match.theirCountryCode
      );

      const newCountries = alreadyHasCountry
        ? prev.matchedCountries
        : [
            ...prev.matchedCountries,
            {
              code: match.theirCountryCode,
              name: match.theirCountry,
              flag: match.theirCountryFlag,
              matchedAt: match.timestamp,
            },
          ];

      const updatedBadges = prev.badges.map((b) => {
        if (b.earned) return b;
        if (b.id === "explorer" && newCountries.length >= 5)
          return { ...b, earned: true, earnedAt: new Date().toISOString() };
        if (b.id === "connector" && newCountries.length >= 10)
          return { ...b, earned: true, earnedAt: new Date().toISOString() };
        if (b.id === "sameday") {
          const myAgeMin = match.myPhotoUploadedAt
            ? (Date.now() - new Date(match.myPhotoUploadedAt).getTime()) / 60000
            : 9999;
          const theirAgeMin = match.theirPhotoMinutesAgo ?? 9999;
          if (myAgeMin < 1440 && theirAgeMin < 1440)
            return { ...b, earned: true, earnedAt: new Date().toISOString() };
        }
        if (b.id === "asia" && isAsian(match.theirCountryCode))
          return { ...b, earned: true, earnedAt: new Date().toISOString() };
        if (b.id === "africa" && isAfrican(match.theirCountryCode))
          return { ...b, earned: true, earnedAt: new Date().toISOString() };
        if (b.id === "americas" && isAmericas(match.theirCountryCode))
          return { ...b, earned: true, earnedAt: new Date().toISOString() };
        return b;
      });

      const newState: AppState = {
        ...prev,
        matchedCountries: newCountries,
        matches: [match, ...prev.matches],
        totalMatches: prev.totalMatches + 1,
        streakCount: prev.streakCount + 1,
        badges: updatedBadges,
      };
      saveState(newState);
      return newState;
    });
  }, []);

  const removeMatch = useCallback((id: string) => {
    setState((prev) => {
      const target = prev.matches.find((m) => m.id === id);
      if (!target) return prev;

      const remainingMatches = prev.matches.filter((m) => m.id !== id);

      // If no other match still references the same country, drop it from
      // matchedCountries so the world map stays accurate.
      const stillHasCountry = remainingMatches.some(
        (m) => m.theirCountryCode === target.theirCountryCode,
      );
      const matchedCountries = stillHasCountry
        ? prev.matchedCountries
        : prev.matchedCountries.filter(
            (c) => c.code !== target.theirCountryCode,
          );

      // Note: we intentionally keep earned badges. Undoing a single match
      // shouldn't take an achievement away — and re-earning is trivial.
      const newState: AppState = {
        ...prev,
        matches: remainingMatches,
        matchedCountries,
        totalMatches: Math.max(0, prev.totalMatches - 1),
        streakCount: Math.max(0, prev.streakCount - 1),
      };
      saveState(newState);
      return newState;
    });
  }, []);

  const addMyPhoto = useCallback((uri: string, theme: string, tags?: string[]) => {
    setState((prev) => {
      const photo: MyPhoto = {
        uri,
        uploadedAt: new Date().toISOString(),
        theme,
        tags: tags ?? [],
      };
      const newState = { ...prev, myPhotos: [photo, ...prev.myPhotos] };
      saveState(newState);
      return newState;
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((prev) => {
      const newState = { ...prev, onboardingComplete: true };
      saveState(newState);
      return newState;
    });
  }, []);

  const resetOnboarding = useCallback(() => {
    setState((prev) => {
      const newState = { ...prev, onboardingComplete: false };
      saveState(newState);
      return newState;
    });
  }, []);

  const unlockPro = useCallback(() => {
    setState((prev) => {
      const newState = { ...prev, proUnlocked: true };
      saveState(newState);
      return newState;
    });
  }, []);

  const getWorldMapCoverage = useCallback(() => {
    return Math.min(
      100,
      Math.round((state.matchedCountries.length / 195) * 100)
    );
  }, [state.matchedCountries.length]);

  return (
    <AppContext.Provider
      value={{ ...state, addMatch, removeMatch, addMyPhoto, completeOnboarding, resetOnboarding, unlockPro, getWorldMapCoverage }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

function isAsian(code: string) {
  const asian = ["CN","JP","KR","IN","TH","VN","ID","PH","MY","SG","BD","PK","NP","LK","MM","KH","LA","MN","TW","HK","BT","MV","TL","BN","AF","IR","IQ","SY","SA","AE","QA","KW","BH","OM","YE","JO","LB","IL","PS","TR","AZ","GE","AM","KZ","UZ","TM","TJ","KG"];
  return asian.includes(code);
}

function isAfrican(code: string) {
  const african = ["NG","ZA","KE","ET","GH","TZ","UG","DZ","SD","EG","MA","TN","LY","CM","CI","SN","ML","BF","NE","MW","ZM","ZW","MZ","AO","RW","SO","MG","CD","CG","GA","GN","SL","LR","GW","GM","CV","ST","EH","MR","TG","BJ","GQ","CF","TD","SS","BI","DJ","KM","ER","SC","MU","RE","YT","NA","BW","LS","SZ"];
  return african.includes(code);
}

function isAmericas(code: string) {
  const americas = ["US","CA","MX","BR","AR","CL","CO","PE","VE","EC","BO","PY","UY","GY","SR","PA","CR","NI","HN","GT","SV","BZ","CU","DO","HT","JM","TT","BB","LC","VC","GD","AG","DM","KN","BS","TC","VG","VI","PR","GP","MQ","GF","AW","CW","BQ","AI","MS","KY","BM","FK","GS"];
  return americas.includes(code);
}
