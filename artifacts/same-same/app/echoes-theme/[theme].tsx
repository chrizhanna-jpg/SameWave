import React, { useCallback, useEffect, useState } from "react";
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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { MicBadge } from "@/components/MicBadge";
import { useColors } from "@/hooks/useColors";
import { fetchEchoesByTheme, type ThemeEchoPhoto } from "@/utils/api";
import { pausePreview } from "@/utils/audio";

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

  // Pause any voice-clip preview the user kicked off via a mic badge
  // tap when they navigate away. `pausePreview()` is lease-aware and
  // no-ops if some other screen has since taken over playback, so it
  // won't disturb unrelated background audio.
  useFocusEffect(
    useCallback(() => {
      return () => {
        void pausePreview();
      };
    }, []),
  );

  const [photos, setPhotos] = useState<ThemeEchoPhoto[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // `aliveRef` lets both the initial load and pull-to-refresh skip
  // their state writes if the screen has been popped off the stack
  // before the fetch resolved — avoids a "setState on unmounted" warn.
  const aliveRef = React.useRef(true);
  const load = async () => {
    const result = await fetchEchoesByTheme(theme);
    if (!aliveRef.current) return;
    setPhotos(result.photos);
    setCount(result.count);
  };

  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      await load();
      if (aliveRef.current) setLoading(false);
    })();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    if (aliveRef.current) setRefreshing(false);
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
            {count.toLocaleString()} wave{count === 1 ? "" : "s"}
            {photos.length > 0 ? ` · ${photos.length} photos` : ""}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.bigEmoji}>🌱</Text>
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            No waves here yet. Wave on a {title.toLowerCase()} photo and start
            one.
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
          {photos.map((entry) => (
            <TouchableOpacity
              key={`${entry.echoId}:${entry.photo.id}`}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: "/echo-pair",
                  params: { a: entry.photo.id, b: entry.partnerPhotoId },
                })
              }
              style={[
                styles.tile,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.tileImageWrap}>
                <Image
                  source={{ uri: thumbUri(entry.photo.uri) }}
                  style={styles.tileImage}
                />
                {entry.photo.customAudioUrl ? (
                  <View style={styles.tileMicBadge}>
                    <MicBadge
                      audioUrl={entry.photo.customAudioUrl}
                      size="sm"
                    />
                  </View>
                ) : null}
              </View>
              <View style={styles.tileFlagRow}>
                <Text style={styles.tileFlag}>{entry.photo.countryFlag}</Text>
                <Text
                  style={[styles.tileCountry, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {entry.photo.country}
                </Text>
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
  bigEmoji: { fontSize: 32 },
  grid: {
    paddingHorizontal: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "31%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 6,
    gap: 6,
  },
  tileImageWrap: { position: "relative" },
  tileImage: { width: "100%", aspectRatio: 1, borderRadius: 8 },
  tileMicBadge: { position: "absolute", bottom: 6, left: 6 },
  tileFlagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 2,
  },
  tileFlag: { fontSize: 13 },
  tileCountry: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
});
