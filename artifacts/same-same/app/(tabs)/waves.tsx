import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { OceanShimmer } from "@/components/OceanShimmer";
import { SyncRefreshButton } from "@/components/SyncRefreshButton";
import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import type { EchoCard, Match, MyPhoto } from "@/context/AppContext";
import {
  WAVES_TAB,
  WAVE_MUTUAL_TAGLINE,
} from "@/data/waveRippleGlossary";
import { fetchRecentWavesFeed, type RecentWaveFeedItem } from "@/utils/api";
import {
  enrichMatchesForStorage,
  resolveEchoPhotoUri,
  resolveMatchMyPhotoUri,
  resolveMatchPhotoDisplay,
  photoStreamFallbackUri,
} from "@/utils/photoDisplayUri";
import { markTabVisited } from "@/utils/tabVisits";
import { scrollPaddingAboveTabBar, tabBarTotalHeight } from "@/utils/tabBarSafeArea";
import { timeAgo } from "@/utils/timeAgo";
import { photoKey } from "@/utils/photoKey";
import { photoCountryDisplay, resolveCaptureCountryCode } from "@/utils/photoCountry";

type WaveSectionId = "received" | "caught" | "sent" | "world";

function echoPairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function matchToCaughtEcho(match: Match, myPhotos: MyPhoto[]): EchoCard {
  const photos = resolveMatchPhotoDisplay(match, myPhotos);
  const myCapture = resolveCaptureCountryCode(
    match.myCaptureCountryCode,
    photos.myPhoto,
  );
  const theirCapture = resolveCaptureCountryCode(
    match.theirCaptureCountryCode,
    photos.theirPhoto,
  );
  const myDisp = photoCountryDisplay(myCapture);
  const theirDisp = photoCountryDisplay(theirCapture);
  return {
    id: `match-${match.id}`,
    state: "mutual",
    theme: match.theme ?? "",
    createdAt: match.timestamp,
    mutualAt: match.timestamp,
    youSentFirst: true,
    mine: {
      id: match.myPhotoId ?? "",
      uri: photos.myPhoto,
      countryCode: myDisp.code ?? null,
      captureCountryCode: myCapture ?? null,
      country: myDisp.name,
      countryFlag: myDisp.flag,
      theme: match.theme,
    },
    theirs: {
      id: match.theirPhotoId ?? "",
      uri: photos.theirPhoto,
      countryCode: theirDisp.code ?? null,
      captureCountryCode: theirCapture ?? null,
      country: theirDisp.name,
      countryFlag: theirDisp.flag,
      theme: match.theirActualTheme ?? match.theme,
    },
  };
}

function waveWithCountry(country: string): string {
  return `Wave with ${country}`;
}

function caughtWaveSubtitle(echo: EchoCard): string {
  if (echo.youSentFirst === true) return WAVES_TAB.wavesCaughtTheyRippledBack;
  if (echo.youSentFirst === false) return WAVES_TAB.wavesCaughtYouRippledBack;
  return WAVE_MUTUAL_TAGLINE;
}

const WAVE_SECTIONS: {
  id: WaveSectionId;
  chip: keyof typeof WAVES_TAB;
  icon: "ripple" | "wave-glyph" | "globe";
}[] = [
  { id: "sent", chip: "sectionSentChip", icon: "ripple" },
  { id: "caught", chip: "sectionCaughtChip", icon: "wave-glyph" },
  { id: "received", chip: "sectionReceivedChip", icon: "ripple" },
  { id: "world", chip: "sectionWorldChip", icon: "globe" },
];

