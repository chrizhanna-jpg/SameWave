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
import { tabBarTotalHeight } from "@/utils/tabBarSafeArea";

import { useAuth } from "@clerk/expo";

import { AtlasGlobeExperience } from "@/components/AtlasGlobeExperience";
import { Icon } from "@/components/Icon";
import { OceanShimmer } from "@/components/OceanShimmer";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import type { EchoCard, Match } from "@/context/AppContext";
import type { LocalWaveExploreEcho } from "@/utils/api";
import {
  fetchAtlasSummary,
  fetchAtlasTabDiagnostics,
  type AtlasConnection,
  type AtlasCountry,
  type AtlasSummaryLoadError,
  type AtlasSummaryLoadFailure,
} from "@/utils/api";
import { registerAtlasRefreshListener } from "@/utils/atlasHub";
import { markTabVisited } from "@/utils/tabVisits";
import { COUNTRIES } from "@/data/countries";

const RIPPLE_FRESH_MS = 48 * 60 * 60 * 1000;

/** ISO2 for Atlas arcs: profile `myCountryCode`, else same-swipe match `myCountry` label (not "You"). */
function resolveViewerIso2(
  myCountryCode: string | undefined,
  matches: Match[],
): string | undefined {
  const direct = (myCountryCode ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(direct)) return direct;
  const label = matches.find((m) => m.verdict === "same")?.myCountry?.trim();
  if (!label || label.toLowerCase() === "you") return undefined;
  const hit = COUNTRIES.find(
    (c) => c.name.toLowerCase() === label.toLowerCase(),
  );
  return hit?.code.toUpperCase();
}

/** My Journey "Ripples" live in local `matches`; Atlas uses `/api/photos/atlas` (echoes). Merge same-swipe ripples when no server arc exists for that country pair yet. */
function mergeLocalSameRippleArcs(
  api: AtlasConnection[],
  matches: Match[],
  myCountryCode: string | undefined,
  isSignedIn: boolean,
): AtlasConnection[] {
  if (!isSignedIn) return api;
  const mine = resolveViewerIso2(myCountryCode, matches);
  if (!mine) return api;

  const hasApiRippleBetween = (to: string) =>
    api.some(
      (c) =>
        c.kind === "ripple" &&
        ((c.from === mine && c.to === to) || (c.from === to && c.to === mine)),
    );

  const now = Date.now();
  const added: AtlasConnection[] = [];
  for (const m of matches) {
    if (m.verdict !== "same") continue;
    const to = (m.theirCountryCode ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(to) || to === mine) continue;
    if (hasApiRippleBetween(to)) continue;
    const ts = Date.parse(m.timestamp);
    const fresh = Number.isFinite(ts) && now - ts < RIPPLE_FRESH_MS;
    const theme = (m.theme ?? "").trim();
    added.push({
      id: `local-ripple-${m.id}`,
      kind: "ripple",
      from: mine,
      to,
      fresh,
      createdAt: m.timestamp,
      theme,
      tags: [],
      subjects: [],
      color: "#4FD89C",
      mine: true,
    });
  }
  if (added.length === 0) return api;

  return [...api, ...added];
}

