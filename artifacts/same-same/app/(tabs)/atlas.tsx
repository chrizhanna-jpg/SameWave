import React, { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WorldWaveMap, type LiveDot } from "@/components/WorldWaveMap";
import { useApp } from "@/context/AppContext";
import { fetchLiveWaveCountries, fetchWorldYearCounts } from "@/utils/api";
import { isInUtcYear, yearCountLabels } from "@/utils/waveCopy";
import { applyTabFocusSoundtrack } from "@/utils/tabSoundtrack";

/** Live Wave map. Country centroids only — no GPS, no names, no photos. */
export default function WorldScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { mutualEchoes, matches } = useApp();
  const [dots, setDots] = useState<LiveDot[]>([]);
  const [counts, setCounts] = useState({ ripples: 0, waves: 0 });
  const [focused, setFocused] = useState(false);

  const refresh = useCallback(async () => {
    const live = await fetchLiveWaveCountries();
    const year = await fetchWorldYearCounts();
    if (year) {
      setCounts(year);
    } else {
      setCounts({
        ripples: matches.filter(
          (m) => m.verdict !== "different" && isInUtcYear(m.timestamp),
        ).length,
        waves: mutualEchoes.filter((echo) =>
          isInUtcYear(echo.mutualAt || echo.createdAt),
        ).length,
      });
    }
    if (live && live.length > 0) {
      setDots(
        live.map((row) => ({
          countryCode: row.countryCode.toUpperCase(),
          bornAt: new Date(row.at).getTime(),
        })),
      );
      return;
    }
    const cutoff = Date.now() - 60 * 60 * 1000;
    const local: LiveDot[] = [];
    for (const echo of mutualEchoes) {
      const at = new Date(echo.mutualAt || echo.createdAt).getTime();
      if (at < cutoff) continue;
      for (const code of [echo.mine.countryCode, echo.theirs.countryCode]) {
        if (code) local.push({ countryCode: code.toUpperCase(), bornAt: at });
      }
    }
    setDots(local);
  }, [matches, mutualEchoes]);

  useFocusEffect(
    useCallback(() => {
      applyTabFocusSoundtrack("home");
      setFocused(true);
      void refresh();
      return () => setFocused(false);
    }, [refresh]),
  );

  useEffect(() => {
    if (!focused) return;
    const ms = AppState.currentState === "active" ? 30_000 : 5 * 60_000;
    const t = setInterval(() => {
      void refresh();
    }, ms);
    return () => clearInterval(t);
  }, [focused, refresh]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <WorldWaveMap
        width={width}
        height={height - insets.top}
        dots={dots}
        countLabels={yearCountLabels(counts.ripples, counts.waves)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A1F2E" },
});