export default function WavesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    pendingEchoes,
    mutualEchoes,
    matches,
    myPhotos,
    markAllEchoesSeen,
    refreshEchoes,
    respondToEcho,
    cloudSyncInProgress,
    syncCloudData,
    reconcileMatchPhotos,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const [worldWaves, setWorldWaves] = useState<RecentWaveFeedItem[]>([]);
  const [worldLoading, setWorldLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<WaveSectionId>("sent");
  const prevPendingRef = useRef(0);
  const [scrollViewportH, setScrollViewportH] = useState(0);
  const [scrollContentH, setScrollContentH] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    setScrollY(0);
  }, [activeSection]);

  const onScrollList = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);

  const maxScrollY = Math.max(0, scrollContentH - scrollViewportH);
  const showScrollHint =
    scrollContentH > scrollViewportH + 8 && scrollY < maxScrollY - 6;

  const topPadding = Platform.OS === "web" ? 56 : insets.top;
  const bottomPad = scrollPaddingAboveTabBar(insets);
  const scrollHintBottom = tabBarTotalHeight(insets) + 8;

  const mutualKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const e of mutualEchoes) {
      keys.add(photoKey(e.theirs.uri));
      if (e.theirs.id) keys.add(e.theirs.id);
      if (e.mine.id && e.theirs.id) {
        keys.add(echoPairKey(e.mine.id, e.theirs.id));
      }
    }
    return keys;
  }, [mutualEchoes]);

  const ripplesSent = useMemo(
    () =>
      [...matches]
        .filter((m) => m.verdict === "same")
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        ),
    [matches],
  );

  const ripplesSentDisplay = useMemo(
    () => enrichMatchesForStorage(ripplesSent, myPhotos),
    [ripplesSent, myPhotos],
  );

  const wavesCaught = useMemo(() => {
    const echoPairKeys = new Set<string>();
    for (const e of mutualEchoes) {
      if (e.mine.id && e.theirs.id) {
        echoPairKeys.add(echoPairKey(e.mine.id, e.theirs.id));
      }
    }

    const fromMatches: EchoCard[] = [];
    for (const m of ripplesSent) {
      const myId = m.myPhotoId?.trim() ?? "";
      const theirId = m.theirPhotoId?.trim() ?? "";
      const pairKey = myId && theirId ? echoPairKey(myId, theirId) : "";
      if (pairKey && echoPairKeys.has(pairKey)) continue;

      const isMutual =
        (theirId && mutualKeys.has(theirId)) ||
        mutualKeys.has(photoKey(m.theirPhoto)) ||
        (pairKey.length > 0 && echoPairKeys.has(pairKey));

      if (!isMutual) continue;
      fromMatches.push(matchToCaughtEcho(m, myPhotos));
    }

    return [...mutualEchoes, ...fromMatches].sort((a, b) => {
      const at = a.mutualAt ? new Date(a.mutualAt).getTime() : 0;
      const bt = b.mutualAt ? new Date(b.mutualAt).getTime() : 0;
      return bt - at;
    });
  }, [mutualEchoes, ripplesSent, mutualKeys, myPhotos]);

  useEffect(() => {
    if (pendingEchoes.length > prevPendingRef.current) {
      setActiveSection("received");
    }
    prevPendingRef.current = pendingEchoes.length;
  }, [pendingEchoes.length]);

  const loadWorldWaves = useCallback(async () => {
    setWorldLoading(true);
    try {
      const rows = await fetchRecentWavesFeed(30);
      setWorldWaves(rows);
    } finally {
      setWorldLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      markTabVisited("waves");
      reconcileMatchPhotos();
      void refreshEchoes();
      void syncCloudData();
      void loadWorldWaves();
      const t = setTimeout(() => markAllEchoesSeen(), 900);
      return () => clearTimeout(t);
    }, [
      refreshEchoes,
      syncCloudData,
      markAllEchoesSeen,
      loadWorldWaves,
      reconcileMatchPhotos,
    ]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshEchoes(), syncCloudData(), loadWorldWaves()]);
    setRefreshing(false);
  };

  const handleRespond = async (id: string, verdict: "same" | "different") => {
    Haptics.impactAsync(
      verdict === "same"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    const result = await respondToEcho(id, verdict);
    if (result === "mutual") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCelebratingId(id);
      setTimeout(() => setCelebratingId(null), 2500);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.shimmerClip} pointerEvents="none">
        <OceanShimmer />
      </View>

      <View style={[styles.headerRow, { paddingTop: topPadding + 2 }]}>
        <View style={styles.headerTextCol}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {WAVES_TAB.title}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {WAVES_TAB.subtitle}
          </Text>
        </View>
        <SyncRefreshButton
          syncing={refreshing || cloudSyncInProgress || worldLoading}
          onPress={() => void onRefresh()}
          accessibilityLabel="Refresh Ripples and Waves"
        />
      </View>

      <WavesSectionBar
        active={activeSection}
        onChange={setActiveSection}
        pendingReceived={pendingEchoes.length}
      />

      <View style={styles.scrollWrap}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator
          scrollEventThrottle={16}
          onLayout={(e) => setScrollViewportH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setScrollContentH(h)}
          onScroll={onScrollList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.primary}
            />
          }
        >
        {activeSection === "received" ? (
          <>
            <SectionHeader
              icon="ripple"
              iconColor={colors.teal}
              title={WAVES_TAB.ripplesReceivedTitle}
              subtitle={WAVES_TAB.ripplesReceivedSub}
            />
            {pendingEchoes.length === 0 ? (
              <SectionEmpty
                icon="ripple"
                iconColor={colors.teal}
                title={WAVES_TAB.emptyTitle}
                body={WAVES_TAB.emptyBody}
              />
            ) : (
              pendingEchoes.map((echo) => (
                <PendingRippleCard
                  key={echo.id}
                  echo={echo}
                  onRespond={handleRespond}
                  celebrating={celebratingId === echo.id}
                />
              ))
            )}
          </>
        ) : null}

        {activeSection === "caught" ? (
          <>
            <SectionHeader
              icon="wave-glyph"
              iconColor={colors.gold}
              title={WAVES_TAB.wavesCaughtTitle}
              subtitle={WAVES_TAB.wavesCaughtSub}
            />
            {wavesCaught.length === 0 ? (
              <SectionEmpty
                icon="wave-glyph"
                iconColor={colors.gold}
                title="No Waves caught yet"
                body={WAVES_TAB.wavesCaughtSub}
              />
            ) : (
              wavesCaught.map((echo) => (
                <WaveCaughtCard key={echo.id} echo={echo} />
              ))
            )}
          </>
        ) : null}

        {activeSection === "sent" ? (
          <>
            <SectionHeader
              icon="ripple"
              iconColor={colors.primary}
              title={WAVES_TAB.ripplesSentTitle}
              subtitle={WAVES_TAB.ripplesSentSub}
            />
            {ripplesSent.length === 0 ? (
              <SectionEmpty
                icon="ripple"
                iconColor={colors.primary}
                title="No Ripples sent yet"
                body="Ripple on photos in the match deck — they'll appear here while you wait for a Wave back."
              />
            ) : (
              ripplesSentDisplay.map((match) => (
                <RippleSentCard
                  key={match.id}
                  match={match}
                  myPhotos={myPhotos}
                  isWave={
                    mutualKeys.has(photoKey(match.theirPhoto)) ||
                    (!!match.theirPhotoId && mutualKeys.has(match.theirPhotoId))
                  }
                />
              ))
            )}
          </>
        ) : null}

        {activeSection === "world" ? (
          <>
            <SectionHeader
              icon="wave-glyph"
              iconColor={colors.feedAccent}
              title={WAVES_TAB.wavesAroundTitle}
              subtitle={WAVES_TAB.wavesAroundSub}
            />
            {!worldLoading && worldWaves.length === 0 ? (
              <SectionEmpty
                icon="wave-glyph"
                iconColor={colors.feedAccent}
                title="No Waves around the world yet"
                body={WAVES_TAB.wavesAroundEmpty}
              />
            ) : null}
            {worldWaves.map((wave) => (
              <WorldWaveCard key={wave.echoId} wave={wave} />
            ))}
          </>
        ) : null}
        </ScrollView>

        {showScrollHint ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={[`${colors.background}00`, colors.background]}
              style={styles.scrollFadeBottom}
            />
            <View
              pointerEvents="none"
              style={[styles.scrollChevronWrap, { bottom: scrollHintBottom }]}
            >
              <Icon name="chevron-down" size={20} color={colors.mutedForeground} />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

function WavesSectionBar({
  active,
  onChange,
  pendingReceived,
}: {
  active: WaveSectionId;
  onChange: (id: WaveSectionId) => void;
  pendingReceived: number;
}) {
  const colors = useColors();

  return (
    <View style={styles.sectionBar}>
      {WAVE_SECTIONS.map(({ id, chip, icon }) => {
        const selected = active === id;
        const isWorld = id === "world";
        const accent =
          id === "received"
            ? colors.teal
            : id === "sent"
              ? colors.primary
              : id === "caught"
                ? colors.gold
                : colors.feedAccent;
        const badge =
          id === "received" && pendingReceived > 0
            ? pendingReceived > 9
              ? "9+"
              : String(pendingReceived)
            : null;
        const chipBg = selected
          ? accent + "28"
          : isWorld
            ? colors.feedAccent + "22"
            : colors.cardElevated;
        const chipBorder = selected
          ? accent + "88"
          : isWorld
            ? colors.feedAccent + "70"
            : colors.border;
        const labelColor =
          isWorld
            ? colors.feedAccent
            : selected
              ? colors.foreground
              : colors.mutedForeground;

        const iconSize = id === "caught" ? 36 : 24;

        return (
          <Pressable
            key={id}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(id);
            }}
            style={[
              styles.sectionChip,
              id === "caught" ? styles.sectionChipCaught : null,
              {
                backgroundColor: chipBg,
                borderColor: chipBorder,
              },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            {badge ? (
              <View style={[styles.sectionChipBadge, { backgroundColor: accent }]}>
                <Text style={styles.sectionChipBadgeText}>{badge}</Text>
              </View>
            ) : null}
            <Icon
              name={icon}
              size={iconSize}
              color={selected ? accent : labelColor}
              glyphFit={icon === "wave-glyph" ? "square" : undefined}
            />
            <Text
              style={[
                styles.sectionChipLabel,
                isWorld ? styles.sectionChipLabelShort : null,
                { color: labelColor },
              ]}
              numberOfLines={isWorld ? 1 : 2}
            >
              {WAVES_TAB[chip]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionEmpty({
  icon,
  iconColor,
  title,
  body,
}: {
  icon: "ripple" | "wave-glyph";
  iconColor: string;
  title: string;
  body: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.emptyCard,
        { backgroundColor: colors.cardElevated, borderColor: colors.border },
        colors.shadows.sm,
      ]}
    >
      <View
        style={[
          styles.emptyIconBadge,
          { backgroundColor: iconColor + "22", borderColor: iconColor + "44" },
        ]}
      >
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>{body}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon,
  iconColor,
  spaceTop,
}: {
  title: string;
  subtitle: string;
  icon?: "ripple" | "wave-glyph";
  iconColor?: string;
  spaceTop?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.sectionHeader, spaceTop && { marginTop: 18 }]}>
      <View style={styles.sectionTitleRow}>
        {icon ? (
          <Icon name={icon} size={16} color={iconColor ?? colors.teal} />
        ) : null}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
        {subtitle}
      </Text>
    </View>
  );
}

function PendingRippleCard({
  echo,
  onRespond,
  celebrating,
}: {
  echo: EchoCard;
  onRespond: (id: string, verdict: "same" | "different") => void;
  celebrating: boolean;
}) {
  const colors = useColors();
  const ago = timeAgo(new Date(echo.createdAt));
  const theirDisp = photoCountryDisplay(echo.theirs.captureCountryCode, {
    sampleUri: echo.theirs.uri,
  });
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardElevated,
          borderColor: celebrating ? colors.gold : colors.teal + "55",
          borderWidth: celebrating ? 2 : 1,
        },
        celebrating ? colors.shadows.glowAccent : colors.shadows.sm,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.bigFlag}>{theirDisp.flag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTitleRow}>
            <Icon name="ripple" size={14} color={colors.teal} />
            <Text
              style={[styles.cardTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              Someone in {theirDisp.name}
            </Text>
          </View>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            Ripple received · {ago}
          </Text>
        </View>
      </View>

      <PhotoPair mine={echo.mine} theirs={echo.theirs} />

      {celebrating ? (
        <View
          style={[
            styles.celebrateBanner,
            { borderColor: colors.gold + "55", backgroundColor: colors.gold + "1f" },
          ]}
        >
          <Icon name="wave-glyph" size={20} color={colors.gold} />
          <Text style={[styles.celebrateText, { color: colors.gold }]}>
            {WAVE_MUTUAL_TAGLINE}
          </Text>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => onRespond(echo.id, "different")}
            style={[
              styles.actionBtn,
              { borderColor: colors.border, backgroundColor: colors.background },
            ]}
            activeOpacity={0.85}
          >
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>
              different
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRespond(echo.id, "same")}
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              { backgroundColor: colors.teal },
            ]}
            activeOpacity={0.85}
          >
            <Icon name="wave-glyph" size={16} color="#001018" />
            <Text style={[styles.actionLabel, { color: "#001018" }]}>
              {WAVES_TAB.pendingActionLabel}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function WaveCaughtCard({ echo }: { echo: EchoCard }) {
  const colors = useColors();
  const stamp = echo.mutualAt ? new Date(echo.mutualAt) : new Date(echo.createdAt);
  const ago = timeAgo(stamp);
  const theirDisp = photoCountryDisplay(echo.theirs.captureCountryCode, {
    sampleUri: echo.theirs.uri,
  });
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push({
          pathname: "/echo-pair",
          params: { a: echo.mine.id, b: echo.theirs.id },
        })
      }
      style={[
        styles.card,
        { backgroundColor: colors.cardElevated, borderColor: colors.gold + "44" },
        colors.shadows.sm,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.bigFlag}>{theirDisp.flag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTitleRow}>
            <Icon name="wave-glyph" size={14} color={colors.gold} />
            <Text
              style={[styles.cardTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {waveWithCountry(theirDisp.name)}
            </Text>
          </View>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {caughtWaveSubtitle(echo)} · {ago}
          </Text>
        </View>
      </View>
      <PhotoPair mine={echo.mine} theirs={echo.theirs} />
    </TouchableOpacity>
  );
}

function WorldWaveCard({ wave }: { wave: RecentWaveFeedItem }) {
  const colors = useColors();
  const ago = wave.mutualAt ? timeAgo(new Date(wave.mutualAt)) : null;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push({
          pathname: "/echo-pair",
          params: { a: wave.a.id, b: wave.b.id },
        })
      }
      style={[
        styles.card,
        { backgroundColor: colors.cardElevated, borderColor: colors.gold + "33" },
        colors.shadows.sm,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.bigFlag}>{wave.a.countryFlag}</Text>
        <Icon name="wave-glyph" size={16} color={colors.gold} />
        <Text style={styles.bigFlag}>{wave.b.countryFlag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.cardTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {wave.a.country} · {wave.b.country}
          </Text>
          {ago ? (
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Wave · {ago}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.photosRow}>
        <View style={styles.photoCol}>
          <RemotePhotoImage
            uri={wave.a.uri}
            fallbackUri={photoStreamFallbackUri(wave.a.id)}
            style={styles.photo}
            recyclingKey={wave.a.id}
            transitionMs={0}
          />
          <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
            {wave.a.countryFlag} {wave.a.country}
          </Text>
        </View>
        <Icon name="wave-glyph" size={18} color={colors.gold} />
        <View style={styles.photoCol}>
          <RemotePhotoImage
            uri={wave.b.uri}
            fallbackUri={photoStreamFallbackUri(wave.b.id)}
            style={styles.photo}
            recyclingKey={wave.b.id}
            transitionMs={0}
          />
          <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
            {wave.b.countryFlag} {wave.b.country}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function RippleSentCard({
  match,
  myPhotos,
  isWave,
}: {
  match: Match;
  myPhotos: MyPhoto[];
  isWave: boolean;
}) {
  const colors = useColors();
  const ago = timeAgo(new Date(match.timestamp));
  const myUri = resolveMatchMyPhotoUri(match, myPhotos);
  const theirUri = resolveMatchPhotoDisplay(match, myPhotos).theirPhoto;
  const myDisp = photoCountryDisplay(match.myCaptureCountryCode, {
    sampleUri: myUri,
  });
  const theirDisp = photoCountryDisplay(match.theirCaptureCountryCode, {
    sampleUri: theirUri,
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push({
          pathname: "/reveal",
          params: { matchId: match.id },
        })
      }
      style={[
        styles.card,
        {
          backgroundColor: colors.cardElevated,
          borderColor: isWave ? colors.gold + "44" : colors.border,
        },
        colors.shadows.sm,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.bigFlag}>{theirDisp.flag}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTitleRow}>
            <Icon
              name={isWave ? "wave-glyph" : "ripple"}
              size={14}
              color={isWave ? colors.gold : colors.teal}
            />
            <Text
              style={[styles.cardTitle, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {isWave
                ? waveWithCountry(theirDisp.name)
                : `Ripple to ${theirDisp.name}`}
            </Text>
          </View>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {isWave ? "Became a Wave" : "Waiting for ripple back"} · {ago}
          </Text>
        </View>
      </View>
      <View style={styles.photosRow}>
        <View style={styles.photoCol}>
          {myUri ? (
            <RemotePhotoImage
              uri={myUri}
              fallbackUri={photoStreamFallbackUri(match.myPhotoId)}
              style={styles.photo}
              recyclingKey={match.myPhotoId || myUri}
              transitionMs={0}
            />
          ) : (
            <View
              style={[
                styles.photo,
                styles.photoMissing,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Icon name="ripple" size={22} color={colors.mutedForeground} />
            </View>
          )}
          <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
            {myDisp.flag} yours
          </Text>
        </View>
        <Icon name="arrow-right" size={18} color={colors.mutedForeground} />
        <View style={styles.photoCol}>
          {theirUri ? (
            <RemotePhotoImage
              uri={theirUri}
              fallbackUri={photoStreamFallbackUri(match.theirPhotoId)}
              style={styles.photo}
              recyclingKey={match.theirPhotoId || theirUri}
              transitionMs={0}
            />
          ) : (
            <View
              style={[
                styles.photo,
                styles.photoMissing,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Icon name="ripple" size={22} color={colors.mutedForeground} />
            </View>
          )}
          <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
            {theirDisp.flag} theirs
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PhotoPair({
  mine,
  theirs,
}: {
  mine: EchoCard["mine"];
  theirs: EchoCard["theirs"];
}) {
  const colors = useColors();
  const mineUri = resolveEchoPhotoUri(mine);
  const theirsUri = resolveEchoPhotoUri(theirs);
  const myDisp = photoCountryDisplay(mine.captureCountryCode, {
    sampleUri: mineUri,
  });
  const theirDisp = photoCountryDisplay(theirs.captureCountryCode, {
    sampleUri: theirsUri,
  });
  return (
    <View style={styles.photosRow}>
      <View style={styles.photoCol}>
        <RemotePhotoImage
          uri={mineUri}
          fallbackUri={photoStreamFallbackUri(mine.id)}
          style={styles.photo}
          recyclingKey={mine.id || mineUri}
          transitionMs={0}
        />
        <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
          {myDisp.flag} yours
        </Text>
      </View>
      <Icon name="arrow-right" size={18} color={colors.mutedForeground} />
      <View style={styles.photoCol}>
        <RemotePhotoImage
          uri={theirsUri}
          fallbackUri={photoStreamFallbackUri(theirs.id)}
          style={styles.photo}
          recyclingKey={theirs.id || theirsUri}
          transitionMs={0}
        />
        <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>
          {theirDisp.flag} theirs
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shimmerClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    lineHeight: 15,
  },
  scrollWrap: {
    flex: 1,
    position: "relative",
  },
  scroll: {
    flex: 1,
  },
  scrollFadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  scrollChevronWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  sectionBar: {
    flexDirection: "row",
    flexGrow: 0,
    marginBottom: 4,
    paddingHorizontal: 16,
    gap: 6,
    paddingBottom: 10,
  },
  sectionChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 70,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 3,
    paddingTop: 11,
    paddingBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    position: "relative",
  },
  sectionChipCaught: {
    minHeight: 86,
  },
  sectionChipLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    width: "100%",
  },
  sectionChipLabelShort: {
    fontSize: 11,
    lineHeight: 13,
  },
  sectionChipBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionChipBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#001018",
  },
  content: { paddingHorizontal: 16, gap: 14, paddingTop: 4 },
  sectionHeader: { paddingHorizontal: 2, paddingBottom: 4 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 16,
  },
  card: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bigFlag: { fontSize: 28 },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    minWidth: 0,
  },
  cardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  photosRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoCol: { flex: 1, gap: 6, alignItems: "center" },
  photo: { width: "100%", aspectRatio: 1, borderRadius: 14 },
  photoMissing: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photoLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionBtnPrimary: { borderColor: "transparent" },
  actionLabel: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  celebrateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  celebrateText: { fontSize: 12, fontFamily: "Inter_700Bold", flex: 1 },
  emptyCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
    marginTop: 24,
  },
  emptyIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  emptyIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
});
