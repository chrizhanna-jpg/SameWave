import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@clerk/expo";

import { AtlasGlobeExperience } from "@/components/AtlasGlobeExperience";
import { Icon } from "@/components/Icon";
import { SyncRefreshButton } from "@/components/SyncRefreshButton";
import { OceanShimmer } from "@/components/OceanShimmer";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  fetchAtlasSummary,
  fetchAtlasTabDiagnostics,
  invalidateAtlasSummaryCache,
  type AtlasConnection,
  type AtlasCountry,
  type AtlasFireExploreOptions,
  type AtlasSummaryLoadError,
  type AtlasSummaryLoadFailure,
  type LocalRippleExploreMatch,
  type LocalWaveExploreEcho,
} from "@/utils/api";
import { registerAtlasRefreshListener } from "@/utils/atlasHub";
import {
  buildLocalRippleConnections,
  mergeAtlasConnectionsById,
} from "@/utils/atlasLocalRipples";
import {
  loadAtlasCache,
  loadRipplefireLocalCache,
  saveAtlasCache,
  saveRipplefireLocalCache,
} from "@/utils/syncCache";
import { markTabVisited } from "@/utils/tabVisits";
import { stopWavefireAmbience } from "@/utils/wavefireAmbience";
import type { MyPhoto } from "@/context/AppContext";

/** Never replace a non-empty map with an empty/partial API payload (degraded refresh, races). */
function mergeAtlasPayload(
  prev: { countries: AtlasCountry[]; connections: AtlasConnection[] },
  incoming: { countries: AtlasCountry[]; connections: AtlasConnection[] },
): { countries: AtlasCountry[]; connections: AtlasConnection[] } {
  const keepCountries =
    incoming.countries.length === 0 && prev.countries.length > 0;
  const keepConnections =
    incoming.connections.length === 0 && prev.connections.length > 0;
  if (!keepCountries && !keepConnections) {
    return incoming;
  }
  return {
    countries: keepCountries ? prev.countries : incoming.countries,
    connections: keepConnections ? prev.connections : incoming.connections,
  };
}

