import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AudioMuteButton } from "@/components/AudioMuteButton";
import { Icon } from "@/components/Icon";
import {
  resolveThemeDisplay,
} from "@/utils/resolveThemeDisplay";
import { resolveMusicUrl } from "@/data/musicLibrary";
import { flagFor, nameFor } from "@/data/countries";
import { useColors } from "@/hooks/useColors";
import {
  authedImageHeaders,
  explorePhotoUriNeedsAuth,
  buildExploreFlattenOptions,
  fetchAtlasFireExplore,
  flattenAtlasFireExplorePhotos,
  formatAtlasFireExploreDiagnostics,
  peekAuthedImageHeaders,
  warmAuthedImageHeaders,
  type AtlasFireParticipant,
  type LocalRippleExploreMatch,
  type LocalWaveExploreEcho,
  type ViewerExplorePhoto,
} from "@/utils/api";
import { withDisplayPhotoWidth } from "@/utils/photoDisplayUri";
import { getPublicApiOrigin } from "@/utils/publicEnv";
import type { AtlasThemeCluster } from "@/utils/atlasWavefire";
import type { AtlasFireMode } from "@/utils/atlasFireVisuals";
import type { AtlasFireVisual } from "@/utils/atlasFireVisuals";
import { markUserInteracted, playClip, stopIfLease } from "@/utils/audio";

type Props = {
  visible: boolean;
  onClose: () => void;
  fireMode: AtlasFireMode;
  visual: AtlasFireVisual;
  cluster: AtlasThemeCluster;
  /** Same-swipe ripples merged into Atlas as `local-ripple-*` arcs. */
  localRippleMatches?: LocalRippleExploreMatch[];
  localWaveEchoes?: LocalWaveExploreEcho[];
  viewerCountryCode?: string;
  viewerMyPhotos?: ViewerExplorePhoto[];
};

export type ExplorePhotoTile = {
  key: string;
  theme: string;
  participant: AtlasFireParticipant;
};

function vibeUrl(p: AtlasFireParticipant): string | null {
  return (
    resolveMusicUrl({
      customAudioUrl: p.customAudioUrl,
      musicGenre: p.musicGenre,
      theme: p.theme,
      tags: p.tags,
      seed: p.uri,
    }) ?? null
  );
}

/** Loads explore URIs — uses bearer headers for `/api/photos/:id/image` streams. */
function ExploreAtlasPhoto({
  uri,
  authHeaders,
}: {
  uri: string;
  authHeaders?: Record<string, string>;
}) {
  const displayUri = useMemo(() => withDisplayPhotoWidth(uri), [uri]);
  const needsAuth = explorePhotoUriNeedsAuth(displayUri);
  const headers = authHeaders ?? peekAuthedImageHeaders();

  useEffect(() => {
    if (!needsAuth) return;
    if (headers) {
      void Image.prefetch(displayUri, { headers }).catch(() => {});
      return;
    }
    warmAuthedImageHeaders();
  }, [displayUri, headers, needsAuth]);

  if (needsAuth && !headers) {
    return (
      <View style={styles.explorePhotoLoader}>
        <ActivityIndicator color="#E8F4F8" size="large" />
      </View>
    );
  }

  return (
    <Image
      source={
        needsAuth && headers ? { uri: displayUri, headers } : { uri: displayUri }
      }
      style={StyleSheet.absoluteFillObject}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={displayUri}
      placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
      transition={200}
    />
  );
}

