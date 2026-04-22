import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { LoadingGlobe } from "@/components/LoadingGlobe";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  getTodaysChallenge,
  TAG_LIBRARY,
} from "@/data/samplePhotos";
import { analyzePhoto, uploadPhoto } from "@/utils/api";
import { detectPhotoOrigin, type PhotoSource } from "@/utils/photoOrigin";
import {
  MUSIC_LIBRARY,
  pickClipForSeed,
  suggestGenre,
  type MusicGenre,
} from "@/data/musicLibrary";
import { playClip, stop as stopAudio } from "@/utils/audio";

const MAX_TAGS = 4;
const QUICK_THEMES = [
  "morning coffee",
  "street food",
  "sunset hike",
  "extreme sports",
  "rainy commute",
  "pet moment",
  "office lunch",
  "first steps",
  "city lights",
];

function normalizeTheme(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 \-']/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
}

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addMyPhoto, setMyPhotoBackendId, myPhotos, myCountryCode } = useApp();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  // Keep the raw base64 + mime alongside the URI so submit() can ship the
  // bytes to the backend (the local URI isn't reachable from the server).
  const selectedAssetRef = React.useRef<{
    base64: string | null;
    mimeType: string;
  } | null>(null);
  // Set when EXIF inspection flags the picked image as AI-generated. Drives
  // the "AI image" banner, the badge persisted on the photo, and the skip
  // of the backend upload (so AI photos never appear in others' candidate
  // pools and never trigger echo connections).
  const [isAi, setIsAi] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const challenge = getTodaysChallenge();
  const [themeText, setThemeText] = useState<string>("");
  const [themeEdited, setThemeEdited] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiTheme, setAiTheme] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const themeEditedRef = useRef(false);
  // Tracks the latest analysis call so older in-flight responses don't
  // overwrite tags for a newer photo pick.
  const analyzeReqIdRef = useRef(0);
  // Resolves when the in-flight analysis completes — used so submit can
  // wait for AI tags instead of dropping them.
  const inFlightAnalysisRef = useRef<Promise<void> | null>(null);
  // Mirror of aiTags so submit() can read the freshest value after awaiting
  // an in-flight analysis (state closures would be stale).
  const aiTagsRef = useRef<string[]>([]);

  // Music vibe — AI suggests an initial genre based on theme + tags as
  // soon as analysis completes; the user can swap by tapping a chip
  // (which also plays a quick preview of the new clip). `genreEdited`
  // mirrors the theme-edited flag: once the user taps a chip, we stop
  // auto-overwriting their pick when later analysis comes in.
  const [musicGenre, setMusicGenre] = useState<MusicGenre | null>(null);
  const [genreEdited, setGenreEdited] = useState(false);
  const genreEditedRef = useRef(false);
  const musicGenreRef = useRef<MusicGenre | null>(null);
  musicGenreRef.current = musicGenre;

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, id];
    });
  };

  const onThemeChange = (text: string) => {
    setThemeText(text);
    setThemeEdited(true);
    themeEditedRef.current = true;
  };

  const useQuickTheme = (t: string) => {
    setThemeText(t);
    setThemeEdited(true);
    themeEditedRef.current = true;
  };

  // Tag picker: show all tags from the fixed library, ordered with AI-spotted
  // ones first so the user can quickly add or remove any.
  const orderedTags = [
    ...TAG_LIBRARY.filter((t) => aiTags.includes(t.id)),
    ...TAG_LIBRARY.filter((t) => !aiTags.includes(t.id)),
  ];
  const INITIAL_TAGS = 8;
  const visibleTags = showAllTags ? orderedTags : orderedTags.slice(0, INITIAL_TAGS);
  const hiddenCount = orderedTags.length - INITIAL_TAGS;

  const acceptPhoto = (
    asset: ImagePicker.ImagePickerAsset,
    source: PhotoSource,
  ) => {
    const verdict = detectPhotoOrigin(asset, source);
    resetForNewPhoto();
    setIsAi(verdict.looksAi);
    if (verdict.looksAi) {
      // Soft heads-up — not blocking. The submit flow will mark the photo
      // as AI and exclude it from echo connections.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    setSelectedPhoto(asset.uri);
    selectedAssetRef.current = {
      base64: asset.base64 ?? null,
      mimeType: asset.mimeType ?? "image/jpeg",
    };
    analyzeSelected(asset);
    return true;
  };

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
      base64: true,
      exif: true,
    });
    if (!result.canceled && result.assets[0]) {
      acceptPhoto(result.assets[0], "library");
    }
  };

  const resetForNewPhoto = () => {
    setSelectedTags([]);
    setAiTags([]);
    setAiTheme("");
    setThemeText("");
    setThemeEdited(false);
    themeEditedRef.current = false;
    // Reset the music vibe so the next photo gets its own AI suggestion.
    setMusicGenre(null);
    setGenreEdited(false);
    genreEditedRef.current = false;
    void stopAudio();
  };

  // Once AI analysis lands (or when the user types a theme that changes
  // the suggestion), pick a genre — but only if the user hasn't already
  // picked one themselves. This is the "AI suggests first clip" piece.
  useEffect(() => {
    if (genreEditedRef.current) return;
    if (!selectedPhoto) return;
    const themeForSuggestion = themeEditedRef.current
      ? normalizeTheme(themeText)
      : aiTheme;
    if (!themeForSuggestion && aiTags.length === 0) return;
    const g = suggestGenre(themeForSuggestion, aiTags);
    setMusicGenre(g);
  }, [aiTheme, aiTags, themeText, selectedPhoto]);

  // Tear down audio when leaving the screen entirely (back nav, etc).
  useEffect(() => {
    return () => {
      void stopAudio();
    };
  }, []);

  const handleGenreTap = (g: MusicGenre) => {
    setMusicGenre(g);
    setGenreEdited(true);
    genreEditedRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    // Tap = swap + play. Use the photo URI as the seed so the same
    // photo→genre combo always picks the same clip.
    const seed = selectedPhoto ?? "preview";
    const clip = pickClipForSeed(g, seed);
    void playClip(clip.url);
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
      exif: true,
    });
    if (!result.canceled && result.assets[0]) {
      acceptPhoto(result.assets[0], "camera");
    }
  };

  const analyzeSelected = (asset: ImagePicker.ImagePickerAsset) => {
    const reqId = ++analyzeReqIdRef.current;
    aiTagsRef.current = [];
    setAiTags([]);
    setAnalyzing(true);
    const p = (async () => {
      let result: { tags: string[]; theme: string } = { tags: [], theme: "" };
      try {
        result = await analyzePhoto(
          asset.base64
            ? { imageBase64: asset.base64, mimeType: asset.mimeType ?? "image/jpeg" }
            : { imageUrl: asset.uri }
        );
      } catch {
        result = { tags: [], theme: "" };
      }
      // Drop stale results (user picked a newer photo while we were waiting).
      if (reqId !== analyzeReqIdRef.current) return;
      aiTagsRef.current = result.tags;
      setAiTags(result.tags);
      setAiTheme(result.theme);
      // Autofill the theme input only if the user hasn't typed anything yet.
      if (!themeEditedRef.current && result.theme) {
        setThemeText(result.theme);
      }
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
    // If the user typed something, that wins — even an empty clear (which
    // means "no theme"). Otherwise use the AI suggestion, falling back to
    // today's challenge so we always show something meaningful.
    const typed = normalizeTheme(themeText);
    const finalTheme = themeEdited
      ? typed || normalizeTheme(challenge.title)
      : normalizeTheme(aiTheme) || normalizeTheme(challenge.title);
    // Lock in a final genre — user pick wins; otherwise AI suggestion
    // from the just-analysed theme + merged tags. We compute on submit
    // so a brief race (user submits before AI returns) still records
    // a sensible vibe instead of nothing.
    const finalGenre: MusicGenre =
      musicGenreRef.current ?? suggestGenre(finalTheme, merged);
    addMyPhoto(selectedPhoto, finalTheme, merged, isAi, finalGenre);
    // Stop the preview clip — user is leaving the screen.
    void stopAudio();
    // Fire-and-forget upload to the backend so other users can match against
    // this photo. Local-only state stays the source of truth for *this*
    // user's UI; the backend just makes the photo discoverable to others.
    // AI-flagged photos are NOT uploaded — they should never appear in
    // anyone else's candidate pool or generate echo connections.
    const captured = selectedAssetRef.current;
    if (captured?.base64 && !isAi) {
      const localUri = selectedPhoto;
      uploadPhoto({
        imageBase64: captured.base64,
        mimeType: captured.mimeType,
        countryCode: myCountryCode,
        musicGenre: finalGenre,
      })
        .then((res) => {
          // Store the backend ID back onto the local photo record so future
          // votes against this photo can flag it as the voter's side and
          // form echo offers.
          if (res?.id && localUri) setMyPhotoBackendId(localUri, res.id);
        })
        .catch(() => {});
    }
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
          onPress={() => useQuickTheme(challenge.title.toLowerCase())}
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

            {isAi && (
              <View
                style={[
                  styles.aiBanner,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.primary,
                  },
                ]}
              >
                <View style={styles.aiBannerRow}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: colors.primaryForeground, fontSize: 11, fontFamily: "Inter_700Bold" }}>
                      AI
                    </Text>
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={[styles.aiBannerLabel, { color: colors.foreground }]}>
                      Looks AI-generated
                    </Text>
                    <Text style={[styles.aiBannerLabel, { color: colors.mutedForeground, marginTop: 2 }]}>
                      It'll be marked with an AI badge and won't count as an echo connection.
                    </Text>
                  </View>
                </View>
              </View>
            )}

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
                {analyzing ? (
                  <View style={styles.aiBannerRow}>
                    <LoadingGlobe size={28} />
                    <Text
                      style={[
                        styles.aiBannerLabel,
                        { color: colors.mutedForeground, marginLeft: 10 },
                      ]}
                    >
                      Analyzing your photo…
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.aiBannerLabel, { color: colors.mutedForeground }]}>
                      AI spotted
                    </Text>
                    <Text style={[styles.aiBannerTags, { color: colors.foreground }]}>
                      {aiTags
                        .map((id) => {
                          const t = TAG_LIBRARY.find((x) => x.id === id);
                          return t ? `${t.emoji} ${t.label}` : id;
                        })
                        .join("  ·  ")}
                    </Text>
                  </>
                )}
              </View>
            )}

            <View style={styles.themeSection}>
              <View style={styles.tagSectionHeader}>
                <Text style={[styles.themeSectionLabel, { color: colors.mutedForeground }]}>
                  Theme
                </Text>
                {analyzing && (
                  <Text style={[styles.tagCount, { color: colors.mutedForeground }]}>
                    suggesting…
                  </Text>
                )}
                {!analyzing && aiTheme && !themeEdited && (
                  <Text style={[styles.tagCount, { color: colors.teal }]}>
                    AI suggested
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.themeInputWrap,
                  {
                    backgroundColor: colors.card,
                    borderColor:
                      !themeEdited && aiTheme ? colors.teal : colors.border,
                  },
                ]}
              >
                <Icon
                  name="sparkles"
                  size={16}
                  color={!themeEdited && aiTheme ? colors.teal : colors.mutedForeground}
                />
                <TextInput
                  value={themeText}
                  onChangeText={onThemeChange}
                  placeholder={analyzing ? "Looking at your photo…" : "e.g. extreme sports"}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={40}
                  style={[styles.themeInput, { color: colors.foreground }]}
                />
                {themeText.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      setThemeText("");
                      setThemeEdited(true);
                      themeEditedRef.current = true;
                    }}
                    hitSlop={10}
                  >
                    <Icon name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickThemes}
              >
                {QUICK_THEMES.map((t) => {
                  const active = themeText.trim().toLowerCase() === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => useQuickTheme(t)}
                      activeOpacity={0.85}
                      style={[
                        styles.themeChip,
                        {
                          backgroundColor: active ? colors.primary : "transparent",
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.themeChipLabel,
                          {
                            color: active
                              ? colors.primaryForeground
                              : colors.mutedForeground,
                          },
                        ]}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.themeSection}>
              <View style={styles.tagSectionHeader}>
                <Text style={[styles.themeSectionLabel, { color: colors.mutedForeground }]}>
                  Add details (optional)
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
                {!showAllTags && hiddenCount > 0 && (
                  <TouchableOpacity
                    onPress={() => setShowAllTags(true)}
                    activeOpacity={0.85}
                    style={[
                      styles.themeChip,
                      { backgroundColor: "transparent", borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.themeChipLabel, { color: colors.mutedForeground }]}>
                      + {hiddenCount} more
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.themeSection}>
              <View style={styles.tagSectionHeader}>
                <Text style={[styles.themeSectionLabel, { color: colors.mutedForeground }]}>
                  Music vibe
                </Text>
                {musicGenre && (
                  <Text style={[styles.tagCount, { color: colors.mutedForeground }]}>
                    {genreEdited ? "your pick" : "AI pick · tap to swap"}
                  </Text>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.musicChips}
              >
                {MUSIC_LIBRARY.map((g) => {
                  const active = musicGenre === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => handleGenreTap(g.id)}
                      activeOpacity={0.85}
                      style={[
                        styles.musicChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={styles.musicChipEmoji}>{g.emoji}</Text>
                      <Text
                        style={[
                          styles.musicChipLabel,
                          {
                            color: active
                              ? colors.primaryForeground
                              : colors.foreground,
                          },
                        ]}
                      >
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.retakeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  void stopAudio();
                  setSelectedPhoto(null);
                }}
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

            <View style={[styles.authenticNote, { borderColor: colors.border }]}>
              <Icon name="info" size={14} color={colors.mutedForeground} />
              <Text style={[styles.authenticNoteText, { color: colors.mutedForeground }]}>
                AI-generated images are welcome but get an AI badge and don't count as echo connections.
              </Text>
            </View>
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
  authenticNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  authenticNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
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
  aiBannerRow: {
    flexDirection: "row",
    alignItems: "center",
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
  themeInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
  },
  themeInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
  },
  quickThemes: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  musicChips: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
    paddingRight: 12,
  },
  musicChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  musicChipEmoji: {
    fontSize: 16,
  },
  musicChipLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
