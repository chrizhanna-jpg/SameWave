import React, { useCallback } from "react";
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scrollPaddingAboveTabBar } from "@/utils/tabBarSafeArea";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { markTabVisited } from "@/utils/tabVisits";
import { Icon } from "@/components/Icon";
import { OceanShimmer } from "@/components/OceanShimmer";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { photoCountryDisplay } from "@/utils/photoCountry";
import { BadgeCard } from "@/components/BadgeCard";
import { CountryPickerModal } from "@/components/CountryPickerModal";
import { tagEmoji, tagLabel } from "@/utils/interests";
import { GlobeAnimation } from "@/components/GlobeAnimation";
import { Surface } from "@/components/Surface";
import { GradientCard } from "@/components/GradientCard";
import { PressableScale } from "@/components/PressableScale";
import { profileEchoBellA11y } from "@/data/waveRippleGlossary";
import {
  COPYRIGHT_FOOTER_LABEL,
  COPYRIGHT_FOOTER_LINE,
  accountDeletionPageUrl,
  SUPPORT_EMAIL,
  WAVE_BLUE,
} from "@/data/studioLegal";
import { getPublicApiOrigin } from "@/utils/publicEnv";

// Installed app version shown at the bottom of the tab. Prefer the native
// values baked into the binary (what the user actually has installed) and
// fall back to the Expo config when running in dev / web.
function getInstalledVersionLabel(): string {
  const versionName =
    Constants.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "?";
  const nativeBuild = Constants.nativeBuildVersion;
  const expoVc = Constants.expoConfig?.android?.versionCode;
  const versionCode =
    nativeBuild != null && nativeBuild !== ""
      ? String(nativeBuild)
      : typeof expoVc === "number"
        ? String(expoVc)
        : null;
  return versionCode
    ? `v${versionName} (build ${versionCode})`
    : `v${versionName}`;
}

// Region buckets used by the World Map breakdown. Order roughly matches
// what feels exciting to the user — Europe & Asia first since the
// challenge themes tend to surface a lot of matches there.
const ALL_REGIONS = [
  {
    name: "Europe",
    countries: ["DE", "FR", "GB", "IT", "ES", "PT", "NL", "BE", "SE", "NO", "DK", "FI", "PL", "CZ", "AT", "CH", "GR", "HU", "RO", "BG"],
    flags: ["🇩🇪", "🇫🇷", "🇬🇧", "🇮🇹", "🇪🇸", "🇵🇹", "🇳🇱", "🇧🇪", "🇸🇪", "🇳🇴", "🇩🇰", "🇫🇮", "🇵🇱", "🇨🇿", "🇦🇹", "🇨🇭", "🇬🇷", "🇭🇺", "🇷🇴", "🇧🇬"],
  },
  {
    name: "Asia",
    countries: ["CN", "JP", "KR", "IN", "TH", "VN", "ID", "PH", "MY", "SG", "BD", "PK", "NP", "TW", "HK"],
    flags: ["🇨🇳", "🇯🇵", "🇰🇷", "🇮🇳", "🇹🇭", "🇻🇳", "🇮🇩", "🇵🇭", "🇲🇾", "🇸🇬", "🇧🇩", "🇵🇰", "🇳🇵", "🇹🇼", "🇭🇰"],
  },
  {
    name: "Africa",
    countries: ["NG", "ZA", "KE", "ET", "GH", "TZ", "UG", "EG", "MA", "TN", "CM", "CI", "SN", "MG", "RW"],
    flags: ["🇳🇬", "🇿🇦", "🇰🇪", "🇪🇹", "🇬🇭", "🇹🇿", "🇺🇬", "🇪🇬", "🇲🇦", "🇹🇳", "🇨🇲", "🇨🇮", "🇸🇳", "🇲🇬", "🇷🇼"],
  },
  {
    name: "Americas",
    countries: ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "VE", "EC", "BO", "UY", "PY", "DO", "CU"],
    flags: ["🇺🇸", "🇨🇦", "🇲🇽", "🇧🇷", "🇦🇷", "🇨🇱", "🇨🇴", "🇵🇪", "🇻🇪", "🇪🇨", "🇧🇴", "🇺🇾", "🇵🇾", "🇩🇴", "🇨🇺"],
  },
  {
    name: "Oceania & Middle East",
    countries: ["AU", "NZ", "FJ", "PG", "SA", "AE", "TR", "IR", "IL", "JO"],
    flags: ["🇦🇺", "🇳🇿", "🇫🇯", "🇵🇬", "🇸🇦", "🇦🇪", "🇹🇷", "🇮🇷", "🇮🇱", "🇯🇴"],
  },
];

