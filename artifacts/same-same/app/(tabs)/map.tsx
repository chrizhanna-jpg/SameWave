import React from "react";
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { GlobeAnimation } from "@/components/GlobeAnimation";

const { width } = Dimensions.get("window");

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

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { matchedCountries, getWorldMapCoverage } = useApp();

  const matchedCodes = new Set(matchedCountries.map((c) => c.code));
  const coverage = getWorldMapCoverage();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          World Map
        </Text>
        <View style={[styles.coveragePill, { backgroundColor: colors.primary + "22" }]}>
          <Icon name="globe" size={12} color={colors.primary} />
          <Text style={[styles.coverageText, { color: colors.primary }]}>
            {coverage}% explored
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.globeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <GlobeAnimation size={70} />
          <View style={styles.globeStats}>
            <Text style={[styles.globeNum, { color: colors.primary }]}>
              {matchedCountries.length}
            </Text>
            <Text style={[styles.globeLabel, { color: colors.mutedForeground }]}>
              {matchedCountries.length === 1 ? "country matched" : "countries matched"}
            </Text>
            <Text style={[styles.globeSubLabel, { color: colors.mutedForeground }]}>
              out of 195 countries
            </Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${coverage}%`,
                  backgroundColor: coverage > 50 ? colors.teal : colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            {195 - matchedCountries.length} countries left to discover
          </Text>
        </View>

        {matchedCountries.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Icon name="map" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Your world is empty
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Start swiping to fill in your world map. Every match adds a new country.
            </Text>
          </View>
        ) : (
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
                    { backgroundColor: colors.card, borderColor: colors.primary + "60" },
                  ]}
                >
                  <Text style={styles.countryFlag}>{c.flag}</Text>
                  <Text style={[styles.countryName, { color: colors.foreground }]}>
                    {c.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {ALL_REGIONS.map((region) => {
          const matched = region.countries.filter((c) => matchedCodes.has(c)).length;
          const pct = Math.round((matched / region.countries.length) * 100);
          return (
            <View
              key={region.name}
              style={[styles.regionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.regionHeader}>
                <Text style={[styles.regionName, { color: colors.foreground }]}>
                  {region.name}
                </Text>
                <Text style={[styles.regionCount, { color: colors.mutedForeground }]}>
                  {matched}/{region.countries.length}
                </Text>
              </View>
              <View style={[styles.regionTrack, { backgroundColor: colors.secondary }]}>
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
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
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
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  globeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
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
  emptyState: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
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
  recentSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
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
    borderWidth: 1,
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
});
