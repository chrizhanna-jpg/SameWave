import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AtlasLiveConnections } from "@/components/AtlasLiveConnections";
import { Icon } from "@/components/Icon";
import { OceanShimmer } from "@/components/OceanShimmer";
import { PressableScale } from "@/components/PressableScale";
import { Surface } from "@/components/Surface";
import { useColors } from "@/hooks/useColors";
import { flagFor, nameFor } from "@/data/countries";
import {
  fetchAtlasSummary,
  fetchAtlasCountryPhotos,
  type AtlasConnection,
  type AtlasCountry,
  type AtlasPhoto,
} from "@/utils/api";
import { markTabVisited } from "@/utils/tabVisits";

const ATLAS_REGIONS: Array<{ name: string; emoji: string; countries: string[] }> = [
  {
    name: "Europe",
    emoji: "🌍",
    countries: [
      "GB","IE","FR","DE","IT","ES","PT","NL","BE","LU","CH","AT",
      "SE","NO","DK","FI","IS","PL","CZ","SK","HU","RO","BG","GR",
      "HR","SI","BA","RS","ME","MK","AL","XK","LT","LV","EE","BY",
      "UA","MD","RU","MT","CY",
    ],
  },
  {
    name: "Asia & Middle East",
    emoji: "🌏",
    countries: [
      "CN","JP","KR","KP","IN","TH","VN","ID","PH","MY","SG","BD",
      "PK","NP","LK","MM","KH","LA","MN","TW","HK","BT","MV","TL",
      "BN","AF","IR","IQ","SY","SA","AE","QA","KW","BH","OM","YE",
      "JO","LB","IL","PS","TR","AZ","GE","AM","KZ","UZ","TM","TJ","KG",
    ],
  },
  {
    name: "Africa",
    emoji: "🌍",
    countries: [
      "NG","ZA","KE","ET","GH","TZ","UG","DZ","SD","EG","MA","TN",
      "LY","CM","CI","SN","ML","BF","NE","MW","ZM","ZW","MZ","AO",
      "RW","SO","MG","CD","CG","GA","GN","SL","LR","GW","GM","CV",
      "ST","EH","MR","TG","BJ","GQ","CF","TD","SS","BI","DJ","KM",
      "ER","SC","MU","NA","BW","LS","SZ",
    ],
  },
  {
    name: "Americas",
    emoji: "🌎",
    countries: [
      "US","CA","MX","GT","BZ","SV","HN","NI","CR","PA","CU","DO",
      "HT","JM","BS","BB","TT","LC","VC","GD","AG","DM","KN",
      "BR","AR","CL","CO","PE","VE","EC","BO","PY","UY","GY","SR",
    ],
  },
  {
    name: "Oceania",
    emoji: "🌏",
    countries: [
      "AU","NZ","FJ","PG","SB","VU","WS","TO","KI","FM","PW","MH","NR","TV",
    ],
  },
];

const PHOTO_COLS = 3;
const PHOTO_GAP = 3;

