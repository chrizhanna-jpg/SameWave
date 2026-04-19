import React, { useState, useRef } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  DAILY_CHALLENGES,
  getTodaysChallenge,
  TAG_LIBRARY,
  SUGGESTED_TAGS_BY_THEME,
} from "@/data/samplePhotos";
import { analyzePhoto } from "@/utils/api";

const MAX_TAGS = 4;

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addMyPhoto, myPhotos } = useApp();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const challenge = getTodaysChallenge();
  const [selectedTheme, setSelectedTheme] = useState<string>(challenge.id);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  // Tracks the latest analysis call so older in-flight responses don't
  // overwrite tags for a newer photo pick.
  const analyzeReqIdRef = useRef(0);
  // Resolves when the in-flight analysis completes — used so submit can
  // wait for AI tags instead of dropping them.
  const inFlightAnalysisRef = useRef<Promise<void> | null>(null);
  // Mirror of aiTags so submit() can read the freshest value after awaiting
  // an in-flight analysis (state closures would be stale).
  const aiTagsRef = useRef<string[]>([]);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, id];
    });
  };

  // When the user changes the theme, clear tag selection so they don't
  // accidentally submit tags that no longer fit (e.g. picking "coffee"
  // for "morning", then switching to "pets"). Also collapse the "+ more"
  // expansion so suggestions for the new theme are visible first.
  const changeTheme = (id: string) => {
    if (id === selectedTheme) return;
    setSelectedTheme(id);
    setSelectedTags([]);
    setShowAllTags(false);
  };

  // Suggested tags first (for the active theme), then the rest if expanded.
  const suggestedIds = SUGGESTED_TAGS_BY_THEME[selectedTheme] ?? [];
  const suggestedTags = suggestedIds
    .map((id) => TAG_LIBRARY.find((t) => t.id === id))
    .filter(Boolean) as typeof TAG_LIBRARY;
  const otherTags = TAG_LIBRARY.filter((t) => !suggestedIds.includes(t.id));
  const visibleTags = showAllTags ? [...suggestedTags, ...otherTags] : suggestedTags;

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedPhoto(result.assets[0].uri);
      analyzeSelected(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      pickFromLibrary();
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow access to your camera.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedPhoto(result.assets[0].uri);
      analyzeSelected(result.assets[0]);
    }
  };

  const analyzeSelected = (asset: ImagePicker.ImagePickerAsset) => {
    const reqId = ++analyzeReqIdRef.current;
    aiTagsRef.current = [];
    setAiTags([]);
    setAnalyzing(true);
    const p = (async () => {
      let resultTags: string[] = [];
      try {
        resultTags = await analyzePhoto(
          asset.base64
            ? { imageBase64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" }
            : { imageUrl: asset.uri }
        );
      } catch {
        resultTags = [];
      }
      // Drop stale results (user picked a newer photo while we were waiting).
      if (reqId !== analyzeReqIdRef.current) return;
      aiTagsRef.current = resultTags;
      setAiTags(resultTags);
      setAnalyzing(false);
    })();
    inFlightAnalysisRef.current = p;
    // Once this analysis settles (and is still latest), clear the in-flight ref
    // so submit() doesn't await an old promise.
    p.finally(() => {
      if (reqId === analyzeReqIdRef.current) {
        inFlightAnalysisRef.current = null;
      }
    });
  };

  const submit = async () => {
    if (!selectedPhoto || submitted) return;
    // If AI is still working, wait for it so we don't drop its tags.
    if (inFlightAnalysisRef.current) {
      setSubmitted(true); // visually lock the button immediately
      try {
        await inFlightAnalysisRef.current;
      } catch {
        // ignore — we'll just submit without AI tags
      }
    } else {
      setSubmitted(true);
    }
    // Use the ref so we read the freshest AI tags (state closure is stale
    // after awaiting an in-flight analysis above).
    const merged = Array.from(new Set([...selectedTags, ...aiTagsRef.current]));
    addMyPhoto(selectedPhoto, selectedTheme, merged);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      router.back();
    }, 1500);
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Icon name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Post a Photo
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.challengeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.85}
          onPress={() => setSelectedTheme(challenge.id)}
        >
          <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
          <View style={styles.challengeText}>
            <Text style={[styles.challengeTitle, { color: colors.foreground }]}>
              Today's idea
            </Text>
            <Text style={[styles.challengeName, { color: colors.primary }]}>
              {challenge.title}
            </Text>
            <Text style={[styles.challengeDesc, { color: colors.mutedForeground }]}>
              {challenge.description}
            </Text>
          </View>
        </TouchableOpacity>

        {submitted ? (
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, { backgroundColor: colors.teal + "22" }]}>
              <Icon name="check" size={40} color={colors.teal} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              Photo submitted!
            </Text>
            <Text style={[styles.successDesc, { color: colors.mutedForeground }]}>
              We're finding your match from somewhere in the world...
            </Text>
          </View>
        ) : selectedPhoto ? (
          <View style={styles.selectedContainer}>
            <Image
              source={{ uri: selectedPhoto }}
              style={[styles.selectedImage, { borderColor: colors.border }]}
              resizeMode="cover"
            />

            {(analyzing || aiTags.length > 0) && (
              <View
                style={[
                  styles.aiBanner,
                  {
                    backgroundColor: colors.card,
                    borderColor: analyzing ? colors.border : colors.teal,
                  },
                ]}
              >
                <Text style={[styles.aiBannerLabel, { color: colors.mutedForeground }]}>
                  {analyzing ? "Analyzing your photo…" : "AI spotted"}
                </Text>
                {!analyzing && (
                  <Text style={[styles.aiBannerTags, { color: colors.foreground }]}>
                    {aiTags
                      .map((id) => {
                        const t = TAG_LIBRARY.find((x) => x.id === id);
                        return t ? `${t.emoji} ${t.label}` : id;
                      })
                      .join("  ·  ")}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.themeSection}>
              <Text style={[styles.themeSectionLabel, { color: colors.mutedForeground }]}>
                What's in your photo?
              </Text>
              <View style={styles.themeChips}>
                {DAILY_CHALLENGES.map((c) => {
                  const active = c.id === selectedTheme;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => changeTheme(c.id)}
                      activeOpacity={0.85}
                      style={[
                        styles.themeChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.themeChipEmoji}>{c.emoji}</Text>
                      <Text
                        style={[
                          styles.themeChipLabel,
                          { color: active ? colors.primaryForeground : colors.foreground },
                        ]}
                      >
                        {c.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.themeSection}>
              <View style={styles.tagSectionHeader}>
                <Text style={[styles.themeSectionLabel, { color: colors.mutedForeground }]}>
                  Add details (helps find similar photos)
                </Text>
                <Text style={[styles.tagCount, { color: colors.mutedForeground }]}>
                  {selectedTags.length}/{MAX_TAGS}
                </Text>
              </View>
              <View style={styles.themeChips}>
                {visibleTags.map((t) => {
                  const active = selectedTags.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => toggleTag(t.id)}
                      activeOpacity={0.85}
                      style={[
                        styles.themeChip,
                        {
                          backgroundColor: active ? colors.teal : colors.card,
                          borderColor: active ? colors.teal : colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.themeChipEmoji}>{t.emoji}</Text>
                      <Text
                        style={[
                          styles.themeChipLabel,
                          { color: active ? "#001018" : colors.foreground },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {!showAllTags && otherTags.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setShowAllTags(true)}
                    activeOpacity={0.85}
                    style={[
                      styles.themeChip,
                      { backgroundColor: "transparent", borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.themeChipLabel, { color: colors.mutedForeground }]}>
                      + more
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.retakeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setSelectedPhoto(null)}
              >
                <Icon name="refresh-cw" size={18} color={colors.foreground} />
                <Text style={[styles.retakeBtnText, { color: colors.foreground }]}>
                  Retake
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={submit}
                activeOpacity={0.85}
              >
                <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>
                  Submit & Match
                </Text>
                <Icon name="globe" size={18} color={colors.primaryForeground} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.pickOptions}>
            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: colors.primary }]}
              onPress={takePhoto}
              activeOpacity={0.85}
            >
              <Icon name="camera" size={28} color="#fff" />
              <Text style={[styles.pickBtnText, { color: "#fff" }]}>
                Take a Photo
              </Text>
              <Text style={[styles.pickBtnSub, { color: "rgba(255,255,255,0.7)" }]}>
                Use your camera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
              onPress={pickFromLibrary}
              activeOpacity={0.85}
            >
              <Icon name="image" size={28} color={colors.primary} />
              <Text style={[styles.pickBtnText, { color: colors.foreground }]}>
                Choose from Library
              </Text>
              <Text style={[styles.pickBtnSub, { color: colors.mutedForeground }]}>
                Pick an existing photo
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {myPhotos.length > 0 && !submitted && (
          <View style={styles.prevSection}>
            <Text style={[styles.prevTitle, { color: colors.mutedForeground }]}>
              Your recent photos
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.prevScroll}>
              {myPhotos.slice(0, 8).map((photo, i) => (
                <TouchableOpacity key={i} onPress={() => setSelectedPhoto(photo.uri)}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={[styles.prevPhoto, { borderColor: colors.border }]}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 20,
  },
  challengeCard: {
    flexDirection: "row",
    gap: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  challengeEmoji: {
    fontSize: 36,
  },
  challengeText: {
    flex: 1,
    gap: 2,
  },
  challengeTitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  challengeDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  pickOptions: {
    gap: 12,
  },
  pickBtn: {
    padding: 28,
    borderRadius: 20,
    alignItems: "center",
    gap: 8,
  },
  pickBtnText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  pickBtnSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  selectedContainer: {
    gap: 16,
  },
  selectedImage: {
    width: "100%",
    height: 280,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
  },
  retakeBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  submitBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 26,
  },
  submitBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  successContainer: {
    alignItems: "center",
    gap: 16,
    paddingTop: 32,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  successDesc: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  prevSection: {
    gap: 10,
  },
  prevTitle: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  prevScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  prevPhoto: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
  },
  themeSection: {
    gap: 10,
  },
  themeSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  themeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  themeChipEmoji: {
    fontSize: 14,
  },
  themeChipLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  tagSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagCount: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  aiBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  aiBannerLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  aiBannerTags: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
});
