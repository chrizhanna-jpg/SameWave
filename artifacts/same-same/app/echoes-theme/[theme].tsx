import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { fetchEchoesByTheme, type ThemeEchoPair } from "@/utils/api";

export default function EchoesThemeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    theme?: string;
    title?: string;
    emoji?: string;
  }>();
  const theme = String(params.theme ?? "");
  const title = String(params.title ?? theme);
  const emoji = String(params.emoji ?? "✨");

  const [pairs, setPairs] = useState<ThemeEchoPair[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const result = await fetchEchoesByTheme(theme);
    setPairs(result.pairs);
    setCount(result.count);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const topPadding = Platform.OS === "web" ? 16 : insets.top + 8;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: colors.border }]}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {emoji}  {title}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {count.toLocaleString()} mutual echo{count === 1 ? "" : "es"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : pairs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>🌱</Text>
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            No echoes here yet. Tap same-same on a {title.toLowerCase()} photo
            and start one.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: bottomPadding },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {pairs.map((pair) => (
            <TouchableOpacity
              key={pair.echoId}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: "/echo-pair",
                  params: { a: pair.a.id, b: pair.b.id },
                })
              }
              style={[
                styles.tile,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.tileImages}>
                <Image
                  source={{ uri: thumbUri(pair.a.uri) }}
                  style={styles.tileImage}
                />
                <Image
                  source={{ uri: thumbUri(pair.b.uri) }}
                  style={styles.tileImage}
                />
              </View>
              <View style={styles.tileFlags}>
                <Text style={styles.tileFlag}>{pair.a.countryFlag}</Text>
                <Icon
                  name="arrow-right"
                  size={12}
                  color={colors.mutedForeground}
                />
                <Text style={styles.tileFlag}>{pair.b.countryFlag}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function thumbUri(uri: string) {
  if (uri.startsWith("data:")) return uri;
  if (uri.includes("?")) return uri.replace(/w=\d+/, "w=300");
  return uri + "?w=300";
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  empty: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  emoji: { fontSize: 32 },
  grid: {
    paddingHorizontal: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    gap: 6,
  },
  tileImages: { flexDirection: "row", gap: 4 },
  tileImage: { flex: 1, aspectRatio: 1, borderRadius: 8 },
  tileFlags: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tileFlag: { fontSize: 16 },
});