export default function AtlasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [summary, setSummary] = useState<AtlasCountry[]>([]);
  const [connections, setConnections] = useState<AtlasConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const atlasHasLoadedOnceRef = useRef(false);

  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [photoCache, setPhotoCache] = useState<Record<string, AtlasPhoto[]>>({});
  const [photoLoading, setPhotoLoading] = useState<string | null>(null);
  const [collapsedRegions, setCollapsedRegions] = useState<Record<string, boolean>>({});

  const countByCode = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of summary) m[c.code] = c.count;
    return m;
  }, [summary]);

  const totalCountries = summary.length;
  const totalPhotos = useMemo(
    () => summary.reduce((acc, c) => acc + c.count, 0),
    [summary],
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!atlasHasLoadedOnceRef.current) setLoading(true);
    const data = await fetchAtlasSummary();
    setSummary(data.countries);
    setConnections(data.connections);
    atlasHasLoadedOnceRef.current = true;
    setLoading(false);
    setRefreshing(false);
    if (isRefresh) {
      setExpandedCode(null);
      setPhotoCache({});
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      markTabVisited("atlas");
      void load(false);
    }, [load]),
  );

  const handleCountryPress = useCallback(
    async (code: string) => {
      if (expandedCode === code) {
        setExpandedCode(null);
        return;
      }
      setExpandedCode(code);
      if (photoCache[code]) return;
      setPhotoLoading(code);
      const photos = await fetchAtlasCountryPhotos(code);
      setPhotoCache((prev) => ({ ...prev, [code]: photos }));
      setPhotoLoading(null);
    },
    [expandedCode, photoCache],
  );

  const toggleRegion = useCallback((name: string) => {
    setCollapsedRegions((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const outerPad = 20;
  const photoSize = Math.floor(
    (width - outerPad * 2 - PHOTO_GAP * (PHOTO_COLS - 1)) / PHOTO_COLS,
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OceanShimmer />

      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Atlas
        </Text>
        {!loading && (
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {totalCountries === 0 && connections.length === 0
              ? "No photos yet"
              : totalCountries === 0
                ? `${connections.length} live ${connections.length === 1 ? "connection" : "connections"}`
                : `${totalCountries} ${totalCountries === 1 ? "country" : "countries"} · ${totalPhotos} ${totalPhotos === 1 ? "photo" : "photos"}`}
          </Text>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: outerPad, paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primary}
          />
        }
      >
        {!loading && connections.length > 0 ? (
          <AtlasLiveConnections
            width={width - outerPad * 2}
            connections={connections}
          />
        ) : null}
        {loading ? (
          <View style={styles.centreBlock}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.centreText, { color: colors.mutedForeground }]}>
              Finding photos from around the world…
            </Text>
          </View>
        ) : totalCountries === 0 && connections.length === 0 ? (
          <View style={styles.centreBlock}>
            <Icon name="globe" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No photos yet
            </Text>
            <Text style={[styles.centreText, { color: colors.mutedForeground }]}>
              The Atlas fills in as people around the world share moments. Be the
              first to post from your country.
            </Text>
          </View>
        ) : totalCountries === 0 ? (
          <View style={[styles.centreBlock, { paddingTop: 12 }]}>
            <Text style={[styles.centreText, { color: colors.mutedForeground }]}>
              Country photo counts will show here once there are active posts
              with a location. Your ripples and waves still appear above.
            </Text>
          </View>
        ) : (
          ATLAS_REGIONS.map((region) => {
            const activeInRegion = region.countries.filter(
              (c) => (countByCode[c] ?? 0) > 0,
            );
            if (activeInRegion.length === 0) return null;

            const isCollapsed = !!collapsedRegions[region.name];
            const expandedInRegion =
              expandedCode && region.countries.includes(expandedCode)
                ? expandedCode
                : null;

            return (
              <View key={region.name} style={styles.regionBlock}>
                <TouchableOpacity
                  onPress={() => toggleRegion(region.name)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${region.name}, ${activeInRegion.length} ${activeInRegion.length === 1 ? "country" : "countries"}, ${isCollapsed ? "expand" : "collapse"}`}
                  style={styles.regionHeader}
                >
                  <View style={styles.regionLeft}>
                    <Text style={styles.regionEmoji}>{region.emoji}</Text>
                    <Text
                      style={[styles.regionName, { color: colors.foreground }]}
                    >
                      {region.name}
                    </Text>
                    <View
                      style={[
                        styles.regionBadge,
                        { backgroundColor: colors.primary + "22" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.regionBadgeText,
                          { color: colors.primary },
                        ]}
                      >
                        {activeInRegion.length}
                      </Text>
                    </View>
                  </View>
                  <Icon
                    name={isCollapsed ? "chevron-down" : "chevron-up"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>

                {!isCollapsed && (
                  <>
                    <View style={styles.chipRow}>
                      {region.countries.map((code) => {
                        const count = countByCode[code] ?? 0;
                        if (count === 0) return null;
                        const isExpanded = expandedCode === code;
                        return (
                          <PressableScale
                            key={code}
                            haptic="light"
                            onPress={() => void handleCountryPress(code)}
                            style={[
                              styles.chip,
                              {
                                backgroundColor: isExpanded
                                  ? colors.primary + "28"
                                  : colors.card,
                                borderColor: isExpanded
                                  ? colors.primary
                                  : colors.border,
                              },
                            ]}
                            accessibilityLabel={`${nameFor(code) ?? code}, ${count} ${count === 1 ? "photo" : "photos"}`}
                          >
                            <Text style={styles.chipFlag}>{flagFor(code)}</Text>
                            <Text
                              style={[
                                styles.chipName,
                                {
                                  color: isExpanded
                                    ? colors.primary
                                    : colors.foreground,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {nameFor(code) ?? code}
                            </Text>
                            <View
                              style={[
                                styles.chipCount,
                                {
                                  backgroundColor: isExpanded
                                    ? colors.primary
                                    : colors.primary + "33",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.chipCountText,
                                  {
                                    color: isExpanded
                                      ? "#fff"
                                      : colors.primary,
                                  },
                                ]}
                              >
                                {count > 99 ? "99+" : count}
                              </Text>
                            </View>
                          </PressableScale>
                        );
                      })}
                    </View>

                    {expandedInRegion && (
                      <Surface
                        elevation="md"
                        radius="xl"
                        background={colors.cardElevated}
                        style={styles.photoPanel}
                      >
                        <View style={styles.photoPanelHeader}>
                          <Text style={styles.photoPanelFlag}>
                            {flagFor(expandedInRegion)}
                          </Text>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.photoPanelCountry,
                                { color: colors.foreground },
                              ]}
                            >
                              {nameFor(expandedInRegion) ?? expandedInRegion}
                            </Text>
                            <Text
                              style={[
                                styles.photoPanelCount,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              {countByCode[expandedInRegion] ?? 0}{" "}
                              {(countByCode[expandedInRegion] ?? 0) === 1
                                ? "photo"
                                : "photos"}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setExpandedCode(null)}
                            hitSlop={10}
                            accessibilityLabel="Close country grid"
                          >
                            <Icon
                              name="x"
                              size={18}
                              color={colors.mutedForeground}
                            />
                          </TouchableOpacity>
                        </View>

                        {photoLoading === expandedInRegion ? (
                          <View
                            style={[
                              styles.photoLoadingBox,
                              { height: photoSize + 20 },
                            ]}
                          >
                            <ActivityIndicator color={colors.primary} />
                          </View>
                        ) : (photoCache[expandedInRegion] ?? []).length ===
                          0 ? (
                          <View
                            style={[
                              styles.photoLoadingBox,
                              { height: photoSize + 20 },
                            ]}
                          >
                            <Text
                              style={[
                                styles.noPhotosText,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              No photos available right now
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.photoGrid}>
                            {(photoCache[expandedInRegion] ?? []).map(
                              (photo, idx) => (
                                <PressableScale
                                  key={photo.id}
                                  haptic="light"
                                  onPress={() =>
                                    router.push({
                                      pathname: "/photo-viewer",
                                      params: {
                                        uri: photo.uri,
                                        clipUrl:
                                          photo.customAudioUrl ?? "",
                                        country:
                                          nameFor(expandedInRegion) ??
                                          expandedInRegion,
                                        countryFlag: flagFor(expandedInRegion),
                                        vibeLabel: photo.theme ?? "",
                                      },
                                    })
                                  }
                                  style={[
                                    styles.photoCell,
                                    {
                                      width: photoSize,
                                      height: photoSize,
                                      marginRight:
                                        (idx + 1) % PHOTO_COLS !== 0
                                          ? PHOTO_GAP
                                          : 0,
                                      marginBottom: PHOTO_GAP,
                                    },
                                  ]}
                                  accessibilityLabel={`Photo from ${nameFor(expandedInRegion) ?? expandedInRegion}`}
                                >
                                  <Image
                                    source={{ uri: photo.uri }}
                                    style={styles.photoImg}
                                    resizeMode="cover"
                                  />
                                  {photo.theme ? (
                                    <View style={styles.photoThemeTag}>
                                      <Text
                                        style={styles.photoThemeText}
                                        numberOfLines={1}
                                      >
                                        {photo.theme}
                                      </Text>
                                    </View>
                                  ) : null}
                                </PressableScale>
                              ),
                            )}
                          </View>
                        )}
                      </Surface>
                    )}
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
  },

  scroll: { flex: 1 },
  content: { gap: 4 },

  centreBlock: {
    paddingTop: 72,
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
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

  regionBlock: {
    marginBottom: 6,
  },
  regionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  regionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  regionEmoji: { fontSize: 18 },
  regionName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  regionBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  regionBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipFlag: { fontSize: 15 },
  chipName: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    maxWidth: 90,
  },
  chipCount: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  chipCountText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
  },

  photoPanel: {
    marginBottom: 8,
    overflow: "hidden",
  },
  photoPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  photoPanelFlag: { fontSize: 24 },
  photoPanelCountry: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  photoPanelCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 1,
  },

  photoLoadingBox: {
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 14,
  },
  noPhotosText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  photoCell: {
    borderRadius: 8,
    overflow: "hidden",
  },
  photoImg: {
    width: "100%",
    height: "100%",
  },
  photoThemeTag: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  photoThemeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: "#E8F4F8",
    textAlign: "center",
  },
});