/** Mutual Waves on device before the server arc appears on Atlas. */
function mergeLocalWaveArcs(
  api: AtlasConnection[],
  mutualEchoes: EchoCard[],
  myCountryCode: string | undefined,
  matches: Match[],
  isSignedIn: boolean,
): AtlasConnection[] {
  if (!isSignedIn) return api;
  const mine = resolveViewerIso2(myCountryCode, matches);
  if (!mine) return api;

  const hasApiWaveBetween = (to: string) =>
    api.some(
      (c) =>
        c.kind === "wave" &&
        ((c.from === mine && c.to === to) || (c.from === to && c.to === mine)),
    );

  const added: AtlasConnection[] = [];
  for (const e of mutualEchoes) {
    if (e.state !== "mutual") continue;
    const to = (e.theirs.countryCode ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(to) || to === mine) continue;
    if (hasApiWaveBetween(to)) continue;
    const theme = (e.theme ?? "").trim();
    added.push({
      id: `local-wave-${e.id}`,
      kind: "wave",
      from: mine,
      to,
      fresh: true,
      createdAt: e.mutualAt ?? e.createdAt,
      theme,
      tags: [],
      subjects: [],
      color: "#D4AF37",
      mine: true,
    });
  }
  if (added.length === 0) return api;
  return [...api, ...added];
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
  const atlasHasLoadedOnceRef = useRef(false);
  const atlasFocusedRef = useRef(false);

  const [diagBusy, setDiagBusy] = useState(false);
  const [diagJson, setDiagJson] = useState<string | null>(null);

  const { matches, myCountryCode, mutualEchoes, myPhotos } = useApp();

  const globeConnections = useMemo(
    () =>
      mergeLocalWaveArcs(
        mergeLocalSameRippleArcs(
          connections,
          matches,
          myCountryCode,
          !!isSignedIn,
        ),
        mutualEchoes,
        myCountryCode,
        matches,
        !!isSignedIn,
      ),
    [connections, matches, mutualEchoes, myCountryCode, isSignedIn],
  );

  const viewerExplorePhotos = useMemo(
    () =>
      myPhotos.map((p) => ({
        uri: p.uri,
        backendId: p.backendId,
        theme: p.theme,
        tags: p.tags,
        subjects: p.subjects,
        musicGenre: p.musicGenre,
        customAudioUrl: p.customAudioUrl,
      })),
    [myPhotos],
  );

  const localRippleMatches = useMemo(
    () =>
      matches
        .filter((m) => m.verdict === "same")
        .map((m) => {
          const mine = myPhotos.find((p) => p.uri === m.myPhoto);
          return {
            id: m.id,
            verdict: m.verdict,
            myPhoto: m.myPhoto,
            theirPhoto: m.theirPhoto,
            theirPhotoId: m.theirPhotoId,
            myPhotoId: mine?.backendId,
            theirCountryCode: m.theirCountryCode,
            myCountry: m.myCountry,
            theme: m.theme,
            theirActualTheme: m.theme,
            theirTags: m.sharedTags,
            sharedTags: m.sharedTags,
            theirMusicGenre: undefined,
            theirCustomAudioUrl: undefined,
            myMusicGenre: mine?.musicGenre,
            myCustomAudioUrl: mine?.customAudioUrl,
            timestamp: m.timestamp,
          };
        }),
    [matches, myPhotos],
  );

  const localWaveEchoes = useMemo((): LocalWaveExploreEcho[] => {
    const mine = resolveViewerIso2(myCountryCode, matches);
    return mutualEchoes
      .filter((e) => e.state === "mutual")
      .map((e) => ({
        id: e.id,
        theme: (e.theme ?? "").trim(),
        myPhoto: e.mine.uri,
        myPhotoId: e.mine.id,
        theirPhoto: e.theirs.uri,
        theirPhotoId: e.theirs.id,
        theirCountryCode: (e.theirs.countryCode ?? "").trim().toUpperCase(),
        myCountryCode: mine,
        myMusicGenre: undefined,
        theirMusicGenre: undefined,
        mutualAt: e.mutualAt,
      }));
  }, [mutualEchoes, myCountryCode, matches]);

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
    if (isRefresh) setRefreshing(true);
    else if (!atlasHasLoadedOnceRef.current) setLoading(true);
    try {
      let data = await fetchAtlasSummary({ force: isRefresh });
      const timedOut =
        data.loadError === "network" &&
        (data.loadFailure?.detail?.toLowerCase().includes("timed out") ?? false);
      if (timedOut && !isRefresh) {
        await new Promise((r) => setTimeout(r, 2500));
        data = await fetchAtlasSummary({ force: true });
      }
      setSummary(data.countries);
      setConnections(data.connections);
      setLoadError(data.loadError ?? null);
      setLoadFailure(data.loadFailure ?? null);
      atlasHasLoadedOnceRef.current = true;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      atlasFocusedRef.current = true;
      markTabVisited("atlas");
      void load(true);
      return () => {
        atlasFocusedRef.current = false;
      };
    }, [load]),
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

  const outerPad = 16;
  const topPadding = Platform.OS === "web" ? 56 : insets.top;
  const bottomPad =
    Platform.OS === "web" ? 28 + 84 : tabBarTotalHeight(insets);

  const headerSub = useMemo(() => {
    if (loading) return null;
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
    loadError,
    totalCountries,
    globeConnections.length,
    totalPhotos,
  ]);

  const showGlobe = !loading && loadError === null;
  const showRefresh =
    !loading &&
    !(
      loadError === "unauthorized" &&
      totalCountries === 0 &&
      globeConnections.length === 0
    );

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
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Refresh Atlas"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={refreshing}
            onPress={() => void load(true)}
            style={styles.refreshBtn}
          >
            <Icon
              name="refresh-cw"
              size={22}
              color={refreshing ? colors.mutedForeground : colors.primary}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
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
            Sign in to see live Ripples and Waves from everyone on the map.
            Use Mine only to filter to yours.
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
            localRippleMatches={localRippleMatches}
            localWaveEchoes={localWaveEchoes}
            viewerCountryCode={myCountryCode}
            viewerMyPhotos={viewerExplorePhotos}
          />
        </View>
      ) : null}

      {!loading && (loadError === "server" || loadError === "network") ? (
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