/**
 * Tappable row used to deep-link from the Me tab into a sub-screen.
 * Matches the visual language of the existing Connections row so all
 * "open another screen" affordances feel consistent.
 */
function NavRow({
  icon,
  tint,
  title,
  subtitle,
  onPress,
  accessibilityLabel,
}: {
  icon: string;
  tint: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useColors();
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      accessibilityLabel={accessibilityLabel}
      style={styles.navRowWrap}
    >
      <Surface
        elevation="sm"
        radius="lg"
        background={colors.card}
        style={styles.connectionsRow}
      >
        <View style={[styles.connectionsIcon, { backgroundColor: tint + "22" }]}>
          <Icon name={icon as never} size={18} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.connectionsTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.connectionsSub, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color={colors.mutedForeground} />
      </Surface>
    </PressableScale>
  );
}

// Tiny "Signed in" pill that lives directly under the "My Path" header
// title. Purely an ambient cue — the user explicitly asked for a small,
// always-visible reassurance that the account is active, so they don't
// have to scroll all the way down to the SignedInRow at the bottom of
// the tab to know whether they're signed in. The bottom row still owns
// the actual Sign-out action.
function HeaderSignedInBadge() {
  const colors = useColors();
  const { isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return (
    <View style={styles.headerSignedInBadge}>
      <Icon name="check" size={11} color={colors.teal} />
      <Text style={[styles.headerSignedInText, { color: colors.teal }]}>
        Signed in
      </Text>
    </View>
  );
}

// Tiny "Signed in" row + sign-out link. Per product brief, we deliberately
// don't show the user's Google name/email/photo — the account is just an
// invisible anchor for their photos and country. After signOut() the root
// auth gate sends them straight back to the sign-in screen.
function SignedInRow() {
  const colors = useColors();
  const { isSignedIn, signOut } = useAuth();
  const [busy, setBusy] = React.useState(false);
  if (!isSignedIn) return null;
  const onSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Surface
      elevation="sm"
      radius="lg"
      background={colors.card}
      style={[styles.connectionsRow, { marginHorizontal: 20, marginTop: 8 }]}
    >
      <View style={[styles.connectionsIcon, { backgroundColor: colors.teal + "22" }]}>
        <Icon name="check" size={18} color={colors.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.connectionsTitle, { color: colors.foreground }]}>
          Signed in
        </Text>
        <Text style={[styles.connectionsSub, { color: colors.mutedForeground }]}>
          Your photos and country are saved to your account.
        </Text>
      </View>
      <TouchableOpacity
        onPress={onSignOut}
        disabled={busy}
        accessibilityLabel="Sign out"
        accessibilityRole="button"
        hitSlop={10}
      >
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: "Inter_600SemiBold",
            fontSize: 13,
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Signing out…" : "Sign out"}
        </Text>
      </TouchableOpacity>
    </Surface>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      markTabVisited("profile");
    }, []),
  );
  const {
    matches,
    matchedCountries,
    streakCount,
    totalMatches,
    badges,
    myPhotos,
    getWorldMapCoverage,
    connectRequests,
    unreadIncoming,
    pendingOutgoing,
    unreadEchoes,
    mutualEchoes,
    pendingEchoes,
    myVibe,
    myCountryCode,
    myCountryName,
    myCountryFlag,
    setMyCountry,
  } = useApp();
  const [countryPickerOpen, setCountryPickerOpen] = React.useState(false);
  // Region flag grids are collapsed by default — the user wanted a more
  // scannable My World tab. Tapping a region's header toggles its grid.
  const [expandedRegions, setExpandedRegions] = React.useState<Record<string, boolean>>({});
  const toggleRegion = React.useCallback((name: string) => {
    setExpandedRegions((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);
  // Counts for the deep-link rows. The full lists live on dedicated
  // sub-screens (`/match-history`, `/passes`, `/my-photos`) so the Me
  // tab stays scannable as a stats / identity surface.
  const confirmedCount = React.useMemo(
    () => matches.filter((m) => m.verdict === "same").length,
    [matches],
  );
  const passedCount = React.useMemo(
    () => matches.filter((m) => m.verdict === "different").length,
    [matches],
  );
  // Tags I keep matching on across all my matches — answers the question
  // "what kinds of moments and people do I keep finding?".
  const recurringMatchTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      if (m.verdict !== "same") continue;
      for (const t of m.sharedTags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, n]) => ({ tag: t, count: n }));
  }, [matches]);

  const connectionsCount = connectRequests.filter(
    (r) => r.status === "accepted",
  ).length;

  const earnedBadges = badges.filter((b) => b.earned).length;

  // World map data — merged in from the old standalone World tab so the
  // user has one combined "My World" surface instead of two tabs.
  const matchedCodes = React.useMemo(
    () => new Set(matchedCountries.map((c) => c.code)),
    [matchedCountries],
  );
  const worldCoverage = getWorldMapCoverage();

  // Hidden owner entry point: 7 quick taps on the copyright label opens the
  // server-driven catalog admin screen. It is intentionally undiscoverable in
  // normal use and stays unusable without the admin token (the screen gates on
  // it and the server enforces X-Admin-Token).
  const secretTapRef = React.useRef<{
    count: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ count: 0, timer: null });
  const handleSecretAdminTap = React.useCallback(() => {
    const s = secretTapRef.current;
    s.count += 1;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      s.count = 0;
    }, 1500);
    if (s.count >= 7) {
      s.count = 0;
      if (s.timer) clearTimeout(s.timer);
      router.push("/admin-catalog");
    }
  }, []);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const scrollBottomPad = scrollPaddingAboveTabBar(insets, 24);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            My Path
          </Text>
          {/* Tiny "Signed in" cue under the title — purely ambient
              reassurance. The full sign-out row still lives at the
              bottom of the tab. */}
          <HeaderSignedInBadge />
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/waves")}
          activeOpacity={0.8}
          style={[
            styles.bellBtn,
            {
              backgroundColor:
                unreadEchoes > 0 ? colors.teal : colors.card,
              borderColor: unreadEchoes > 0 ? colors.teal : colors.border,
            },
          ]}
          accessibilityLabel={profileEchoBellA11y(unreadEchoes)}
          hitSlop={6}
        >
          <Icon
            name="bell"
            size={18}
            color={unreadEchoes > 0 ? "#001018" : colors.foreground}
          />
          {unreadEchoes > 0 && (
            <View
              style={[
                styles.bellBadge,
                { backgroundColor: colors.gold, borderColor: colors.background },
              ]}
            >
              <Text style={styles.bellBadgeText}>
                {unreadEchoes > 9 ? "9+" : unreadEchoes}
              </Text>
            </View>
          )}
          {unreadEchoes === 0 && (mutualEchoes.length + pendingEchoes.length) > 0 && (
            // Subtle dot when there are echoes already seen — gives the
            // bell something to "remember" so it doesn't look dormant.
            <View
              style={[
                styles.bellDot,
                { backgroundColor: colors.mutedForeground },
              ]}
            />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: scrollBottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <GradientCard
          gradient="primary"
          radius="xl"
          elevation="glowPrimary"
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroCardInner}>
            <Text style={styles.heroSubtitle}>
              You've connected with {matchedCountries.length} {matchedCountries.length === 1 ? "country" : "countries"} across the globe
            </Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>{totalMatches}</Text>
                <Text style={styles.heroStatLabel}>Ripples</Text>
              </View>
              <View style={[styles.heroDivider]} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>
                  {mutualEchoes.length}
                </Text>
                <Text style={styles.heroStatLabel}>Waves</Text>
              </View>
              <View style={[styles.heroDivider]} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatNum}>{getWorldMapCoverage()}%</Text>
                <Text style={styles.heroStatLabel}>world</Text>
              </View>
            </View>
          </View>
        </GradientCard>

        {/* ─────────────── Recent matches preview ───────────────
            Shows a peek of the user's most recent "same" verdicts so the
            tab leads with their actual journey, not stats. The "See all"
            tap opens the full /match-history screen — same destination
            as the NavRow below. */}
        {confirmedCount > 0 && (
          <View style={styles.recentMatchSection}>
            <View style={styles.recentMatchHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Recent matches
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/match-history")}
                activeOpacity={0.7}
                hitSlop={8}
                style={styles.seeAllBtn}
                accessibilityLabel="See all matches"
              >
                <Text style={[styles.seeAllText, { color: colors.primary }]}>
                  See all {confirmedCount}
                </Text>
                <Icon name="chevron-right" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentMatchScroll}
            >
              {matches
                .filter((m) => m.verdict === "same")
                .slice(0, 8)
                .map((m) => (
                  <PressableScale
                    key={m.id}
                    haptic="light"
                    onPress={() =>
                      router.push({
                        pathname: "/reveal",
                        params: { matchId: m.id },
                      })
                    }
                    style={[styles.recentMatchCard, colors.shadows.sm]}
                  >
                    <Image
                      source={{ uri: m.theirPhoto }}
                      style={styles.recentMatchImage}
                    />
                    <View style={styles.recentMatchOverlay}>
                      <Text style={styles.recentMatchFlag}>
                        {photoCountryDisplay(m.theirCaptureCountryCode, {
                          sampleUri: m.theirPhoto,
                        }).flag}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
            </ScrollView>
          </View>
        )}

        {/* Match History deep-link row — moved up so it sits right with
            the recent-matches preview rather than buried below the world
            map. The preview already shows a portion; this row gives the
            full count + tap target. */}
        <NavRow
          icon="ripple"
          tint={colors.teal}
          title="Match History"
          subtitle={
            confirmedCount === 0
              ? "No matches yet — start swiping to fill your journey"
              : `${confirmedCount} ${confirmedCount === 1 ? "match" : "matches"} · tap to revisit or change`
          }
          onPress={() => router.push("/match-history")}
          accessibilityLabel="Open full match history"
        />

        <NavRow
          icon="x"
          tint={colors.mutedForeground}
          title="Recent Different"
          subtitle={
            passedCount === 0
              ? "Nothing to reconsider"
              : `${passedCount} ${passedCount === 1 ? "pass" : "passes"} · changed your mind?`
          }
          onPress={() => router.push("/passes")}
          accessibilityLabel="Open recent passes"
        />

        <PressableScale
          onPress={() => router.push("/connections")}
          haptic="light"
          accessibilityLabel="Open connections"
          style={styles.navRowWrap}
        >
        <Surface
          elevation="sm"
          radius="lg"
          background={colors.card}
          style={styles.connectionsRow}
        >
          <View
            style={[
              styles.connectionsIcon,
              {
                backgroundColor:
                  unreadIncoming > 0 ? colors.teal : colors.teal + "22",
              },
            ]}
          >
            <Icon
              name="bell"
              size={18}
              color={unreadIncoming > 0 ? "#001018" : colors.teal}
            />
            {unreadIncoming > 0 && (
              <View style={[styles.connectionsDot, { backgroundColor: colors.gold, borderColor: colors.card }]}>
                <Text style={styles.connectionsDotText}>{unreadIncoming}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.connectionsTitle, { color: colors.foreground }]}>
              Connections
            </Text>
            <Text style={[styles.connectionsSub, { color: colors.mutedForeground }]}>
              {unreadIncoming > 0
                ? `${unreadIncoming} new — tap to respond`
                : pendingOutgoing > 0
                ? `${pendingOutgoing} request${pendingOutgoing === 1 ? "" : "s"} awaiting reply`
                : connectionsCount > 0
                ? `${connectionsCount} mutual reveal${connectionsCount === 1 ? "" : "s"}`
                : "Anonymous social swaps with your matches"}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.mutedForeground} />
        </Surface>
        </PressableScale>

        {/* ─────────────── World Map (merged in from old World tab) ─────────────── */}
        <View style={styles.worldHeader}>
          <Text style={[styles.worldHeaderTitle, { color: colors.foreground }]}>
            World Map
          </Text>
          <View
            style={[
              styles.coveragePill,
              { backgroundColor: colors.primary + "22" },
            ]}
          >
            <Icon name="globe" size={12} color={colors.primary} />
            <Text style={[styles.coverageText, { color: colors.primary }]}>
              {worldCoverage}% explored
            </Text>
          </View>
        </View>

        <Surface
          elevation="md"
          radius="xl"
          background={colors.cardElevated}
          style={styles.globeCard}
        >
          <GlobeAnimation size={70} />
          <View style={styles.globeStats}>
            <Text style={[styles.globeNum, { color: colors.primary }]}>
              {matchedCountries.length}
            </Text>
            <Text style={[styles.globeLabel, { color: colors.mutedForeground }]}>
              {matchedCountries.length === 1
                ? "country matched"
                : "countries matched"}
            </Text>
            <Text
              style={[styles.globeSubLabel, { color: colors.mutedForeground }]}
            >
              out of 195 countries
            </Text>
          </View>
        </Surface>

        <View style={styles.progressSection}>
          <View
            style={[styles.progressTrack, { backgroundColor: colors.secondary }]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${worldCoverage}%`,
                  backgroundColor:
                    worldCoverage > 50 ? colors.teal : colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            {195 - matchedCountries.length} countries left to discover
          </Text>
        </View>

        {matchedCountries.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Recently matched
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.recentScroll}
            >
              {matchedCountries.slice(0, 12).map((c) => (
                <View
                  key={c.code}
                  style={[
                    styles.countryPill,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.primary + "60",
                    },
                  ]}
                >
                  <Text style={styles.countryFlag}>{c.flag}</Text>
                  <Text
                    style={[styles.countryName, { color: colors.foreground }]}
                  >
                    {c.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {ALL_REGIONS.map((region) => {
          const matched = region.countries.filter((c) =>
            matchedCodes.has(c),
          ).length;
          const pct = Math.round((matched / region.countries.length) * 100);
          const expanded = !!expandedRegions[region.name];
          return (
            <TouchableOpacity
              key={region.name}
              onPress={() => toggleRegion(region.name)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${region.name}, ${matched} of ${region.countries.length} matched, ${expanded ? "tap to collapse" : "tap to expand flags"}`}
              style={[
                styles.regionCard,
                { backgroundColor: colors.card },
                colors.shadows.sm,
              ]}
            >
              <View style={styles.regionHeader}>
                <Text style={[styles.regionName, { color: colors.foreground }]}>
                  {region.name}
                </Text>
                <View style={styles.regionHeaderRight}>
                  <Text
                    style={[styles.regionCount, { color: colors.mutedForeground }]}
                  >
                    {matched}/{region.countries.length}
                  </Text>
                  <Icon
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </View>
              </View>
              <View
                style={[styles.regionTrack, { backgroundColor: colors.secondary }]}
              >
                <View
                  style={[
                    styles.regionFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: pct > 50 ? colors.teal : colors.primary,
                    },
                  ]}
                />
              </View>
              {expanded && (
                <View style={styles.flagRow}>
                  {region.countries.map((code, i) => (
                    <Text
                      key={code}
                      style={[
                        styles.flagItem,
                        { opacity: matchedCodes.has(code) ? 1 : 0.2 },
                      ]}
                    >
                      {region.flags[i]}
                    </Text>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {(myVibe.length > 0 || recurringMatchTags.length > 0) && (
          <Surface
            elevation="sm"
            radius="lg"
            background={colors.card}
            style={styles.vibeCard}
          >
            {myVibe.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text style={[styles.vibeCardLabel, { color: colors.mutedForeground }]}>
                  Your vibe
                </Text>
                <View style={styles.vibeChipsRow}>
                  {myVibe.map((t) => (
                    <View
                      key={t}
                      style={[
                        styles.vibeChip,
                        {
                          backgroundColor: colors.teal + "1f",
                          borderColor: colors.teal + "44",
                        },
                      ]}
                    >
                      <Text style={styles.vibeChipEmoji}>{tagEmoji(t)}</Text>
                      <Text style={[styles.vibeChipText, { color: colors.teal }]}>
                        {tagLabel(t)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.vibeHint, { color: colors.mutedForeground }]}>
                  What your photos say about you. Used to find people who share
                  your interests.
                </Text>
              </View>
            )}
            {recurringMatchTags.length > 0 && (
              <View style={{ gap: 10, marginTop: myVibe.length > 0 ? 16 : 0 }}>
                <Text style={[styles.vibeCardLabel, { color: colors.mutedForeground }]}>
                  You keep matching on
                </Text>
                <View style={styles.vibeChipsRow}>
                  {recurringMatchTags.map(({ tag, count }) => (
                    <View
                      key={tag}
                      style={[
                        styles.vibeChip,
                        {
                          backgroundColor: colors.gold + "22",
                          borderColor: colors.gold + "55",
                        },
                      ]}
                    >
                      <Text style={styles.vibeChipEmoji}>{tagEmoji(tag)}</Text>
                      <Text style={[styles.vibeChipText, { color: colors.gold }]}>
                        {tagLabel(tag)} · {count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Surface>
        )}

        <PressableScale
          onPress={() => setCountryPickerOpen(true)}
          haptic="light"
          accessibilityLabel="Set your home country"
          style={styles.navRowWrap}
        >
        <Surface
          elevation="sm"
          radius="lg"
          background={colors.card}
          style={styles.connectionsRow}
        >
          <View
            style={[
              styles.connectionsIcon,
              { backgroundColor: colors.teal + "22" },
            ]}
          >
            <Text style={{ fontSize: 18 }}>{myCountryFlag ?? "🌍"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.connectionsTitle, { color: colors.foreground }]}>
              {myCountryCode ? "You're in" : "Set your country"}
            </Text>
            <Text style={[styles.connectionsSub, { color: colors.mutedForeground }]}>
              {myCountryName
                ? `${myCountryName} — fallback when a photo has no GPS capture`
                : "Default when camera GPS is unavailable (library uploads)"}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.mutedForeground} />
        </Surface>
        </PressableScale>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Badges
            </Text>
            <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
              {earnedBadges}/{badges.length} earned
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.badgeScroll}
          >
            {badges.map((b) => (
              <View key={b.id} style={{ marginRight: 10 }}>
                <BadgeCard badge={b} />
              </View>
            ))}
          </ScrollView>
        </View>

        <NavRow
          icon="camera"
          tint={colors.gold}
          title="My Photos"
          subtitle={
            myPhotos.length === 0
              ? "No photos posted yet"
              : `${myPhotos.length} ${myPhotos.length === 1 ? "photo" : "photos"} posted`
          }
          onPress={() => router.push("/my-photos")}
          accessibilityLabel="Open your posted photos"
        />

        <NavRow
          icon="send"
          tint="#E57373"
          title="Delete account & data"
          subtitle="Request removal of your account and associated data"
          onPress={() =>
            Linking.openURL(accountDeletionPageUrl(getPublicApiOrigin())).catch(
              () => {},
            )
          }
          accessibilityLabel="Open account and data deletion request page"
        />

        <NavRow
          icon="lock"
          tint={WAVE_BLUE}
          title="Legal, copyright & policies"
          subtitle="Privacy, terms, safety, IP · SameWave Studios"
          onPress={() => router.push("/studio-legal")}
          accessibilityLabel="Open legal, copyright, and policy information"
        />

        <View style={styles.studioFooterRow}>
          <View style={styles.studioFooterCol}>
            <Text
              onPress={handleSecretAdminTap}
              suppressHighlighting
              style={[styles.studioFooterLabel, { color: colors.mutedForeground }]}
            >
              {COPYRIGHT_FOOTER_LABEL}
            </Text>
            <Text
              style={[styles.studioCopyright, { color: colors.mutedForeground }]}
            >
              {COPYRIGHT_FOOTER_LINE}
            </Text>
          </View>
          <PressableScale
            onPress={() =>
              Linking.openURL(
                `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("SameWave feedback")}`,
              ).catch(() => {})
            }
            haptic="light"
            accessibilityLabel={`Email ${SUPPORT_EMAIL} for issues and feature requests`}
            style={styles.studioContactCol}
          >
            <Text
              style={[styles.studioFooterLabel, { color: colors.mutedForeground }]}
            >
              Contact
            </Text>
            <Text style={[styles.studioContactEmail, { color: WAVE_BLUE }]}>
              {SUPPORT_EMAIL}
            </Text>
            <Text
              style={[styles.studioContactHint, { color: colors.mutedForeground }]}
            >
              Issues · features · feedback
            </Text>
          </PressableScale>
        </View>

        <SignedInRow />

        {matches.length === 0 && (
          <View style={[styles.emptyCard, { backgroundColor: colors.cardElevated }, colors.shadows.sm]}>
            <Icon name="globe" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Your journey starts here
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Swipe on some photo pairs to build your profile, earn badges, and fill your world map.
            </Text>
          </View>
        )}

        <Text
          style={[styles.appVersion, { color: colors.mutedForeground }]}
          accessibilityLabel={`App version ${getInstalledVersionLabel()}`}
        >
          SameWave {getInstalledVersionLabel()}
        </Text>
      </ScrollView>

      <CountryPickerModal
        visible={countryPickerOpen}
        onClose={() => setCountryPickerOpen(false)}
        onSelect={(c) => setMyCountry(c.code, c.name, c.flag)}
        selectedCode={myCountryCode}
        title="Where in the world are you?"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#001018",
  },
  bellDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.6,
  },
  headerTitleCol: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  // Tiny pill that sits directly under the "My Path" title to confirm
  // the user is signed in. Kept intentionally low-key (small text, no
  // background) so it reads as ambient status, not a CTA.
  headerSignedInBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerSignedInText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  heroCard: {
    borderRadius: 24,
    padding: 24,
    gap: 8,
  },
  heroCardInner: {
    padding: 24,
    gap: 8,
  },
  navRowWrap: {
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginBottom: 16,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroStat: {
    alignItems: "center",
    flex: 1,
  },
  heroStatNum: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  heroStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.65)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  heroDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  recentMatchSection: {
    gap: 12,
  },
  recentMatchHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  recentMatchScroll: {
    gap: 10,
    paddingRight: 4,
  },
  recentMatchCard: {
    width: 96,
    height: 96,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  recentMatchImage: {
    width: "100%",
    height: "100%",
  },
  recentMatchOverlay: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  recentMatchFlag: {
    fontSize: 16,
  },
  regionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vibeCard: {
    padding: 16,
    marginBottom: 16,
  },
  vibeCardLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  vibeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vibeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  vibeChipEmoji: {
    fontSize: 14,
  },
  vibeChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  vibeHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  connectionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  connectionsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  connectionsDot: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionsDotText: {
    color: "#001018",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  connectionsTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  connectionsSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  sectionCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  badgeScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  worldHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  worldHeaderTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  coveragePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  coverageText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  globeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    padding: 20,
  },
  globeStats: {
    flex: 1,
  },
  globeNum: {
    fontSize: 48,
    fontFamily: "Inter_700Bold",
    lineHeight: 52,
  },
  globeLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  globeSubLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  progressSection: {
    gap: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  recentSection: {
    gap: 12,
  },
  recentScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  countryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  regionCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  regionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  regionName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  regionCount: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  regionTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  regionFill: {
    height: "100%",
    borderRadius: 2,
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  flagItem: {
    fontSize: 20,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 24,
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  studioFooterRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  studioFooterCol: {
    flex: 1,
    minWidth: 0,
  },
  studioContactCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  studioFooterLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  studioCopyright: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
  },
  appVersion: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    letterSpacing: 0.3,
    marginTop: 16,
    marginBottom: 4,
    opacity: 0.7,
  },
  studioContactEmail: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 16,
    textAlign: "right",
  },
  studioContactHint: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
    marginTop: 4,
    textAlign: "right",
  },
});
