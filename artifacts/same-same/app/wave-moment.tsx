import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HoldToKeepButton } from "@/components/HoldToKeepButton";
import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { useReduceMotion } from "@/components/RippleTravellingMap";
import { flagFor, nameFor } from "@/data/countries";
import { useApp } from "@/context/AppContext";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import {
  isWaveKept,
  loadShareOptIn,
  loadWhisper,
  saveKeptWave,
  setShareOptIn,
} from "@/utils/keptWaves";
import { postWaveKeep, postWaveShare } from "@/utils/api";
import {
  formatSeparation,
  formatTakenAt,
  haversineMiles,
  ordinal,
  prefersMiles,
  readableVibe,
  waveNameFromVibes,
} from "@/utils/waveCopy";
import { weatherAtCountry } from "@/utils/waveWeather";

const BG = "#0A1F2E";
const CARD = "#0D2B3A";
const TEXT = "#F0F8FF";
const MUTED = "#A8D8EA";
const TEAL = "#00C9B1";

export default function WaveMomentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ matchId?: string; echoId?: string }>();
  const matchId = typeof params.matchId === "string" ? params.matchId : "";
  const echoId = typeof params.echoId === "string" ? params.echoId : "";
  const { matches, mutualEchoes } = useApp();
  const reduce = useReduceMotion();
  const match = matches.find((row) => row.id === matchId) ?? null;
  const echo = mutualEchoes.find((row) => row.id === echoId) ?? null;
  const [kept, setKept] = useState(false);
  const [share, setShare] = useState(false);
  const [myWhisper, setMyWhisper] = useState<string | null>(null);
  const [weatherLine, setWeatherLine] = useState<string | null>(null);
  const [dissolved, setDissolved] = useState(false);
  const [opacity, setOpacity] = useState(1);

  const myCode = echo?.mine.captureCountryCode || echo?.mine.countryCode || match?.myCaptureCountryCode || match?.myCountryCode || "";
  const theirCode = echo?.theirs.captureCountryCode || echo?.theirs.countryCode || match?.theirCaptureCountryCode || match?.theirCountryCode || "";
  const myVibe = readableVibe(echo?.mine.theme || match?.theme || match?.sharedTags?.[0] || "");
  const theirVibe = readableVibe(echo?.theirs.theme || match?.theirActualTheme || match?.theirTags?.[0] || "");
  const name = echo?.waveName || waveNameFromVibes(myVibe, theirVibe);
  const mineCount = echo?.mineWaveCount ?? Math.max(1, mutualEchoes.length);
  const theirCount = echo?.theirsWaveCount;
  const recordId = echo?.id || match?.id || "";
  const myPhoto = echo?.mine.uri || match?.myPhoto || "";
  const theirPhoto = echo?.theirs.uri || match?.theirPhoto || "";
  const theirWhisper = echo?.theirs.whisper ?? null;
  const createdAt = echo?.mutualAt || echo?.createdAt || match?.timestamp || "";

  const distanceLabel = useMemo(() => {
    const a = myCode ? centroidLonLatForAtlas(myCode) : null;
    const b = theirCode ? centroidLonLatForAtlas(theirCode) : null;
    if (!a || !b) return null;
    const miles = haversineMiles(a, b);
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return formatSeparation(miles, prefersMiles(locale));
  }, [myCode, theirCode]);

  useEffect(() => {
    if (!recordId) return;
    void isWaveKept(recordId).then((already) => {
      const serverKept = echo?.keptForMe === true;
      setKept(already || serverKept);
      if (serverKept && !already && myPhoto && theirPhoto) {
        void saveKeptWave({
          id: recordId,
          savedAt: new Date().toISOString(),
          name,
          myPhoto,
          theirPhoto,
          myCountry: nameFor(myCode) ?? echo?.mine.country ?? match?.myCountry ?? "",
          theirCountry: nameFor(theirCode) ?? echo?.theirs.country ?? match?.theirCountry ?? "",
          myCountryCode: myCode,
          theirCountryCode: theirCode,
          myFlag: echo?.mine.countryFlag || match?.myCountryFlag || flagFor(myCode),
          theirFlag: echo?.theirs.countryFlag || match?.theirCountryFlag || flagFor(theirCode),
          distanceLabel: "",
          myVibe,
          theirVibe,
        });
      }
    });
    void loadShareOptIn(recordId).then((local) => setShare(local || echo?.shareForMe === true));
    const key = match?.myPhotoId || echo?.mine.id || myPhoto;
    void loadWhisper(key).then((stored) => setMyWhisper(stored || echo?.mine.whisper || null));
    const created = new Date(createdAt).getTime();
    if (Number.isFinite(created) && Date.now() - created > 24 * 60 * 60 * 1000) {
      void isWaveKept(recordId).then((already) => {
        if (!already && echo?.keptForMe !== true) setDissolved(true);
      });
    }
  }, [createdAt, echo, match, myCode, myPhoto, myVibe, name, recordId, theirCode, theirPhoto, theirVibe]);

  useEffect(() => {
    if (!recordId) return;
    let alive = true;
    const mineAt = echo?.mine.capturedAt || echo?.mine.createdAt || match?.myPhotoCapturedAt || match?.myPhotoUploadedAt;
    const theirAt = echo?.theirs.capturedAt || echo?.theirs.createdAt || match?.theirPhotoCapturedAt || match?.theirPhotoSharedAt;
    void (async () => {
      const mine = await weatherAtCountry(myCode, mineAt);
      const theirs = await weatherAtCountry(theirCode, theirAt);
      if (!alive || (!mine && !theirs)) return;
      const myName = nameFor(myCode) ?? echo?.mine.country ?? match?.myCountry ?? "";
      const theirName = nameFor(theirCode) ?? echo?.theirs.country ?? match?.theirCountry ?? "";
      const parts = [
        mine ? `${mine} in ${myName}` : null,
        theirs ? `${theirs} in ${theirName}` : null,
      ].filter(Boolean);
      setWeatherLine(parts.join(" / "));
    })();
    return () => {
      alive = false;
    };
  }, [echo, match, myCode, recordId, theirCode]);

  useEffect(() => {
    if (!dissolved || reduce) return;
    const t = setTimeout(() => setOpacity(0.15), 1600);
    return () => clearTimeout(t);
  }, [dissolved, reduce]);

  if (!recordId || !myPhoto || !theirPhoto) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.muted}>This Wave has passed</Text>
      </View>
    );
  }

  const theirCountry = nameFor(theirCode) ?? echo?.theirs.country ?? match?.theirCountry ?? "";
  const sentence = distanceLabel
    ? `You and someone ${distanceLabel} away in ${theirCountry} were on the same wavelength`
    : `You and someone in ${theirCountry} were on the same wavelength`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 32, paddingHorizontal: 18 }}
    >
      <Text style={styles.name}>{name}</Text>
      <View style={{ opacity: dissolved && !reduce ? opacity : dissolved ? 0.2 : 1 }}>
        <View style={styles.row}>
          <PhotoColumn
            uri={myPhoto}
            flag={echo?.mine.countryFlag || match?.myCountryFlag || flagFor(myCode)}
            country={nameFor(myCode) ?? echo?.mine.country ?? match?.myCountry ?? ""}
            vibe={myVibe}
            taken={formatTakenAt(echo?.mine.capturedAt || echo?.mine.createdAt || match?.myPhotoCapturedAt || match?.myPhotoUploadedAt, myCode)}
            whisper={myWhisper}
            ordinalLabel={`Your ${ordinal(Math.max(1, mineCount))} Wave`}
          />
          <PhotoColumn
            uri={theirPhoto}
            flag={echo?.theirs.countryFlag || match?.theirCountryFlag || flagFor(theirCode)}
            country={theirCountry}
            vibe={theirVibe}
            taken={formatTakenAt(echo?.theirs.capturedAt || echo?.theirs.createdAt || match?.theirPhotoCapturedAt || match?.theirPhotoSharedAt, theirCode)}
            whisper={theirWhisper}
            ordinalLabel={theirCount ? `Their ${ordinal(theirCount)} Wave` : ""}
          />
        </View>
        <Text style={styles.sentence}>{sentence}</Text>
        {weatherLine ? <Text style={styles.weather}>{weatherLine}</Text> : null}
      </View>
      {dissolved ? (
        <Text style={styles.passed}>This Wave has passed</Text>
      ) : kept ? (
        <Text style={styles.kept}>Kept in your archive</Text>
      ) : (
        <View style={styles.hold}>
          <HoldToKeepButton
            onKept={() => {
              setKept(true);
              void saveKeptWave({
                id: recordId,
                savedAt: new Date().toISOString(),
                name,
                myPhoto,
                theirPhoto,
                myCountry: nameFor(myCode) ?? echo?.mine.country ?? match?.myCountry ?? "",
                theirCountry,
                myCountryCode: myCode,
                theirCountryCode: theirCode,
                myFlag: echo?.mine.countryFlag || match?.myCountryFlag || flagFor(myCode),
                theirFlag: echo?.theirs.countryFlag || match?.theirCountryFlag || flagFor(theirCode),
                distanceLabel: distanceLabel ?? "",
                myVibe,
                theirVibe,
                myWhisper: myWhisper ?? undefined,
                theirWhisper: theirWhisper ?? undefined,
              });
              void postWaveKeep(recordId);
            }}
          />
        </View>
      )}
      <View style={styles.shareRow}>
        <Text style={styles.shareLabel}>Share this Wave publicly</Text>
        <Switch
          value={share}
          onValueChange={(on) => {
            setShare(on);
            void setShareOptIn(recordId, on);
            void postWaveShare(recordId, on);
          }}
          trackColor={{ true: TEAL, false: "#1E4D5C" }}
        />
      </View>
      <Text style={styles.back} onPress={() => router.back()}>
        Close
      </Text>
    </ScrollView>
  );
}

