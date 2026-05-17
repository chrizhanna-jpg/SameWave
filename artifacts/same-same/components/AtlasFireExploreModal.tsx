import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/Icon";
import { DAILY_CHALLENGES } from "@/data/samplePhotos";
import { resolveMusicUrl } from "@/data/musicLibrary";
import { flagFor, nameFor } from "@/data/countries";
import { useColors } from "@/hooks/useColors";
import {
  fetchAtlasFireExplore,
  flattenAtlasFireExplorePhotos,
  formatAtlasFireExploreDiagnostics,
  type AtlasFireParticipant,
  type LocalRippleExploreMatch,
} from "@/utils/api";
import type { AtlasThemeCluster } from "@/utils/atlasWavefire";
import type { AtlasFireMode } from "@/utils/atlasFireVisuals";
import type { AtlasFireVisual } from "@/utils/atlasFireVisuals";
import { markUserInteracted, playClip, stopIfLease } from "@/utils/audio";
import {
  pauseWavefireAmbienceForOverlay,
  resumeWavefireAmbienceAfterOverlay,
} from "@/utils/wavefireAmbience";

type Props = {
  visible: boolean;
  onClose: () => void;
  fireMode: AtlasFireMode;
  visual: AtlasFireVisual;
  cluster: AtlasThemeCluster;
  /** Same-swipe ripples merged into Atlas as `local-ripple-*` arcs. */
  localRippleMatches?: LocalRippleExploreMatch[];
  viewerCountryCode?: string;
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

function resolveThemeDisplay(raw: string): { title: string; emoji: string } {
  const t = raw.trim();
  if (!t) return { title: "Moment", emoji: "✨" };
  const meta = DAILY_CHALLENGES.find(
    (c) => c.id === t || c.title.toLowerCase() === t.toLowerCase(),
  );
  return { title: meta?.title ?? t, emoji: meta?.emoji ?? "✨" };
}

function ImmersivePhotoViewer({
  tile,
  accent,
  onClose,
}: {
  tile: ExplorePhotoTile;
  accent: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { title, emoji } = resolveThemeDisplay(tile.theme);
  const country = tile.participant.countryCode;
  const clip = vibeUrl(tile.participant);
  const playLease = useRef(0);

  useEffect(() => {
    void pauseWavefireAmbienceForOverlay();
    markUserInteracted();
    if (clip) {
      playLease.current = playClip(clip);
    }
    return () => {
      void stopIfLease(playLease.current);
      void resumeWavefireAmbienceAfterOverlay();
    };
  }, [clip]);

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <View style={styles.immersiveRoot}>
        <Image
          source={{ uri: tile.participant.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View style={styles.immersiveScrim} pointerEvents="none" />
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.immersiveClose, { top: insets.top + 12 }]}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        >
          <Icon name="x" size={22} color="#E8F4F8" />
        </Pressable>
        <View
          style={[styles.immersiveCaption, { paddingBottom: insets.bottom + 20 }]}
        >
          <Text style={styles.immersiveTheme} numberOfLines={2}>
            {emoji} {title}
          </Text>
          <Text style={styles.immersiveCountry} numberOfLines={1}>
            {flagFor(country)} {nameFor(country) ?? country}
          </Text>
          {clip ? (
            <View style={[styles.vibePill, { borderColor: accent }]}>
              <Icon name="play" size={14} color={accent} />
              <Text style={[styles.vibePillText, { color: accent }]}>
                Playing this vibe
              </Text>
            </View>
          ) : (
            <Text style={styles.immersiveNoVibe}>No vibe clip for this photo</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function FullScreenPhotoPage({
  tile,
  pageHeight,
  captionBottomInset,
  onOpen,
}: {
  tile: ExplorePhotoTile;
  pageHeight: number;
  /** Safe area + breathing room so caption stays on screen. */
  captionBottomInset: number;
  onOpen: () => void;
}) {
  const { title, emoji } = resolveThemeDisplay(tile.theme);
  const country = tile.participant.countryCode;

  return (
    <Pressable
      onPress={onOpen}
      style={[styles.page, { height: pageHeight }]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${nameFor(country) ?? country}. Tap for fullscreen and vibe.`}
    >
      <Image
        source={{ uri: tile.participant.uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
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
        <Text style={styles.pageHint}>Tap to open · hear the vibe</Text>
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
  viewerCountryCode,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height: windowH } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugReport, setDebugReport] = useState<string | null>(null);
  const [photoTiles, setPhotoTiles] = useState<ExplorePhotoTile[]>([]);
  const [immersive, setImmersive] = useState<ExplorePhotoTile | null>(null);
  const [listViewportHeight, setListViewportHeight] = useState(0);

  // Each page must match the FlatList viewport (below the top bar), not full window —
  // otherwise the bottom caption sits off-screen.
  const pageHeight = Math.max(
    1,
    listViewportHeight > 0
      ? listViewportHeight
      : windowH - insets.top - insets.bottom - 72,
  );
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
    if (!visible) {
      setImmersive(null);
      setPhotoTiles([]);
      setDebugReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDebugReport(null);
    const ids = cluster.connections.map((c) => c.id);
    void fetchAtlasFireExplore(ids, clusterContext, {
      localMatches: localRippleMatches,
      viewerCountryCode,
    }).then(({ moments, error, diagnostics }) => {
        if (cancelled) return;
        const tiles = flattenAtlasFireExplorePhotos(
          moments,
          cluster.displayTheme,
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
    viewerCountryCode,
  ]);

  const handleClose = useCallback(() => {
    setImmersive(null);
    onClose();
  }, [onClose]);

  const renderPage = useCallback(
    ({ item }: { item: ExplorePhotoTile }) => (
      <FullScreenPhotoPage
        tile={item}
        pageHeight={pageHeight}
        captionBottomInset={captionBottomInset}
        onOpen={() => setImmersive(item)}
      />
    ),
    [pageHeight, captionBottomInset],
  );

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
                paddingTop: insets.top + 8,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.topBarTitle}>
              <Icon name={visual.filterIcon} size={20} color={visual.lineStroke} />
              <Text style={[styles.topBarLabel, { color: colors.foreground }]}>
                {visual.label}
              </Text>
            </View>
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
              <FlatList
                data={photoTiles}
                keyExtractor={(item) => item.key}
                renderItem={renderPage}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                snapToAlignment="start"
                decelerationRate="fast"
                getItemLayout={(_, index) => ({
                  length: pageHeight,
                  offset: pageHeight * index,
                  index,
                })}
                style={{ width, flex: 1 }}
                extraData={pageHeight}
              />
            </View>
          )}
        </View>
      </Modal>

      {immersive ? (
        <ImmersivePhotoViewer
          tile={immersive}
          accent={visual.lineStroke}
          onClose={() => setImmersive(null)}
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
  topBarLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
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
    width: "100%",
    backgroundColor: "#000",
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
  immersiveClose: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 16, 24, 0.55)",
    zIndex: 3,
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
    marginBottom: 12,
  },
  immersiveNoVibe: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(232, 244, 248, 0.65)",
  },
  vibePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(0, 16, 24, 0.45)",
  },
  vibePillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
