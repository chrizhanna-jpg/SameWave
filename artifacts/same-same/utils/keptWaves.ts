import AsyncStorage from "@react-native-async-storage/async-storage";

const KEPT_KEY = "samewave.kept-waves.v1";
const SOUND_KEY = "samewave.ripple-sound.v1";
const WHISPER_KEY = "samewave.whispers.v1";
const SHARE_KEY = "samewave.wave-share.v1";

export type KeptWave = {
  id: string;
  savedAt: string;
  name: string;
  myPhoto: string;
  theirPhoto: string;
  myCountry: string;
  theirCountry: string;
  myCountryCode: string;
  theirCountryCode: string;
  myFlag: string;
  theirFlag: string;
  distanceLabel: string;
  myVibe: string;
  theirVibe: string;
  myWhisper?: string;
  theirWhisper?: string;
};

export async function loadKeptWaves(): Promise<KeptWave[]> {
  try {
    const raw = await AsyncStorage.getItem(KEPT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KeptWave[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function isWaveKept(id: string): Promise<boolean> {
  const rows = await loadKeptWaves();
  return rows.some((row) => row.id === id);
}

export async function saveKeptWave(wave: KeptWave): Promise<void> {
  const rows = await loadKeptWaves();
  const next = [wave, ...rows.filter((row) => row.id !== wave.id)];
  await AsyncStorage.setItem(KEPT_KEY, JSON.stringify(next));
}

export async function loadRippleSoundEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SOUND_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setRippleSoundEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(SOUND_KEY, on ? "1" : "0");
}

async function readMap(key: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveWhisper(photoKey: string, text: string): Promise<void> {
  const trimmed = text.trim().slice(0, 60);
  if (!photoKey || !trimmed) return;
  const map = await readMap(WHISPER_KEY);
  map[photoKey] = trimmed;
  await AsyncStorage.setItem(WHISPER_KEY, JSON.stringify(map));
}

export async function loadWhisper(photoKey: string): Promise<string | null> {
  if (!photoKey) return null;
  const map = await readMap(WHISPER_KEY);
  const value = map[photoKey];
  return value?.trim() ? value : null;
}

export async function loadShareOptIn(waveId: string): Promise<boolean> {
  const map = await readMap(SHARE_KEY);
  return map[waveId] === "1";
}

export async function setShareOptIn(waveId: string, on: boolean): Promise<void> {
  const map = await readMap(SHARE_KEY);
  map[waveId] = on ? "1" : "0";
  await AsyncStorage.setItem(SHARE_KEY, JSON.stringify(map));
}
