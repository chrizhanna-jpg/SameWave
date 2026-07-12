import React, { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { PhotoCard } from "@/components/PhotoCard";
import { tagEmoji, tagLabel } from "@/utils/interests";
import { timeAgo } from "@/utils/timeAgo";
import { pausePreview, togglePreview } from "@/utils/audio";
import { confirmDeleteMyPhoto } from "@/utils/photoModeration";
import { photoCountryDisplay } from "@/utils/photoCountry";
import {
  isAllowedUserOwnPhotoUri,
  myPhotoRowKey,
  resolveMyPhotoFallbackUri,
  resolveMyPhotoThumbnailUri,
} from "@/utils/photoDisplayUri";

export default function MyPhotosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { myPhotos, removeMyPhoto, myCountryCode } = useApp();
  const [removingUri, setRemovingUri] = useState<string | null>(null);

  const displayPhotos = React.useMemo(
    () =>
      myPhotos.filter(
        (p) =>
          isAllowedUserOwnPhotoUri(p.uri) &&
          isAllowedUserOwnPhotoUri(resolveMyPhotoThumbnailUri(p)),
      ),
    [myPhotos],
  );

  const handleRemove = (uri: string) => {
    confirmDeleteMyPhoto(async () => {
      setRemovingUri(uri);
      const ok = await removeMyPhoto(uri);
      setRemovingUri(null);
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(
          ok
            ? "Photo removed."
            : "Could not remove this photo. Sign in and try again.",
        );
        return;
      }
      if (!ok) {
        Alert.alert(
          "Could not remove",
          "Sign in and try again. If the problem continues, email support from My Path → Legal.",
        );
      }
    });
  };

  // Pause any voice-clip preview the user kicked off here when they
  // navigate away, so a previewed clip doesn't keep looping in the
  // background. Lease-aware: if Discover/Match has since taken over
  // the singleton player, this no-ops.
  useFocusEffect(
    useCallback(() => {
      return () => {
        void pausePreview();
      };
    }, []),
  );

  const topPadding = Platform.OS === "web" ? 8 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 24 : insets.bottom + 24;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
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
            My Photos
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {displayPhotos.length}{" "}
            {displayPhotos.length === 1 ? "photo posted" : "photos posted"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {displayPhotos.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Icon name="camera" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No photos yet
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Take today's challenge to post your first photo and start
              receiving waves from around the world.
            </Text>
          </View>
        ) : (
          displayPhotos.map((photo, i) => {
            const hasAudio = !!photo.customAudioUrl;
            const loc = photoCountryDisplay(photo.captureCountryCode);
            const rowKey = myPhotoRowKey(photo, i);
            const thumbUri = resolveMyPhotoThumbnailUri(photo);
            const thumbFallback = resolveMyPhotoFallbackUri(photo);
            const rowStyle = [
              styles.photoRow,
              { backgroundColor: colors.card, borderColor: colors.border },
            ];
            // Tap on the row toggles preview; the mic badge inside PhotoCard
            // is non-interactive so it doesn't swallow the gesture and just
            // mirrors the playing state.
            const inner = (
              <>
                <PhotoCard
                  uri={thumbUri}
                  fallbackUri={thumbFallback}
                  size="md"
                  audioUrl={photo.customAudioUrl}
                  audioInteractive={false}
                  viewerOwnPhoto
                />
                <View style={styles.photoMeta}>
                  <View style={styles.photoMetaTop}>
                    <Text
                      style={[styles.photoTheme, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {photo.theme}
                    </Text>
                    {loc.code ? (
                      <Text
                        style={[
                          styles.photoCountry,
                          { color: colors.mutedForeground },
                        ]}
                        numberOfLines={1}
                      >
                        {loc.flag} {loc.name}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.photoTime, { color: colors.mutedForeground }]}
                  >
                    {timeAgo(new Date(photo.uploadedAt))}
                  </Text>
                  {hasAudio && (
                    <View style={styles.audioHint}>
                      <Icon name="mic" size={12} color={colors.green} />
                      <Text
                        style={[styles.audioHintText, { color: colors.green }]}
                      >
                        Tap to preview your voice
                      </Text>
                    </View>
                  )}
                  {photo.tags && photo.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {photo.tags.slice(0, 4).map((t) => (
                        <View
                          key={t}
                          style={[
                            styles.tagChip,
                            {
                              backgroundColor: colors.teal + "1a",
                              borderColor: colors.teal + "44",
                            },
                          ]}
                        >
                          <Text style={styles.tagEmoji}>{tagEmoji(t)}</Text>
                          <Text
                            style={[styles.tagText, { color: colors.teal }]}
                            numberOfLines={1}
                          >
                            {tagLabel(t)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => handleRemove(photo.uri)}
                    disabled={removingUri === photo.uri}
                    style={[
                      styles.removeBtn,
                      {
                        borderColor: colors.border,
                        opacity: removingUri === photo.uri ? 0.5 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Remove this photo from SameWave"
                  >
                    <Icon
                      name="x"
                      size={14}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.removeBtnText,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {removingUri === photo.uri ? "Removing…" : "Remove photo"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            );
            if (hasAudio) {
              return (
                <TouchableOpacity
                  key={rowKey}
                  style={rowStyle}
                  activeOpacity={0.85}
                  onPress={() => togglePreview(photo.customAudioUrl)}
                  accessibilityRole="button"
                  accessibilityLabel="Preview your voice clip"
                >
                  {inner}
                </TouchableOpacity>
              );
            }
            return (
              <View key={rowKey} style={rowStyle}>
                {inner}
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
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 16,
    gap: 10,
  },
  photoRow: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  photoMeta: { flex: 1, gap: 4 },
  photoMetaTop: { gap: 2 },
  photoCountry: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  photoTheme: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  photoTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  tagEmoji: { fontSize: 10 },
  tagText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  audioHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  audioHintText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  removeBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  emptyCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
    marginTop: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
});
