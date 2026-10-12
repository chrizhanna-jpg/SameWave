import React, { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { useApp } from "@/context/AppContext";
import { fetchWaveOfTheDay, fetchWavesMadeToday, type WaveOfTheDay } from "@/utils/api";
import { flagFor, nameFor } from "@/data/countries";
import { serverPhotoImageUrl } from "@/utils/photoDisplayUri";
import { loadKeptWaves, type KeptWave } from "@/utils/keptWaves";
import { applyTabFocusSoundtrack } from "@/utils/tabSoundtrack";
import { scrollPaddingAboveTabBar } from "@/utils/tabBarSafeArea";

const BG = "#0A1F2E";
const CARD = "#0D2B3A";
const TEXT = "#F0F8FF";
const MUTED = "#A8D8EA";

export default function WavesScreen() {
  const insets = useSafeAreaInsets();
  const { pendingEchoes, mutualEchoes } = useApp();
  const [kept, setKept] = useState<KeptWave[]>([]);
  const [today, setToday] = useState<number | null>(null);
  const [featured, setFeatured] = useState<WaveOfTheDay | null>(null);

  const load = useCallback(() => {
    void loadKeptWaves().then(setKept);
    void fetchWaveOfTheDay().then(setFeatured);
    void fetchWavesMadeToday().then((count) => {
      if (count != null) {
        setToday(count);
        return;
      }
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const local = mutualEchoes.filter((echo) => {
        const at = new Date(echo.mutualAt || echo.createdAt).getTime();
        return at >= start.getTime();
      }).length;
      setToday(local);
    });
  }, [mutualEchoes]);

  useFocusEffect(
    useCallback(() => {
      applyTabFocusSoundtrack("waves");
      load();
    }, [load]),
  );

  const countLabel = `${(today ?? 0).toLocaleString("en-US")} Waves made today`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: scrollPaddingAboveTabBar(insets) + 24,
        paddingHorizontal: 16,
      }}
    >
      <Text style={styles.count}>{countLabel}</Text>
      {pendingEchoes.length > 0 ? (
        <Pressable style={styles.waiting} onPress={() => router.push("/echoes")}>
          <Text style={styles.waitingText}>
            {pendingEchoes.length === 1
              ? "1 ripple is waiting — open it to answer"
              : `${pendingEchoes.length} ripples are waiting — open them to answer`}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.heading}>🌊 Wave of the Day</Text>
      {featured ? (
        <View style={styles.card}>
          <View style={styles.photos}>
            <RemotePhotoImage uri={serverPhotoImageUrl(featured.left.photoId)} style={styles.thumb} />
            <RemotePhotoImage uri={serverPhotoImageUrl(featured.right.photoId)} style={styles.thumb} />
          </View>
          <Text style={styles.cardTitle}>{featured.name}</Text>
          <Text style={styles.meta}>
            {flagFor(featured.left.countryCode)} {nameFor(featured.left.countryCode) ?? featured.left.countryCode}
            {" · "}
            {flagFor(featured.right.countryCode)} {nameFor(featured.right.countryCode) ?? featured.right.countryCode}
          </Text>
          <Text style={styles.meta}>
            {featured.left.vibe ? `#${featured.left.vibe.replace(/\s/g, "")}` : ""}
            {featured.left.vibe && featured.right.vibe ? "  " : ""}
            {featured.right.vibe ? `#${featured.right.vibe.replace(/\s/g, "")}` : ""}
          </Text>
        </View>
      ) : (
        <Text style={styles.empty}>
          No Wave of the Day yet — your Wave could be here
        </Text>
      )}

      <Text style={[styles.heading, { marginTop: 28 }]}>Your Wave Archive</Text>
      {kept.length === 0 ? (
        <Text style={styles.empty}>No saved Waves yet — hold to keep your next one</Text>
      ) : (
        kept.map((wave) => (
          <Pressable
            key={wave.id}
            style={styles.card}
            onPress={() =>
              router.push({ pathname: "/wave-moment", params: { matchId: wave.id } })
            }
          >
            <View style={styles.photos}>
              <RemotePhotoImage uri={wave.myPhoto} style={styles.thumb} />
              <RemotePhotoImage uri={wave.theirPhoto} style={styles.thumb} />
            </View>
            <Text style={styles.cardTitle}>{wave.name}</Text>
            <Text style={styles.meta}>
              {wave.myFlag} {wave.myCountry} · {wave.theirFlag} {wave.theirCountry}
            </Text>
            {wave.distanceLabel ? <Text style={styles.meta}>{wave.distanceLabel}</Text> : null}
            <Text style={styles.meta}>
              Saved {new Date(wave.savedAt).toLocaleDateString()}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  count: { color: MUTED, fontSize: 13, marginBottom: 14, fontFamily: "Inter_400Regular" },
  waiting: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  waitingText: { color: TEXT, fontFamily: "Inter_500Medium" },
  heading: { color: TEXT, fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 8 },
  empty: { color: MUTED, fontStyle: "italic", fontFamily: "Inter_400Regular", marginBottom: 8 },
  card: { backgroundColor: CARD, borderRadius: 12, padding: 12, marginTop: 12 },
  photos: { flexDirection: "row", gap: 8 },
  thumb: { flex: 1, aspectRatio: 1, borderRadius: 10 },
  cardTitle: { color: TEXT, marginTop: 10, fontSize: 18, fontFamily: "Inter_600SemiBold" },
  meta: { color: MUTED, marginTop: 4, fontFamily: "Inter_400Regular" },
});
