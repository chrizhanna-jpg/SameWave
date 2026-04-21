import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { fetchPair, type PhotoPairResult } from "@/utils/api";

export default function EchoPairScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const [pair, setPair] = useState<PhotoPairResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!params.a || !params.b) {
        setLoading(false);
        return;
      }
      const result = await fetchPair(String(params.a), String(params.b));
      if (alive) {
        setPair(result);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.a, params.b]);

  const topPadding = Platform.OS === "web" ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Icon name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Echo
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !pair ? (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            This echo isn't available right now.
          </Text>
        </View>
      ) : (
        <View style={[styles.body, { paddingBottom: bottomPadding }]}>
          <Text style={[styles.theme, { color: colors.mutedForeground }]}>
            {pair.a.theme || pair.b.theme || "shared moment"}
          </Text>
          <View style={styles.pairColumn}>
            {/* Neutral country-only labelling: this view is opened both
                from the user's own inbox AND from public Discover theme
                tiles, so we never assert "yours" vs "theirs". The flag +
                country line is enough context. */}
            <PairSide side={pair.a} />
            <View
              style={[
                styles.divider,
                { backgroundColor: colors.border },
              ]}
            />
            <PairSide side={pair.b} />
          </View>
          <Text style={[styles.footer, { color: colors.mutedForeground }]}>
            Two strangers, same vibe.
          </Text>
        </View>
      )}
    </View>
  );
}

function PairSide({ side }: { side: PhotoPairResult["a"] }) {
  const colors = useColors();
  return (
    <View style={styles.side}>
      <Image source={{ uri: side.uri }} style={styles.bigPhoto} />
      <View style={styles.sideMeta}>
        <Text style={styles.flag}>{side.countryFlag}</Text>
        <Text
          style={[styles.country, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {side.country}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 18,
    alignItems: "stretch",
  },
  theme: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  pairColumn: { gap: 14 },
  side: { gap: 10 },
  bigPhoto: { width: "100%", aspectRatio: 1, borderRadius: 18 },
  sideMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
  flag: { fontSize: 26 },
  country: { fontSize: 15, fontFamily: "Inter_700Bold" },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  divider: { height: 1, marginHorizontal: 40 },
  footer: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: "auto",
  },
});