function PhotoColumn({
  uri,
  flag,
  country,
  vibe,
  taken,
  whisper,
  ordinalLabel,
}: {
  uri: string;
  flag: string;
  country: string;
  vibe: string;
  taken: string | null;
  whisper?: string | null;
  ordinalLabel: string;
}) {
  return (
    <View style={styles.col}>
      <RemotePhotoImage uri={uri} style={styles.photo} />
      {vibe ? <Text style={styles.vibe}>#{vibe.replace(/\s/g, "")}</Text> : null}
      <Text style={styles.country}>
        {flag} {country}
      </Text>
      {taken ? <Text style={styles.meta}>{taken}</Text> : null}
      {whisper ? <Text style={styles.whisper}>{whisper}</Text> : null}
      {ordinalLabel ? <Text style={styles.meta}>{ordinalLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  name: {
    color: TEXT,
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
  },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 8 },
  photo: { width: "100%", aspectRatio: 0.8, borderRadius: 10 },
  vibe: { color: TEAL, marginTop: 8, fontFamily: "Inter_600SemiBold" },
  country: { color: TEXT, marginTop: 4, fontFamily: "Inter_500Medium" },
  meta: { color: MUTED, marginTop: 4, fontSize: 12, fontFamily: "Inter_400Regular" },
  whisper: {
    color: MUTED,
    marginTop: 6,
    fontSize: 13,
    fontStyle: "italic",
    fontFamily: "Inter_400Regular",
  },
  sentence: { color: TEXT, marginTop: 18, fontSize: 16, lineHeight: 22, fontFamily: "Inter_400Regular" },
  weather: { color: MUTED, marginTop: 8, fontFamily: "Inter_400Regular" },
  hold: { alignItems: "center", marginTop: 28 },
  kept: { color: TEAL, textAlign: "center", marginTop: 28, fontFamily: "Inter_600SemiBold" },
  passed: {
    color: MUTED,
    textAlign: "center",
    marginTop: 28,
    fontStyle: "italic",
    fontSize: 18,
    fontFamily: "Inter_400Regular",
  },
  shareRow: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
  },
  shareLabel: { color: TEXT, flex: 1, marginRight: 12, fontFamily: "Inter_500Medium" },
  back: { color: MUTED, textAlign: "center", marginTop: 22, fontFamily: "Inter_500Medium" },
  muted: { color: MUTED, fontStyle: "italic", textAlign: "center", fontFamily: "Inter_400Regular" },
});