export default function AtlasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isSignedIn } = useAuth();

  const [summary, setSummary] = useState<AtlasCountry[]>([]);
  const [connections, setConnections] = useState<AtlasConnection[]>([]);
  const [loadError, setLoadError] = useState<AtlasSummaryLoadError | null>(null);
  const [loadFailure, setLoadFailure] = useState<AtlasSummaryLoadFailure | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCachedData, setHasCachedData] = useState(false);
  const [localRippleArcs, setLocalRippleArcs] = useState<AtlasConnection[]>([]);
  const [atlasTabFocused, setAtlasTabFocused] = useState(false);
  const atlasHasLoadedOnceRef = useRef(false);
  const atlasFocusedRef = useRef(false);
  const atlasLoadGenerationRef = useRef(0);

  const [diagBusy, setDiagBusy] = useState(false);
  const [diagJson, setDiagJson] = useState<string | null>(null);

  const { matches, myCountryCode, mutualEchoes, myPhotos, hasHydrated } = useApp();

  const fireExploreOptions = useMemo((): AtlasFireExploreOptions => {
    const localMatches: LocalRippleExploreMatch[] = matches
      .filter((m) => m.verdict === "same")
      .map((m) => ({
        id: m.id,
        verdict: m.verdict,
        myPhoto: m.myPhoto,
        theirPhoto: m.theirPhoto,
        theirPhotoId: m.theirPhotoId,
        theirCountryCode: m.theirCountryCode,
        myCountry: m.myCountry,
        myCountryCode: m.myCountryCode,
        myCaptureCountryCode: m.myCaptureCountryCode,
        theirCaptureCountryCode: m.theirCaptureCountryCode,
        theme: m.theme,
        theirActualTheme: m.theirActualTheme,
        theirTags: m.theirTags,
        sharedTags: m.sharedTags,
        theirMusicGenre: m.theirMusicGenre,
        theirCustomAudioUrl: m.theirCustomAudioUrl,
        timestamp: m.timestamp,
      }));
    const localWaves: LocalWaveExploreEcho[] = mutualEchoes.map((e) => ({
      id: e.id,
      theme: e.theme,
      myPhoto: e.mine.uri,
      myPhotoId: e.mine.id,
      theirPhoto: e.theirs.uri,
      theirPhotoId: e.theirs.id,
      theirCountryCode: e.theirs.countryCode ?? "",
      myCountryCode: e.mine.countryCode ?? myCountryCode,
      mutualAt: e.mutualAt,
    }));
    return {
      localMatches,
      localWaves,
      viewerCountryCode: myCountryCode,
      viewerMyPhotos: myPhotos.map((p, i) => ({
        uri: p.uri,
        backendId: p.backendId,
        theme: p.theme,
        tags: p.tags,
        subjects: p.subjects,
        musicGenre: p.musicGenre,
        customAudioUrl: p.customAudioUrl,
        captureCountryCode: p.captureCountryCode,
        uploadedAt: p.uploadedAt,
      })),
    };
  }, [matches, mutualEchoes, myCountryCode, myPhotos]);

  const liveLocalRipples = useMemo(
    () =>
      isSignedIn
        ? buildLocalRippleConnections(matches, myCountryCode, myPhotos)
        : [],
    [isSignedIn, matches, myCountryCode, myPhotos],
  );

  const globeConnections = useMemo(
    () =>
      mergeAtlasConnectionsById(
        connections,
        localRippleArcs,
        liveLocalRipples,
      ),
    [connections, localRippleArcs, liveLocalRipples],
  );

  const runConnectivityDiagnostics = useCallback(async () => {
    setDiagBusy(true);
    try {
      const d = await fetchAtlasTabDiagnostics();
      setDiagJson(JSON.stringify(d, null, 2));
      if (__DEV__) {
        console.warn("[Atlas diagnostics]", d);
      }
    } catch (e) {
      setDiagJson(
        JSON.stringify(
          { error: e instanceof Error ? e.message : String(e) },
          null,
          2,
        ),
      );
    } finally {
      setDiagBusy(false);
    }
  }, []);

  const totalCountries = summary.length;
  const totalPhotos = useMemo(
    () => summary.reduce((acc, c) => acc + c.count, 0),
    [summary],
  );

  const load = useCallback(async (isRefresh = false) => {
    if (!hasHydrated) return;
    const generation = ++atlasLoadGenerationRef.current;
    if (isRefresh) invalidateAtlasSummaryCache();
    setRefreshing(true);
    if (!atlasHasLoadedOnceRef.current && !hasCachedData) setLoading(true);
    try {
      const data = await fetchAtlasSummary({ force: isRefresh });
      if (generation !== atlasLoadGenerationRef.current) return;
      if (data.loadError == null) {
        let mergedCountries = data.countries;
        let mergedConnections = data.connections;
        setSummary((prev) => {
          mergedCountries = mergeAtlasPayload(
            { countries: prev, connections: [] },
            { countries: data.countries, connections: [] },
          ).countries;
          return mergedCountries;
        });
        setConnections((prev) => {
          mergedConnections = mergeAtlasPayload(
            { countries: [], connections: prev },
            { countries: [], connections: data.connections },
          ).connections;
          return mergedConnections;
        });
        setLoadError(null);
        setLoadFailure(null);
        if (mergedCountries.length > 0 || mergedConnections.length > 0) {
          await saveAtlasCache(mergedCountries, mergedConnections);
        }
      } else {
        setLoadError(data.loadError);
        setLoadFailure(data.loadFailure ?? null);
        // Background refresh failed — keep the last good map instead of wiping it.
        setSummary((prev) => (prev.length > 0 ? prev : data.countries));
        setConnections((prev) => (prev.length > 0 ? prev : data.connections));
      }
      atlasHasLoadedOnceRef.current = true;
    } finally {
      if (generation === atlasLoadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [hasCachedData, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (globeConnections.length === 0 && summary.length === 0) return;
    void saveAtlasCache(summary, globeConnections);
  }, [globeConnections, summary, hasHydrated]);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadAtlasCache(), loadRipplefireLocalCache()]).then(
      ([cached, localRipples]) => {
        if (!alive) return;
        if (localRipples.length > 0) {
          setLocalRippleArcs(localRipples);
        }
        if (!cached) return;
        setSummary((prev) =>
          prev.length > 0 ? prev : cached.countries,
        );
        setConnections((prev) =>
          mergeAtlasConnectionsById(prev, cached.connections),
        );
        if (cached.countries.length > 0 || cached.connections.length > 0) {
          setHasCachedData(true);
          atlasHasLoadedOnceRef.current = true;
          setLoading(false);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasHydrated) return;
      setAtlasTabFocused(true);
      atlasFocusedRef.current = true;
      markTabVisited("atlas");
      void load(hasCachedData || atlasHasLoadedOnceRef.current);
      return () => {
        setAtlasTabFocused(false);
        atlasFocusedRef.current = false;
        void stopWavefireAmbience();
      };
    }, [load, hasCachedData, hasHydrated]),
  );

  useEffect(() => {
    return registerAtlasRefreshListener(() => {
      void load(true);
    });
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && atlasFocusedRef.current) void load(true);
    });
    return () => sub.remove();
  }, [load]);

  // Persist merged server + local ripple arcs so Ripplefire survives refresh/update.
  useEffect(() => {
    if (!hasHydrated) return;
    const ripples = globeConnections.filter((c) => c.kind === "ripple");
    if (ripples.length === 0) return;
    const t = setTimeout(() => {
      void saveRipplefireLocalCache(ripples);
      void saveAtlasCache(summary, globeConnections);
    }, 400);
    return () => clearTimeout(t);
  }, [hasHydrated, globeConnections, summary]);

  const outerPad = 16;
  const topPadding = Platform.OS === "web" ? 56 : insets.top;
  const bottomPad = Platform.OS === "web" ? 28 : insets.bottom;

  const headerSub = useMemo(() => {
    if (loading && !hasCachedData) return null;
    if (loadError === "unauthorized" && totalCountries === 0 && connections.length === 0) {
      return "Sign in to load the map";
    }
    if (loadError === "network" || loadError === "server") {
      return "Atlas unavailable — tap refresh to retry";
    }
    if (totalCountries === 0 && globeConnections.length === 0) {
      return "No live connections yet";
    }
    if (totalCountries === 0) {
      return `${globeConnections.length} live ${globeConnections.length === 1 ? "connection" : "connections"}`;
    }
    return `${totalCountries} ${totalCountries === 1 ? "country" : "countries"} · ${totalPhotos} ${totalPhotos === 1 ? "photo" : "photos"}`;
  }, [
    loading,
    hasCachedData,
    loadError,
    totalCountries,
    globeConnections.length,
    totalPhotos,
  ]);

  const hasDisplayableGlobe =
    summary.length > 0 || globeConnections.length > 0;

  const showGlobe =
    (!loading || hasCachedData || hasDisplayableGlobe) &&
    (loadError === null || hasDisplayableGlobe);
  const showRefresh =
    (!loading || hasCachedData) &&
    !(
      loadError === "unauthorized" &&
      totalCountries === 0 &&
      globeConnections.length === 0
    );
  const atlasSyncing = refreshing || (loading && hasCachedData);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.shimmerClip} pointerEvents="none">
        <OceanShimmer />
      </View>

      <View style={[styles.headerRow, { paddingTop: topPadding + 2 }]}>
        <View style={styles.headerTextCol}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Atlas
          </Text>
          {headerSub ? (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {headerSub}
            </Text>
          ) : null}
        </View>
        {showRefresh ? (
          <SyncRefreshButton
            syncing={atlasSyncing}
            onPress={() => void load(true)}
            accessibilityLabel="Refresh Atlas"
            style={styles.refreshBtn}
          />
        ) : null}
      </View>

      {loading && !hasCachedData ? (
        <View style={styles.flexCentre}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centreText, { color: colors.mutedForeground }]}>
            Loading live ripples and waves…
          </Text>
        </View>
      ) : null}

      {!loading &&
      loadError === "unauthorized" &&
      totalCountries === 0 &&
      connections.length === 0 ? (
        <View style={styles.flexCentre}>
          <Icon name="globe" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Sign in to open the Atlas
          </Text>
          <Text style={[styles.centreText, { color: colors.mutedForeground }]}>
            The map loads after sign-in so we can show your ripples and waves
            with everyone else’s.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go to sign in"
            activeOpacity={0.85}
            onPress={() => router.push("/sign-in")}
            style={[styles.signInBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.signInBtnLabel, { color: "#001018" }]}>
              Continue with Google
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showGlobe ? (
        <View
          style={[
            styles.mapColumn,
            {
              paddingHorizontal: outerPad,
              paddingBottom: bottomPad + 8,
            },
          ]}
        >
          <AtlasGlobeExperience
            style={styles.globeFlex}
            width={width - outerPad * 2}
            connections={globeConnections}
            countries={summary}
            isSignedIn={!!isSignedIn}
            isTabFocused={atlasTabFocused}
            localRippleMatches={fireExploreOptions.localMatches}
            localWaveEchoes={fireExploreOptions.localWaves}
            viewerCountryCode={fireExploreOptions.viewerCountryCode}
            viewerMyPhotos={fireExploreOptions.viewerMyPhotos}
          />
        </View>
      ) : null}

      {!loading &&
      (loadError === "server" || loadError === "network") &&
      !hasDisplayableGlobe ? (
        <ScrollView
          style={styles.errorScroll}
          contentContainerStyle={[
            styles.errorScrollContent,
            {
              paddingHorizontal: outerPad,
              paddingBottom: bottomPad + 16,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <View style={[styles.centreBlock, { paddingTop: 8 }]}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Could not reach the Atlas API
            </Text>
            <Text style={[styles.centreText, { color: colors.mutedForeground }]}>
              {loadFailure?.category === "network"
                ? "Check EXPO_PUBLIC_API_URL (LAN IP on a phone) and that the API server is running."
                : "The API returned an error."}
            </Text>
            {loadFailure ? (
              <View style={styles.failureFacts}>
                <Text
                  style={[styles.failureFactLine, { color: colors.mutedForeground }]}
                  selectable
                >
                  API host: {loadFailure.apiHost}
                </Text>
                {loadFailure.category === "http" &&
                typeof loadFailure.status === "number" ? (
                  <Text
                    style={[styles.failureFactLine, { color: colors.mutedForeground }]}
                    selectable
                  >
                    HTTP {loadFailure.status}
                  </Text>
                ) : null}
                {loadFailure.detail ? (
                  <Text
                    style={[styles.failureDetail, { color: colors.foreground }]}
                    selectable
                  >
                    {loadFailure.detail}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Run Atlas connectivity diagnostics"
              activeOpacity={0.85}
              onPress={() => void runConnectivityDiagnostics()}
              disabled={diagBusy}
              style={[
                styles.diagBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: diagBusy ? 0.65 : 1,
                },
              ]}
            >
              <Text style={[styles.diagBtnLabel, { color: colors.foreground }]}>
                {diagBusy
                  ? "Running diagnostics…"
                  : "Run diagnostics (health + DB + Atlas)"}
              </Text>
            </TouchableOpacity>
            {diagJson ? (
              <Text
                selectable
                style={[styles.diagDump, { color: colors.mutedForeground }]}
              >
                {diagJson}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shimmerClip: {
    ...StyleSheet.absoluteFillObject,
    top: "12%",
    overflow: "hidden",
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  refreshBtn: {
    marginTop: 2,
    padding: 4,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 1,
    lineHeight: 16,
  },

  mapColumn: {
    flex: 1,
    minHeight: 0,
  },
  globeFlex: {
    flex: 1,
    minHeight: 0,
  },

  flexCentre: {
    flex: 1,
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 24,
  },

  errorScroll: {
    flex: 1,
    minHeight: 0,
  },
  errorScrollContent: {
    flexGrow: 1,
  },

  centreBlock: {
    paddingTop: 24,
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 8,
  },
  centreText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    marginTop: 4,
  },
  signInBtn: {
    marginTop: 8,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minWidth: 200,
    alignItems: "center",
  },
  signInBtnLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  failureFacts: {
    alignSelf: "stretch",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  failureFactLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
  },
  failureDetail: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 4,
  },
  diagBtn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "stretch",
    alignItems: "center",
  },
  diagBtnLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    textAlign: "center",
  },
  diagDump: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 10,
    lineHeight: 13,
    marginTop: 10,
    alignSelf: "stretch",
    paddingHorizontal: 4,
    textAlign: "left",
  },
});