function ImmersivePhotoViewer({
  tile,
  onClose,
  authHeaders,
}: {
  tile: ExplorePhotoTile;
  onClose: () => void;
  authHeaders?: Record<string, string>;
}) {
  const insets = useSafeAreaInsets();
  const uploadedTheme = (tile.participant.theme || tile.theme).trim();
  const { title, emoji } = resolveThemeDisplay(uploadedTheme);
  const country = tile.participant.countryCode;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <View style={styles.immersiveRoot}>
        <ExploreAtlasPhoto uri={tile.participant.uri} authHeaders={authHeaders} />
        <View style={styles.immersiveScrim} pointerEvents="none" />
        <View style={[styles.immersiveTopBar, { top: insets.top + 12 }]}>
          <AudioMuteButton variant="overlay" iconSize={20} />
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            style={styles.immersiveClose}
          >
            <Icon name="x" size={22} color="#E8F4F8" />
          </Pressable>
        </View>
        <View
          style={[styles.immersiveCaption, { paddingBottom: insets.bottom + 20 }]}
        >
          <Text style={styles.immersiveTheme} numberOfLines={2}>
            {emoji} {title}
          </Text>
          <Text style={styles.immersiveCountry} numberOfLines={1}>
            {flagFor(country)} {nameFor(country) ?? country}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function FullScreenPhotoPage({
  tile,
  pageWidth,
  pageHeight,
  captionBottomInset,
  onOpen,
  authHeaders,
}: {
  tile: ExplorePhotoTile;
  pageWidth: number;
  pageHeight: number;
  /** Safe area + breathing room so caption stays on screen. */
  captionBottomInset: number;
  onOpen: () => void;
  authHeaders?: Record<string, string>;
}) {
  const uploadedTheme = (tile.participant.theme || tile.theme).trim();
  const { title, emoji } = resolveThemeDisplay(uploadedTheme);
  const country = tile.participant.countryCode;

  return (
    <Pressable
      onPress={onOpen}
      style={[styles.page, { width: pageWidth, height: pageHeight }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${nameFor(country) ?? country}. Tap for fullscreen.`}
    >
      <ExploreAtlasPhoto uri={tile.participant.uri} authHeaders={authHeaders} />
      <View style={styles.pageScrim} pointerEvents="none" />
      <View
        style={[
          styles.pageCaption,
          { paddingBottom: captionBottomInset },
        ]}
      >
        <Text style={styles.pageTheme} numberOfLines={2}>
          {emoji} {title}
        </Text>
        <Text style={styles.pageCountry} numberOfLines={1}>
          {flagFor(country)} {nameFor(country) ?? country}
        </Text>
        <Text style={styles.pageHint}>Tap to open</Text>
      </View>
    </Pressable>
  );
}

export function AtlasFireExploreModal({
  visible,
  onClose,
  fireMode,
  visual,
  cluster,
  localRippleMatches,
  localWaveEchoes,
  viewerCountryCode,
  viewerMyPhotos,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugReport, setDebugReport] = useState<string | null>(null);
  const [photoTiles, setPhotoTiles] = useState<ExplorePhotoTile[]>([]);
  const [immersive, setImmersive] = useState<ExplorePhotoTile | null>(null);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [exploreAuthHeaders, setExploreAuthHeaders] = useState<
    Record<string, string> | undefined
  >();
  const explorePlayLeaseRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      setExploreAuthHeaders(undefined);
      return;
    }
    warmAuthedImageHeaders();
    const cached = peekAuthedImageHeaders();
    if (cached) {
      setExploreAuthHeaders(cached);
      return;
    }
    let cancelled = false;
    void authedImageHeaders().then((h) => {
      if (!cancelled) setExploreAuthHeaders(h);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || photoTiles.length === 0) return;
    const headers = exploreAuthHeaders ?? peekAuthedImageHeaders();
    if (!headers) return;
    for (const tile of photoTiles) {
      const uri = withDisplayPhotoWidth(tile.participant.uri);
      if (!uri) continue;
      if (explorePhotoUriNeedsAuth(uri)) {
        void Image.prefetch(uri, { headers }).catch(() => {});
      } else {
        void Image.prefetch(uri).catch(() => {});
      }
    }
  }, [visible, photoTiles, exploreAuthHeaders]);

  // Page height must match the measured list viewport
  const pageHeight = Math.max(1, listViewportHeight);
  const listPagingReady = listViewportHeight > 0;
  const captionBottomInset = insets.bottom + 20;

  const clusterContext = useMemo(
    () => ({
      kind: fireMode === "wavefire" ? ("wave" as const) : ("ripple" as const),
      countryCodes: cluster.countryCodes,
      displayTheme: cluster.displayTheme,
    }),
    [fireMode, cluster.countryCodes, cluster.displayTheme],
  );

  const connectionIds = useMemo(
    () => cluster.connections.map((c) => c.id).join("\0"),
    [cluster.connections],
  );

  useEffect(() => {
    setPhotoIndex(0);
  }, [photoTiles.length, connectionIds, visible]);

  const onPhotoScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageHeight <= 0 || photoTiles.length === 0) return;
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.round(y / pageHeight);
      setPhotoIndex(Math.max(0, Math.min(photoTiles.length - 1, idx)));
    },
    [pageHeight, photoTiles.length],
  );

  const photoCountLabel =
    photoTiles.length > 0
      ? `Photo ${photoIndex + 1} of ${photoTiles.length}`
      : null;

  useEffect(() => {
    if (!visible) {
      void stopIfLease(explorePlayLeaseRef.current);
      explorePlayLeaseRef.current = 0;
      setImmersive(null);
      setPhotoTiles([]);
      setDebugReport(null);
      setListViewportHeight(0);
      setPhotoIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDebugReport(null);
    const ids = cluster.connections.map((c) => c.id);
    void fetchAtlasFireExplore(ids, clusterContext, {
      localMatches: localRippleMatches,
      localWaves: localWaveEchoes,
      viewerCountryCode,
      viewerMyPhotos,
    }).then(({ moments, error, diagnostics }) => {
        if (cancelled) return;
        const tiles = flattenAtlasFireExplorePhotos(
          moments,
          cluster.displayTheme,
          getPublicApiOrigin(),
          buildExploreFlattenOptions(viewerMyPhotos),
        );
        setPhotoTiles(tiles);
        setLoadError(error);
        setDebugReport(
          tiles.length === 0
            ? formatAtlasFireExploreDiagnostics(diagnostics)
            : null,
        );
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    connectionIds,
    clusterContext,
    cluster.displayTheme,
    localRippleMatches,
    localWaveEchoes,
    viewerCountryCode,
    viewerMyPhotos,
  ]);

  // Auto-play the visible photo's vibe; switch clips when the user scrolls.
  useEffect(() => {
    if (!visible || photoTiles.length === 0) return;
    const tile = photoTiles[photoIndex];
    if (!tile) return;
    markUserInteracted();
    const clip = vibeUrl(tile.participant);
    if (clip) {
      explorePlayLeaseRef.current = playClip(clip);
      return;
    }
    void stopIfLease(explorePlayLeaseRef.current);
    explorePlayLeaseRef.current = 0;
  }, [visible, photoIndex, photoTiles]);

  const handleClose = useCallback(() => {
    void stopIfLease(explorePlayLeaseRef.current);
    explorePlayLeaseRef.current = 0;
    setImmersive(null);
    onClose();
  }, [onClose]);

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleClose}
      >
        <View style={[styles.root, { backgroundColor: "#000" }]}>
          <View
            style={[
              styles.topBar,
              {
                paddingTop: insets.top + 16,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.topBarTitle}>
              <Icon name={visual.filterIcon} size={20} color={visual.lineStroke} />
              <View style={styles.topBarTitleText}>
                <Text style={[styles.topBarLabel, { color: colors.foreground }]}>
                  {visual.label}
                </Text>
                {photoCountLabel ? (
                  <Text
                    style={[styles.topBarCounter, { color: colors.mutedForeground }]}
                  >
                    {photoCountLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.topBarActions}>
              <AudioMuteButton variant="overlay" iconSize={20} />
              <Pressable
                onPress={handleClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close explore"
                style={[styles.closeBtn, { backgroundColor: "rgba(255,255,255,0.12)" }]}
              >
                <Icon name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={visual.lineStroke} size="large" />
            </View>
          ) : photoTiles.length === 0 ? (
            <ScrollView
              style={styles.debugScroll}
              contentContainerStyle={styles.debugScrollContent}
            >
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {loadError ?? "No photos to show"}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                Pull to refresh the Atlas tab, then try Explore again. Details below
                help pinpoint what to fix.
              </Text>
              {debugReport ? (
                <View
                  style={[
                    styles.debugBox,
                    {
                      borderColor: visual.lineStroke + "66",
                      backgroundColor: "rgba(0,16,24,0.85)",
                    },
                  ]}
                >
                  <Text style={[styles.debugLabel, { color: visual.lineStroke }]}>
                    Diagnostic report
                  </Text>
                  <Text
                    style={[styles.debugMono, { color: colors.foreground }]}
                    selectable
                  >
                    {debugReport}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            <View
              style={styles.listViewport}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && Math.abs(h - listViewportHeight) > 1) {
                  setListViewportHeight(h);
                }
              }}
            >
              {listPagingReady ? (
                <FlatList
                  key={`explore-pager-${pageHeight}`}
                  data={photoTiles}
                  keyExtractor={(tile) => tile.key}
                  pagingEnabled
                  showsVerticalScrollIndicator={false}
                  snapToAlignment="start"
                  snapToInterval={pageHeight}
                  decelerationRate="fast"
                  style={{ flex: 1, width }}
                  nestedScrollEnabled
                  onScroll={onPhotoScroll}
                  scrollEventThrottle={16}
                  initialNumToRender={1}
                  maxToRenderPerBatch={2}
                  windowSize={3}
                  removeClippedSubviews
                  getItemLayout={(_, index) => ({
                    length: pageHeight,
                    offset: pageHeight * index,
                    index,
                  })}
                  renderItem={({ item: tile }) => (
                    <FullScreenPhotoPage
                      tile={tile}
                      pageWidth={width}
                      pageHeight={pageHeight}
                      captionBottomInset={captionBottomInset}
                      onOpen={() => setImmersive(tile)}
                      authHeaders={exploreAuthHeaders}
                    />
                  )}
                />
              ) : (
                <View style={styles.centered}>
                  <ActivityIndicator color={visual.lineStroke} size="large" />
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>

      {immersive ? (
        <ImmersivePhotoViewer
          tile={immersive}
          onClose={() => setImmersive(null)}
          authHeaders={exploreAuthHeaders}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 2,
  },
  topBarTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  topBarTitleText: {
    flex: 1,
    gap: 2,
  },
  topBarLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
  topBarCounter: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  debugScroll: {
    flex: 1,
  },
  debugScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  emptyHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  debugBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  debugLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  debugMono: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  page: {
    backgroundColor: "#000",
    overflow: "hidden",
  },
  explorePhotoLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0a0a",
  },
  pageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 16, 24, 0.35)",
  },
  listViewport: {
    flex: 1,
    width: "100%",
  },
  pageCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 40,
    backgroundColor: "rgba(0, 16, 24, 0.78)",
  },
  pageTheme: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: "#E8F4F8",
    marginBottom: 6,
  },
  pageCountry: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "rgba(232, 244, 248, 0.92)",
    marginBottom: 8,
  },
  pageHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(232, 244, 248, 0.7)",
  },
  immersiveRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  immersiveScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 16, 24, 0.2)",
  },
  immersiveTopBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 3,
  },
  immersiveClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 16, 24, 0.55)",
  },
  immersiveCaption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 40,
    backgroundColor: "rgba(0, 16, 24, 0.78)",
  },
  immersiveTheme: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#E8F4F8",
    marginBottom: 6,
  },
  immersiveCountry: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "rgba(232, 244, 248, 0.9)",
  },
});
