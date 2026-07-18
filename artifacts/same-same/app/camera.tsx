import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getRipplePhotoPaneMetrics } from "@/constants/ripplePhotoFrame";
import { HorizontalTokenScroll } from "@/components/HorizontalTokenScroll";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ProPaywallModal } from "@/components/ProPaywallModal";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { consumePendingCapture } from "@/utils/captureBus";
import {
  beginCaptureTransition,
  CAPTURE_FAST_MATCH,
  endCaptureTransition,
  recordCaptureTransitionEvent,
  registerCaptureDisplayUri,
  startBackgroundPhotoUpload,
} from "@/utils/captureTransition";
import { requestAtlasRefresh } from "@/utils/atlasHub";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RemotePhotoImage } from "@/components/RemotePhotoImage";
import { Icon } from "@/components/Icon";
import { LoadingGlobe } from "@/components/LoadingGlobe";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp, type MyPhoto } from "@/context/AppContext";
import {
  getTodaysChallenge,
  resolveChallengeThemeId,
  SUGGESTED_TAGS_BY_THEME,
  TAG_LIBRARY,
} from "@/data/samplePhotos";
import { analyzePhoto, reactivateMyPhoto, warmAuthedImageHeaders } from "@/utils/api";
import { prefetchMyPhotoLibrary } from "@/utils/myPhotoPrefetch";
import { detectCountryFromGPS } from "@/utils/gpsCountry";
import {
  detectPhotoOrigin,
  extractCaptureDateIso,
  type PhotoSource,
} from "@/utils/photoOrigin";
import { detectCountryFromPhotoExif } from "@/utils/gpsCountry";
import { photoCountryDisplay } from "@/utils/photoCountry";
import {
  findMyPhotoByUri,
  myPhotoRowKey,
  photoStreamFallbackUri,
  resolveMyPhotoDisplayUri,
  resolveMyPhotoThumbnailUri,
  resolveMyPhotoFallbackUri,
} from "@/utils/photoDisplayUri";
import {
  MUSIC_LIBRARY,
  genreMatchesSearchQuery,
  genreSearchMatchScore,
  pickClipForSeed,
  suggestGenreIfMatch,
  type MusicGenre,
} from "@/data/musicLibrary";
import {
  bestTokenMatchScore,
  tokenMatchesAnyQuery,
} from "@/utils/tokenSearch";
import {
  markUserInteracted,
  pausePreview,
  playClip,
  resetPlaybackMode,
  stop as stopAudio,
  stopIfLease,
  togglePreview,
} from "@/utils/audio";
import { AiGeneratedBadge } from "@/components/AiGeneratedBadge";
import { MicBadge } from "@/components/MicBadge";
import { useProAccess } from "@/hooks/useProAccess";
import { gateProFeature } from "@/lib/proFeatures";
import { rippleCreateCameraHref } from "@/utils/rippleNavigation";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

// Hard cap on recordings: 10s of audio at the AAC preset below lands well
// under our 1MB API budget (typically ~80–120KB) and keeps clips snappy
// in the match feed. We auto-stop at this length so no UI work needed.
const MAX_RECORD_MS = 10_000;

/** Minimum comfortable tap target for theme/vibe chips (nested scroll views). */
const TOKEN_CHIP_HIT_SLOP = { top: 10, bottom: 10, left: 8, right: 8 } as const;

// `audio/m4a` reads natively on both iOS and Android in expo-av. Mime is
// recorded alongside the bytes so the playback `data:` URL works on both.
const RECORDING_MIME = "audio/m4a";

const MAX_TAGS = 4;
/** After this wait we still navigate to Ripple; upload still gets server AI. */
const SUBMIT_ANALYSIS_WAIT_CAP_MS = 5000;
/** Navigate to Ripple immediately after post — no artificial delay. */
const NAV_TO_RIPPLE_MS = CAPTURE_FAST_MATCH ? 0 : 380;
const QUICK_THEMES: { label: string; emoji: string }[] = [
  { label: "morning coffee", emoji: "☕" },
  { label: "morning tea", emoji: "🍵" },
  { label: "breakfast", emoji: "🥐" },
  { label: "lunch", emoji: "🥪" },
  { label: "dinner", emoji: "🍝" },
  { label: "afternoon snack", emoji: "🍪" },
  { label: "takeaway", emoji: "🥡" },
  { label: "grocery run", emoji: "🛒" },
  { label: "street food", emoji: "🍜" },
  { label: "sunset hike", emoji: "🌅" },
  { label: "extreme sports", emoji: "🏂" },
  { label: "rainy commute", emoji: "🌧️" },
  { label: "pet moment", emoji: "🐾" },
  { label: "office lunch", emoji: "🥗" },
  { label: "first steps", emoji: "👶" },
  { label: "city lights", emoji: "🌃" },
  { label: "weekend brunch", emoji: "🥞" },
  { label: "beach day", emoji: "🏖️" },
  { label: "gym session", emoji: "💪" },
  { label: "concert night", emoji: "🎤" },
  { label: "family dinner", emoji: "🍽️" },
  { label: "road trip", emoji: "🚗" },
  { label: "cozy night in", emoji: "🛋️" },
];

type ThemeSuggestion = {
  key: string;
  label: string;
  tagId: string | null;
  emoji: string;
};

const THEME_SUGGESTION_POOL: ThemeSuggestion[] = [
  ...QUICK_THEMES.map(({ label, emoji }) => ({
    key: `quick-${label}`,
    label,
    tagId: null as string | null,
    emoji,
  })),
  ...TAG_LIBRARY.map((t) => ({
    key: `tag-${t.id}`,
    label: t.label,
    tagId: t.id,
    emoji: t.emoji,
  })),
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

/** User picked a chip or edited the theme field — not AI/challenge autofill alone. */
function hasExplicitPostTheme(themeEdited: boolean, themeText: string): boolean {
  return themeEdited && normalizeTheme(themeText).length > 0;
}

/** User tapped a vibe chip or recorded custom audio (search text alone does not count). */
function hasExplicitPostVibe(
  musicGenre: MusicGenre | null,
  customAudioUrl: string | null,
): boolean {
  if (customAudioUrl) return true;
  return musicGenre !== null;
}

function themeSuggestionTerms(s: ThemeSuggestion): string[] {
  return [s.label, s.tagId ?? "", s.emoji];
}

type PostIntent = "challenge" | "interests";

function parsePostIntent(raw: string | string[] | undefined): PostIntent | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "challenge" || v === "interests") return v;
  return null;
}

function PostIntentPrompt({
  intent,
  challenge,
  colors,
}: {
  intent: PostIntent;
  challenge: ReturnType<typeof getTodaysChallenge>;
  colors: ReturnType<typeof useColors>;
}) {
  if (intent === "challenge") {
    return (
      <View
        style={[
          styles.intentPrompt,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        accessibilityRole="text"
        accessibilityLabel={`Today's theme: ${challenge.title}. ${challenge.description}`}
      >
        <Text style={[styles.intentPromptLabel, { color: colors.mutedForeground }]}>
          Today's theme
        </Text>
        <View style={styles.intentPromptTitleRow}>
          <Text style={styles.intentPromptEmoji}>{challenge.emoji}</Text>
          <Text style={[styles.intentPromptTitle, { color: colors.foreground }]}>
            {challenge.title}
          </Text>
        </View>
        <Text style={[styles.intentPromptDesc, { color: colors.mutedForeground }]}>
          {challenge.description}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.intentPrompt,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      accessibilityRole="text"
      accessibilityLabel="Your interests. Share your passion."
    >
      <Text style={[styles.intentPromptLabel, { color: colors.mutedForeground }]}>
        Your interests
      </Text>
      <Text style={[styles.intentPromptTitle, { color: colors.foreground }]}>
        Share your passion.
      </Text>
    </View>
  );
}

/** Local file / content URIs are not fetchable by the API — always send base64. */
async function readImageAsBase64ForAnalyze(
  asset: ImagePicker.ImagePickerAsset,
): Promise<{ imageBase64: string; mimeType: string } | null> {
  const mimeType = asset.mimeType ?? "image/jpeg";
  const fromPicker = asset.base64?.replace(/^data:[^;]+;base64,/, "") ?? "";
  if (fromPicker.length > 0) {
    return { imageBase64: fromPicker, mimeType };
  }
  if (!asset.uri) return null;
  try {
    const imageBase64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!imageBase64 || imageBase64.length === 0) return null;
    return { imageBase64, mimeType };
  } catch {
    return null;
  }
}

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { intent: intentParam } = useLocalSearchParams<{ intent?: string }>();
  const postIntent = parsePostIntent(intentParam);
  const {
    addMyPhoto,
    activateMyPhotoForMatch,
    setMyPhotoBackendId,
    setMyPhotoUploadState,
    myPhotos,
    myCountryCode,
    myVibe,
    reconcileMatchPhotos,
  } = useApp();
  const { proActive } = useProAccess();
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  // Keep the raw base64 + mime alongside the URI so submit() can ship the
  // bytes to the backend (the local URI isn't reachable from the server).
  const selectedAssetRef = React.useRef<{
    base64: string | null;
    mimeType: string;
  } | null>(null);
  // Set when EXIF inspection flags the picked image as AI-generated. Drives
  // the on-photo badge and `isAI` on the local/server photo record.
  const [isAi, setIsAi] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const challenge = getTodaysChallenge();
  const intentSeedAppliedRef = useRef(false);
  const [themeText, setThemeText] = useState<string>("");
  const [themeEdited, setThemeEdited] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiTheme, setAiTheme] = useState<string>("");
  // Free-form concrete subjects from Gemini (apple, sculpture…). Not
  // shown to the user but persisted on the local MyPhoto record so the
  // match screen can pass them into /candidates as `subjects=`. Mirror
  // ref kept in sync so submit() reads the freshest value after the
  // analyzePhoto await.
  const aiSubjectsRef = useRef<string[]>([]);
  /** Same-role as aiTagsRef: theme can update on the analyze tick before React re-renders. */
  const aiThemeRef = useRef("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aiPaywallOpen, setAiPaywallOpen] = useState(false);
  const themeEditedRef = useRef(false);
  const pickedAssetRef = useRef<ImagePicker.ImagePickerAsset | null>(null);
  const captureCountryRef = useRef<string | undefined>(undefined);
  // Real capture time (ISO) for the picked/captured photo — EXIF
  // DateTimeOriginal for library picks, shutter instant for in-app camera.
  // Undefined when the photo carried no capture metadata, in which case the
  // temporal tier falls back to upload/share time + shows the soft note.
  const captureAtRef = useRef<string | undefined>(undefined);
  // Tracks the latest analysis call so older in-flight responses don't
  // overwrite tags for a newer photo pick.
  const analyzeReqIdRef = useRef(0);
  const captureRequestIdRef = useRef<string | null>(null);
  /** Full-resolution local file used for upload — preview may use a smaller URI. */
  const captureFullUriRef = useRef<string | null>(null);
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
  const [vibeSearchText, setVibeSearchText] = useState("");
  const [genreEdited, setGenreEdited] = useState(false);
  const genreEditedRef = useRef(false);
  const musicGenreRef = useRef<MusicGenre | null>(null);
  musicGenreRef.current = musicGenre;
  // The horizontal vibe-chip ScrollView and a per-chip layout map so we
  // can auto-scroll the AI's pick into view (centered when possible).
  // Otherwise the AI might pick a vibe that's off-screen and the user
  // wouldn't realize one is selected at all.
  const themeScrollRef = useRef<ScrollView>(null);
  const musicScrollRef = useRef<ScrollView>(null);
  const postFormScrollRef = useRef<ScrollView>(null);
  const themeSectionRef = useRef<View>(null);
  const photoBlockHeightRef = useRef(0);
  const themeInControlsYRef = useRef(0);
  const themeScrollYRef = useRef(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const chipLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const musicScrollWidthRef = useRef(0);
  // Lease handed back by the audio singleton for the most recent
  // preview clip THIS screen started. The unmount cleanup uses it
  // with stopIfLease() so we only stop audio we actually own — if a
  // newer playClip from a different screen has run since (e.g. the
  // user navigated away and the next screen began its own clip),
  // our lease is stale and the cleanup is a safe no-op.
  const playLeaseRef = useRef<number>(0);

  // ── User-recorded vibe clip ────────────────────────────────────────
  // When `customAudioUrl` is set, the photo will ship its own audio to
  // the match feed instead of falling back to the picked music_genre
  // clip. The base64 + mime are what we POST to the backend; the URL
  // is the local file:// uri kept around so the user can preview their
  // own recording right in the camera screen.
  const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);
  const [customAudioBase64, setCustomAudioBase64] = useState<string | null>(
    null,
  );
  const [recordedDurationMs, setRecordedDurationMs] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgressMs, setRecordingProgressMs] = useState(0);
  const [isPreviewingRecording, setIsPreviewingRecording] = useState(false);
  // Live recording handle. We keep it in a ref so the auto-stop timer can
  // reach it without having to thread it through dependency arrays.
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingStopGuardRef = useRef(false);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const recordTickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const recordAutoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearRecordingTimers = () => {
    if (recordTickIntervalRef.current) {
      clearInterval(recordTickIntervalRef.current);
      recordTickIntervalRef.current = null;
    }
    if (recordAutoStopTimerRef.current) {
      clearTimeout(recordAutoStopTimerRef.current);
      recordAutoStopTimerRef.current = null;
    }
  };

  const teardownPreviewSound = useCallback(async () => {
    const s = previewSoundRef.current;
    previewSoundRef.current = null;
    if (s) {
      try {
        await s.stopAsync();
      } catch {
        /* already stopped */
      }
      try {
        await s.unloadAsync();
      } catch {
        /* already unloaded */
      }
    }
    setIsPreviewingRecording(false);
  }, []);

  const stopRecording = useCallback(async (): Promise<{
    base64: string;
    durationMs: number;
    uri: string;
  } | null> => {
    // Guard against double-fires from the timer + onPressOut racing.
    if (recordingStopGuardRef.current) return null;
    recordingStopGuardRef.current = true;
    clearRecordingTimers();
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    if (!rec) {
      recordingStopGuardRef.current = false;
      return null;
    }
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      /* already stopped */
    }
    let uri: string | null = null;
    let durationMs = 0;
    try {
      uri = rec.getURI();
      const status = await rec.getStatusAsync();
      durationMs =
        status && "durationMillis" in status && status.durationMillis
          ? status.durationMillis
          : 0;
    } catch {
      /* ignore */
    }
    // Restore the audio session so other playback (preview clips) sounds
    // through the speaker normally instead of the earpiece. Routed
    // through the singleton helper so the music player's full playback
    // config (silent-mode, ducking, earpiece routing) is re-asserted —
    // not just the iOS recording flag.
    try {
      await resetPlaybackMode();
    } catch {
      /* best effort */
    }
    if (!uri) {
      recordingStopGuardRef.current = false;
      return null;
    }
    let base64 = "";
    try {
      base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      base64 = "";
    }
    recordingStopGuardRef.current = false;
    if (!base64) return null;
    return { base64, durationMs, uri };
  }, []);

  // Synchronous lock so a fast double-tap can't fire two startRecording
  // calls concurrently between the await points below — without this,
  // both would pass the isRecording check, both would prepareToRecord,
  // and we'd leak a recorder + audio session.
  const startingRef = useRef(false);
  const startRecording = useCallback(async () => {
    if (startingRef.current || isRecording || recordingRef.current) return;
    startingRef.current = true;
    // Tear down any preview playback first — recording while a preview
    // sound is loaded leaves the audio session in an awkward state.
    await teardownPreviewSound();
    void stopAudio();

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone needed",
          "To record your vibe, allow microphone access in Settings.",
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await rec.startAsync();
      recordingRef.current = rec;
      recordingStopGuardRef.current = false;
      setIsRecording(true);
      setRecordingProgressMs(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const startedAt = Date.now();
      recordTickIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        setRecordingProgressMs(Math.min(elapsed, MAX_RECORD_MS));
      }, 100);
      // Auto-stop at the cap so we never overshoot the 1MB upload limit.
      recordAutoStopTimerRef.current = setTimeout(() => {
        void finishRecording();
      }, MAX_RECORD_MS);
    } catch {
      Alert.alert(
        "Couldn't start recording",
        "Please try again — if it keeps happening, check the app's microphone permission.",
      );
      recordingRef.current = null;
      setIsRecording(false);
    } finally {
      startingRef.current = false;
    }
  }, [isRecording, teardownPreviewSound]);

  const finishRecording = useCallback(async () => {
    const result = await stopRecording();
    if (!result) return;
    setCustomAudioBase64(result.base64);
    setCustomAudioUrl(result.uri);
    setRecordedDurationMs(result.durationMs);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  }, [stopRecording]);

  const cancelRecording = useCallback(async () => {
    await stopRecording();
    setRecordingProgressMs(0);
  }, [stopRecording]);

  const clearRecording = useCallback(async () => {
    await teardownPreviewSound();
    setCustomAudioBase64(null);
    setCustomAudioUrl(null);
    setRecordedDurationMs(0);
    Haptics.selectionAsync().catch(() => {});
  }, [teardownPreviewSound]);

  const togglePreviewRecording = useCallback(async () => {
    if (!customAudioUrl) return;
    if (isPreviewingRecording) {
      await teardownPreviewSound();
      return;
    }
    // Stop any music-vibe preview so we don't have two sounds at once.
    void stopAudio();
    try {
      await resetPlaybackMode();
      const { sound } = await Audio.Sound.createAsync(
        { uri: customAudioUrl },
        { shouldPlay: true },
      );
      previewSoundRef.current = sound;
      setIsPreviewingRecording(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (
          status.isLoaded &&
          (status.didJustFinish || (!status.isPlaying && status.positionMillis > 0))
        ) {
          if (status.didJustFinish) {
            void teardownPreviewSound();
          }
        }
      });
    } catch {
      setIsPreviewingRecording(false);
    }
  }, [customAudioUrl, isPreviewingRecording, teardownPreviewSound]);

  const formatMs = (ms: number) => {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const onThemeChange = (text: string) => {
    setThemeText(text);
    setThemeEdited(true);
    themeEditedRef.current = true;
  };

  const applyThemeSuggestion = (s: ThemeSuggestion) => {
    setThemeText(s.label);
    setThemeEdited(true);
    themeEditedRef.current = true;
    if (s.tagId) {
      setSelectedTags((prev) => {
        if (prev.includes(s.tagId!)) return prev;
        if (prev.length >= MAX_TAGS) return prev;
        return [...prev, s.tagId!];
      });
    }
  };

  const filteredThemeSuggestions = useMemo(() => {
    const q = themeText.trim().toLowerCase();
    const aiFirst = [
      ...THEME_SUGGESTION_POOL.filter(
        (s) => s.tagId && aiTags.includes(s.tagId),
      ),
      ...THEME_SUGGESTION_POOL.filter(
        (s) => !s.tagId || !aiTags.includes(s.tagId),
      ),
    ];
    if (!q) return aiFirst;
    const matched = aiFirst.filter((s) =>
      tokenMatchesAnyQuery(q, themeSuggestionTerms(s)),
    );
    return matched.sort(
      (a, b) =>
        bestTokenMatchScore(q, themeSuggestionTerms(b)) -
        bestTokenMatchScore(q, themeSuggestionTerms(a)),
    );
  }, [themeText, aiTags]);

  const filteredVibeSuggestions = useMemo(() => {
    const q = vibeSearchText.trim().toLowerCase();
    const pool = q
      ? MUSIC_LIBRARY.filter((g) => genreMatchesSearchQuery(g, q)).sort(
          (a, b) => genreSearchMatchScore(b, q) - genreSearchMatchScore(a, q),
        )
      : MUSIC_LIBRARY;
    if (!musicGenre) return pool;
    const selected = pool.find((g) => g.id === musicGenre);
    const rest = pool.filter((g) => g.id !== musicGenre);
    return selected ? [selected, ...rest] : pool;
  }, [vibeSearchText, musicGenre]);

  useEffect(() => {
    themeScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [themeText]);

  useEffect(() => {
    musicScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [vibeSearchText]);

  const onVibeSearchChange = (text: string) => {
    setVibeSearchText(text);
    setGenreEdited(true);
    genreEditedRef.current = true;
    const active = musicGenre
      ? MUSIC_LIBRARY.find((g) => g.id === musicGenre)
      : null;
    if (active && text.trim().toLowerCase() !== active.label.toLowerCase()) {
      setMusicGenre(null);
    }
  };

  const acceptPhoto = (
    asset: ImagePicker.ImagePickerAsset,
    source: PhotoSource,
    captureCountryCode?: string,
    displayUri?: string,
    fullUri?: string,
  ) => {
    const verdict = detectPhotoOrigin(asset, source);
    resetForNewPhoto();
    captureCountryRef.current = captureCountryCode;
    captureAtRef.current = extractCaptureDateIso(asset, source);
    setIsAi(verdict.looksAi);
    if (verdict.looksAi) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    const uploadUri = fullUri?.trim() || asset.uri;
    const paintUri = displayUri?.trim() || uploadUri;
    captureFullUriRef.current = uploadUri;
    if (paintUri) {
      registerCaptureDisplayUri(paintUri, captureRequestIdRef.current ?? "camera-preview");
    }
    setSelectedPhoto(paintUri);
    pickedAssetRef.current = asset;
    selectedAssetRef.current = {
      base64: asset.base64 ?? null,
      mimeType: asset.mimeType ?? "image/jpeg",
    };
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
      const asset = result.assets[0];
      const fromExif = await detectCountryFromPhotoExif(
        asset.exif as Record<string, unknown> | null | undefined,
      );
      acceptPhoto(asset, "library", fromExif?.code);
    }
  };

  const selectRecentPhoto = (photo: MyPhoto) => {
    const displayUri = resolveMyPhotoDisplayUri(photo);
    const canonicalUri = photo.uri?.trim() || displayUri;
    setSelectedPhoto(canonicalUri);
    pickedAssetRef.current = null;
    selectedAssetRef.current = null;
    const theme = normalizeTheme(photo.theme);
    if (theme) {
      setThemeText(theme);
      setThemeEdited(true);
      themeEditedRef.current = true;
    }
    if (photo.tags && photo.tags.length > 0) {
      setSelectedTags(photo.tags);
    }
    if (photo.musicGenre) {
      setMusicGenre(photo.musicGenre as MusicGenre);
      setGenreEdited(true);
      genreEditedRef.current = true;
      const meta = MUSIC_LIBRARY.find((g) => g.id === photo.musicGenre);
      if (meta) setVibeSearchText(meta.label);
    }
    if (photo.customAudioUrl) {
      setCustomAudioUrl(photo.customAudioUrl);
    }
    setIsAi(photo.isAI === true);
    captureCountryRef.current = photo.captureCountryCode;
    captureAtRef.current = photo.capturedAt;
  };

  const applyPostIntentSeed = useCallback(() => {
    if (!postIntent) return;
    if (postIntent === "challenge") {
      setThemeText(challenge.title);
      setThemeEdited(true);
      themeEditedRef.current = true;
      const suggested = SUGGESTED_TAGS_BY_THEME[challenge.id];
      if (suggested?.length) {
        setSelectedTags(suggested.slice(0, MAX_TAGS));
      }
    } else {
      setThemeText("passions");
      setThemeEdited(true);
      themeEditedRef.current = true;
      if (myVibe.length > 0) {
        setSelectedTags(myVibe.slice(0, MAX_TAGS));
      }
    }
  }, [postIntent, challenge.id, challenge.title, myVibe]);

  const resetForNewPhoto = () => {
    pickedAssetRef.current = null;
    captureAtRef.current = undefined;
    setSelectedTags([]);
    setAiTags([]);
    aiThemeRef.current = "";
    setAiTheme("");
    setThemeText("");
    setThemeEdited(false);
    themeEditedRef.current = false;
    // Reset the music vibe so the next photo gets its own AI suggestion.
    setMusicGenre(null);
    setVibeSearchText("");
    setGenreEdited(false);
    genreEditedRef.current = false;
    void stopAudio();
    // Drop any vibe recording from the previous photo so each upload
    // starts with a clean slate. Best-effort — the user can always
    // re-record before submitting.
    void teardownPreviewSound();
    if (recordingRef.current) void cancelRecording();
    setCustomAudioBase64(null);
    setCustomAudioUrl(null);
    setRecordedDurationMs(0);
    setRecordingProgressMs(0);
    if (postIntent) applyPostIntentSeed();
  };

  // Whenever the AI's pick changes (and the user hasn't manually
  // overridden) auto-scroll the chip ScrollView so the highlighted
  // vibe is centered. Otherwise an off-screen pick can read as "no
  // vibe selected" until the user happens to swipe the row.
  useEffect(() => {
    if (genreEdited) return;
    if (!musicGenre) return;
    // Layout pass may not have run yet on first frame; retry briefly
    // until the chip's geometry is known. This stays cheap (one frame
    // delay in the common case, ~3 frames worst case).
    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const layout = chipLayoutsRef.current[musicGenre];
      const viewport = musicScrollWidthRef.current;
      if (!layout || viewport === 0) {
        if (attempts++ < 8) {
          setTimeout(tryScroll, 32);
        }
        return;
      }
      const target = Math.max(0, layout.x - viewport / 2 + layout.width / 2);
      musicScrollRef.current?.scrollTo({ x: target, animated: true });
    };
    tryScroll();
    return () => {
      cancelled = true;
    };
  }, [musicGenre, genreEdited]);

  useEffect(() => {
    if (genreEdited) return;
    if (!musicGenre) {
      setVibeSearchText("");
      return;
    }
    const meta = MUSIC_LIBRARY.find((g) => g.id === musicGenre);
    if (meta) setVibeSearchText(meta.label);
  }, [musicGenre, genreEdited]);

  // Tear down audio when leaving the screen entirely (back nav, etc).
  // stopIfLease is critical here — if the user has already started
  // navigating to a tab whose audio effect has fired and called
  // playClip, a blanket stopAudio() would race-kill that brand-new
  // playback. We only stop the singleton if our last lease is still
  // the active one (i.e. nobody else has called playClip since).
  useEffect(() => {
    return () => {
      void stopIfLease(playLeaseRef.current);
      // Make sure no recording or preview keeps the mic / audio
      // session locked after the screen unmounts.
      clearRecordingTimers();
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (rec) {
        void rec.stopAndUnloadAsync().catch(() => {});
      }
      const s = previewSoundRef.current;
      previewSoundRef.current = null;
      if (s) {
        void s.unloadAsync().catch(() => {});
      }
      // Reset the iOS audio session back to playback-only — without
      // this, allowsRecordingIOS=true persists across screens and the
      // match feed routes through the earpiece instead of the speaker.
      // Routed through the singleton so the music player's full
      // playback config (silent-mode, ducking, earpiece) is restored.
      void resetPlaybackMode().catch(() => {});
    };
  }, []);

  const handleGenreTap = (g: MusicGenre) => {
    // Tapping a vibe chip is an explicit consent to play audio — open
    // the cold-start gate so the preview clip actually sounds.
    markUserInteracted();
    const meta = MUSIC_LIBRARY.find((x) => x.id === g);
    setMusicGenre(g);
    setVibeSearchText(meta?.label ?? g);
    setGenreEdited(true);
    genreEditedRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    // Tap = swap + play. Use the photo URI as the seed so the same
    // photo→genre combo always picks the same clip.
    const seed = selectedPhoto ?? "preview";
    const clip = pickClipForSeed(g, seed);
    playLeaseRef.current = playClip(clip.url);
  };

  useEffect(() => {
    if (!postIntent || intentSeedAppliedRef.current) return;
    intentSeedAppliedRef.current = true;
    applyPostIntentSeed();
  }, [postIntent, applyPostIntentSeed]);

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      // Web doesn't get the in-app camera (no expo-camera support);
      // fall back to the system file picker, which on browsers offers
      // both library and webcam capture.
      pickFromLibrary();
      return;
    }
    // Open the in-app square-viewfinder camera. It pushes the captured
    // photo onto the captureBus and pops back; useFocusEffect below
    // picks it up the next time this screen regains focus.
    router.push(
      postIntent ? `/in-camera?intent=${postIntent}` : rippleCreateCameraHref(),
    );
  };

  // Drain anything the in-app camera left for us when we regain focus
  // (i.e. after /in-camera pops back). We synthesise a minimal
  // ImagePicker-shaped asset so the existing acceptPhoto pipeline
  // (origin detection, AI heuristics, analysis) still applies — the
  // photo went through our own camera so it can never be AI-generated,
  // but the rest of the flow is identical to the library path.
  //
  // The blur cleanup also pauses any voice-clip preview the user
  // started by tapping a recent-photo mic badge, so a previewed clip
  // doesn't keep looping in the background after the user taps a tab
  // or navigates away. `pausePreview()` is lease-aware: if Discover
  // or Match has since taken over playback, this no-ops.
  useFocusEffect(
    useCallback(() => {
      warmAuthedImageHeaders();
      reconcileMatchPhotos();
      prefetchMyPhotoLibrary(myPhotos, 8);
      const cap = consumePendingCapture();
      if (cap) {
        captureRequestIdRef.current = cap.requestId;
        beginCaptureTransition(cap.requestId);
        registerCaptureDisplayUri(cap.thumbnailUri ?? cap.uri, cap.requestId);
        const asset: ImagePicker.ImagePickerAsset = {
          uri: cap.uri,
          base64: cap.base64 ?? null,
          mimeType: cap.mimeType,
          width: 0,
          height: 0,
          type: "image",
          fileName: null,
          fileSize: undefined,
          exif: null,
          assetId: null,
          duration: null,
        } as unknown as ImagePicker.ImagePickerAsset;
        acceptPhoto(
          asset,
          "camera",
          cap.captureCountryCode,
          cap.thumbnailUri ?? cap.uri,
          cap.uri,
        );
        captureAtRef.current = cap.capturedAt;
        if (!cap.captureCountryCode) {
          void detectCountryFromGPS().then((detected) => {
            if (detected?.code) captureCountryRef.current = detected.code;
          });
        }
      }
      return () => {
        void pausePreview();
        endCaptureTransition();
      };
    }, [myPhotos, reconcileMatchPhotos]),
  );

  const runAiSuggestions = () => {
    const asset = pickedAssetRef.current;
    if (!asset || analyzing) return;
    analyzeSelected(asset);
  };

  const handleSuggestPress = () => {
    if (!pickedAssetRef.current) {
      Alert.alert(
        "Photo not ready",
        "Pick a photo first, then tap AI suggest.",
      );
      return;
    }
    if (!gateProFeature("AI suggest")) return;
    if (!proActive) {
      setAiPaywallOpen(true);
      return;
    }
    runAiSuggestions();
  };

  const analyzeSelected = (asset: ImagePicker.ImagePickerAsset) => {
    const reqId = ++analyzeReqIdRef.current;
    aiTagsRef.current = [];
    setAiTags([]);
    aiSubjectsRef.current = [];
    setAnalyzing(true);
    const p = (async () => {
      let result: { tags: string[]; theme: string; subjects: string[] } = {
        tags: [],
        theme: "",
        subjects: [],
      };
      const payload = await readImageAsBase64ForAnalyze(asset);
      if (!payload) {
        if (reqId === analyzeReqIdRef.current) {
          setAnalyzing(false);
          Alert.alert(
            "Couldn't read the photo",
            "SameWave needs image data to suggest theme and vibe. Try capturing again or re-pick from your library.",
          );
        }
        return;
      }
      try {
        const r = await analyzePhoto(payload);
        // analyzePhoto returns shapes too — we don't surface them in
        // the camera UI, but subjects are pulled out so submit() can
        // forward them into addMyPhoto.
        result = { tags: r.tags, theme: r.theme, subjects: r.subjects };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Couldn't analyze this photo.";
        if (reqId === analyzeReqIdRef.current) {
          Alert.alert("Photo insights unavailable", msg);
        }
        result = { tags: [], theme: "", subjects: [] };
      }
      // Drop stale results (user picked a newer photo while we were waiting).
      if (reqId !== analyzeReqIdRef.current) return;
      aiTagsRef.current = result.tags;
      aiSubjectsRef.current = result.subjects;
      aiThemeRef.current = result.theme;
      setAiTags(result.tags);
      if (result.tags.length > 0) {
        setSelectedTags((prev) =>
          Array.from(new Set([...prev, ...result.tags])).slice(0, MAX_TAGS),
        );
      }
      setAiTheme(result.theme);
      // Autofill the theme input only if the user hasn't typed anything yet.
      if (!themeEditedRef.current && result.theme) {
        setThemeText(result.theme);
      }
      if (!genreEditedRef.current) {
        const merged = Array.from(
          new Set([...selectedTags, ...result.tags]),
        ).slice(0, MAX_TAGS);
        const themeForVibe = themeEditedRef.current
          ? normalizeTheme(themeText)
          : result.theme;
        const g = suggestGenreIfMatch(themeForVibe, merged);
        if (g) {
          setMusicGenre(g);
          const meta = MUSIC_LIBRARY.find((x) => x.id === g);
          setVibeSearchText(meta?.label ?? g);
        }
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
    if (
      !hasExplicitPostTheme(themeEditedRef.current, themeText) ||
      !hasExplicitPostVibe(musicGenreRef.current, customAudioUrl)
    ) {
      return;
    }
    // Fast match: never block navigation on Gemini — upload merges server AI later.
    if (inFlightAnalysisRef.current && !CAPTURE_FAST_MATCH) {
      setSubmitted(true);
      let capTimer: ReturnType<typeof setTimeout> | undefined;
      const cap = new Promise<void>((resolve) => {
        capTimer = setTimeout(resolve, SUBMIT_ANALYSIS_WAIT_CAP_MS);
      });
      try {
        await Promise.race([inFlightAnalysisRef.current, cap]);
      } catch {
        /* ignore */
      } finally {
        if (capTimer) clearTimeout(capTimer);
      }
    } else {
      setSubmitted(true);
    }
    // Use the ref so we read the freshest AI tags (state closure is stale
    // after awaiting an in-flight analysis above).
    const merged = Array.from(new Set([...selectedTags, ...aiTagsRef.current]));
    const normalized = normalizeTheme(themeText);
    const finalTheme = resolveChallengeThemeId(normalized) || normalized;
    if (!finalTheme) return;
    // Chip-selected library vibe only — typed search text does not assign music.
    const finalGenre: MusicGenre | undefined = musicGenreRef.current ?? undefined;
    // Snapshot the recorded clip too — addMyPhoto stores the local URL so
    // the user can preview their own vibe from "My photos", and uploadPhoto
    // ships the base64 to the backend so others hear it on match.
    const recordedBase64 = customAudioBase64;
    const recordedUrl = customAudioUrl;
    const localUri = captureFullUriRef.current ?? selectedPhoto;
    const existing = findMyPhotoByUri(myPhotos, localUri);

    if (existing?.backendId) {
      // Reuse a photo that already reached the server — no duplicate row.
      activateMyPhotoForMatch(localUri, {
        theme: finalTheme,
        tags: merged,
        musicGenre: finalGenre,
        customAudioUrl: recordedUrl ?? undefined,
        subjects: aiSubjectsRef.current,
      });
      void reactivateMyPhoto(existing.backendId, {
        theme: finalTheme,
        tags: merged,
        musicGenre: finalGenre,
        countryCode: myCountryCode,
      })
        .then((res) => {
          if (res?.id && localUri) {
            setMyPhotoBackendId(localUri, {
              backendId: res.id,
              subjects: res.subjects,
              theme: res.theme,
              tags: res.tags,
              musicGenre: res.musicGenre,
            });
            requestAtlasRefresh();
          }
        })
        .catch(() => {});
    } else {
      // Geo-tier policy: prefer the real capture-time GPS country, but
      // when it's unavailable (permission denied, no EXIF, web preview)
      // fall back to the user's declared home country so the match still
      // reaches the Same Country / Same Continent tiers instead of
      // collapsing to "Same Planet". The pure GPS value is still sent to
      // the server below so the stored capture_country_code stays honest.
      const homeFallbackCc =
        typeof myCountryCode === "string" && myCountryCode.length === 2
          ? myCountryCode.toUpperCase()
          : undefined;
      const uploadLocalId = addMyPhoto(
        localUri,
        finalTheme,
        merged,
        isAi,
        finalGenre,
        recordedUrl ?? undefined,
        aiSubjectsRef.current,
        captureCountryRef.current ?? homeFallbackCc,
        myCountryCode,
        captureAtRef.current,
      );
      const uploadRequestId =
        captureRequestIdRef.current ?? `submit-${Date.now()}`;
      startBackgroundPhotoUpload(
        {
          requestId: uploadRequestId,
          localUri,
          localId: uploadLocalId,
          theme: finalTheme,
          tags: merged,
          musicGenre: finalGenre,
          captureCountryCode: captureCountryRef.current ?? homeFallbackCc,
          capturedAt: captureAtRef.current,
          myCountryCode,
          subjects: aiSubjectsRef.current,
          customAudioBase64: recordedBase64 ?? undefined,
          customAudioMime: recordedBase64 ? RECORDING_MIME : undefined,
        },
        {
          setMyPhotoBackendId,
          setMyPhotoUploadState,
          requestAtlasRefresh,
        },
      );
    }

    // Stop the preview clip — user is leaving the screen.
    void stopAudio();
    void teardownPreviewSound();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    recordCaptureTransitionEvent("navigate.to.match.start");
    const goMatch = () => {
      router.replace("/(tabs)/match");
      recordCaptureTransitionEvent("navigate.to.match.complete");
      endCaptureTransition();
    };
    if (NAV_TO_RIPPLE_MS > 0) {
      setTimeout(goMatch, NAV_TO_RIPPLE_MS);
    } else {
      goMatch();
    }
  };

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;
  const ripplePhotoFrame = useMemo(
    () => getRipplePhotoPaneMetrics({ top: insets.top, bottom: insets.bottom }),
    [insets.top, insets.bottom],
  );

  const syncThemeScrollOffset = useCallback(() => {
    themeScrollYRef.current =
      photoBlockHeightRef.current + 6 + themeInControlsYRef.current;
  }, []);

  const hasExplicitTheme = hasExplicitPostTheme(themeEdited, themeText);
  const hasExplicitVibe = hasExplicitPostVibe(musicGenre, customAudioUrl);
  const canSubmitPost = hasExplicitTheme && hasExplicitVibe;

  const submitHint = !canSubmitPost
    ? !hasExplicitTheme && !hasExplicitVibe
      ? "Pick a theme and vibe to submit"
      : !hasExplicitTheme
        ? "Pick a theme to submit"
        : "Tap a vibe chip or record audio to submit"
    : null;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!keyboardOpen) return;
    const t = setTimeout(() => {
      syncThemeScrollOffset();
      postFormScrollRef.current?.scrollTo({
        y: Math.max(0, themeScrollYRef.current - 12),
        animated: true,
      });
    }, Platform.OS === "ios" ? 80 : 200);
    return () => clearTimeout(t);
  }, [keyboardOpen, syncThemeScrollOffset]);

  const scrollPostFormInputIntoView = useCallback(() => {
    syncThemeScrollOffset();
    const delay = Platform.OS === "ios" ? 150 : 300;
    setTimeout(() => {
      postFormScrollRef.current?.scrollTo({
        y: Math.max(0, themeScrollYRef.current - 12),
        animated: true,
      });
    }, delay);
  }, [syncThemeScrollOffset]);

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

      {postIntent && !submitted ? (
        <View style={styles.intentPromptWrap}>
          <PostIntentPrompt
            intent={postIntent}
            challenge={challenge}
            colors={colors}
          />
        </View>
      ) : null}

      {submitted ? (
        <View
          style={[
            styles.successContainer,
            { paddingBottom: bottomPadding + 24, flex: 1 },
          ]}
        >
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
          <KeyboardAwareScrollViewCompat
            ref={postFormScrollRef}
            style={styles.postFormScroll}
            contentContainerStyle={[
              styles.postFormScrollContent,
              {
                paddingHorizontal: 20,
                paddingBottom: bottomPadding + 24,
              },
            ]}
            bottomOffset={bottomPadding + 12}
            extraKeyboardSpace={72}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.photoPreviewShell,
                keyboardOpen ? styles.photoPreviewShellCompact : null,
                {
                  width: ripplePhotoFrame.width,
                  ...(keyboardOpen
                    ? { height: 96 }
                    : { aspectRatio: ripplePhotoFrame.aspectRatio }),
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
              onLayout={(e) => {
                photoBlockHeightRef.current = e.nativeEvent.layout.height;
                syncThemeScrollOffset();
              }}
            >
              <RemotePhotoImage
                uri={selectedPhoto}
                style={styles.photoPreviewImage}
                resizeMode="cover"
                transitionMs={0}
                recyclingKey={selectedPhoto}
              />
              {isAi ? <AiGeneratedBadge size="lg" /> : null}
            </View>

            <View style={styles.postFormControls}>
          {isAi && (
            <Text
              style={[styles.aiInlineNote, { color: colors.mutedForeground }]}
              numberOfLines={2}
            >
              AI-generated image — labeled in the top corner. You can still Ripple and make Waves.
            </Text>
          )}

          <View
            ref={themeSectionRef}
            collapsable={false}
            style={styles.themeSection}
            onLayout={(e) => {
              themeInControlsYRef.current = e.nativeEvent.layout.y;
              syncThemeScrollOffset();
            }}
          >
            <View style={styles.tagSectionHeader}>
              <Text style={[styles.sectionHeading, { color: colors.teal }]}>
                Theme
              </Text>
              {!analyzing && aiTheme && !themeEdited && (
                <Text style={[styles.tagCount, { color: colors.teal }]}>
                  AI suggested
                </Text>
              )}
            </View>

            {filteredThemeSuggestions.length > 0 && (
              <HorizontalTokenScroll ref={themeScrollRef}>
                {filteredThemeSuggestions.map((s) => {
                  const active =
                    themeText.trim().toLowerCase() === s.label.toLowerCase() ||
                    (s.tagId != null && selectedTags.includes(s.tagId));
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => applyThemeSuggestion(s)}
                      hitSlop={TOKEN_CHIP_HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [
                        styles.tokenChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                          opacity: pressed ? 0.88 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.tokenChipEmoji}>{s.emoji}</Text>
                      <Text
                        style={[
                          styles.tokenChipLabel,
                          {
                            color: active
                              ? colors.primaryForeground
                              : colors.foreground,
                          },
                        ]}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </HorizontalTokenScroll>
            )}

            <View
              style={[
                styles.customInputRow,
                {
                  backgroundColor: colors.card,
                  borderColor:
                    !themeEdited && aiTheme ? colors.teal : colors.border,
                },
              ]}
            >
              <TextInput
                value={themeText}
                onChangeText={onThemeChange}
                onFocus={scrollPostFormInputIntoView}
                placeholder="Type your own theme"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={40}
                style={[styles.customInputText, { color: colors.foreground }]}
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
          </View>

          <View style={styles.vibeSection}>
            <Text style={[styles.sectionHeading, { color: colors.teal }]}>
              Vibe
            </Text>

            {filteredVibeSuggestions.length > 0 && (
              <HorizontalTokenScroll
                ref={musicScrollRef}
                onViewportLayout={(w) => {
                  musicScrollWidthRef.current = w;
                }}
                style={{
                  opacity: customAudioUrl ? 0.45 : 1,
                }}
              >
                {filteredVibeSuggestions.map((g) => {
                  const active = musicGenre === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => handleGenreTap(g.id)}
                      disabled={!!customAudioUrl}
                      hitSlop={TOKEN_CHIP_HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: !!customAudioUrl }}
                      onLayout={(e) => {
                        const { x, width } = e.nativeEvent.layout;
                        chipLayoutsRef.current[g.id] = { x, width };
                      }}
                      style={({ pressed }) => [
                        styles.tokenChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                          opacity: customAudioUrl ? 0.5 : pressed ? 0.88 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.tokenChipEmoji}>{g.emoji}</Text>
                      <Text
                        style={[
                          styles.tokenChipLabel,
                          {
                            color: active
                              ? colors.primaryForeground
                              : colors.foreground,
                          },
                        ]}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </HorizontalTokenScroll>
            )}

            {Platform.OS !== "web" && customAudioUrl ? (
                <View
                  style={[
                    styles.customInputRow,
                    { backgroundColor: colors.card, borderColor: colors.teal },
                  ]}
                >
                  <TouchableOpacity
                    onPress={togglePreviewRecording}
                    activeOpacity={0.85}
                    accessibilityLabel={
                      isPreviewingRecording ? "Stop preview" : "Play your recording"
                    }
                    hitSlop={8}
                  >
                    <Icon
                      name={isPreviewingRecording ? "x" : "volume-2"}
                      size={18}
                      color={colors.teal}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.customInputText, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      Vibe recorded · {formatMs(recordedDurationMs)}
                      {isPreviewingRecording ? " · Playing…" : " · Tap to preview"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={clearRecording}
                    hitSlop={10}
                    accessibilityLabel="Remove recording"
                  >
                    <Icon name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
            ) : (
              <View
                style={[
                  styles.customInputRow,
                  {
                    backgroundColor: isRecording
                      ? colors.primary + "1A"
                      : colors.card,
                    borderColor: isRecording ? colors.primary : colors.border,
                  },
                ]}
              >
                {Platform.OS !== "web" && (
                  <TouchableOpacity
                    onPressIn={startRecording}
                    onPressOut={() => {
                      void finishRecording();
                    }}
                    delayPressIn={120}
                    delayPressOut={150}
                    activeOpacity={0.9}
                    accessibilityLabel="Hold mic to record"
                    hitSlop={8}
                  >
                    <Icon
                      name="mic"
                      size={18}
                      color={isRecording ? colors.primary : colors.mutedForeground}
                    />
                  </TouchableOpacity>
                )}
                <TextInput
                  value={
                    isRecording
                      ? `Recording… ${formatMs(recordingProgressMs)} / 0:10`
                      : vibeSearchText
                  }
                  onChangeText={onVibeSearchChange}
                  onFocus={scrollPostFormInputIntoView}
                  placeholder={
                    Platform.OS === "web"
                      ? "Search vibes, tap a chip to select"
                      : "Hold mic to record, or search vibes"
                  }
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={40}
                  editable={!isRecording}
                  style={[styles.customInputText, { color: colors.foreground }]}
                />
                {vibeSearchText.length > 0 && !isRecording && (
                  <TouchableOpacity
                    onPress={() => {
                      setVibeSearchText("");
                      setMusicGenre(null);
                      setGenreEdited(false);
                      genreEditedRef.current = false;
                    }}
                    hitSlop={10}
                    accessibilityLabel="Clear vibe search"
                  >
                    <Icon name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.aiSuggestSection}>
            {aiTags.length > 0 && !analyzing && (
              <Text
                style={[
                  styles.aiSpottedLine,
                  { color: colors.mutedForeground, alignSelf: "stretch" },
                ]}
                numberOfLines={1}
              >
                Spotted:{" "}
                {aiTags
                  .map((id) => TAG_LIBRARY.find((x) => x.id === id)?.label ?? id)
                  .join(" · ")}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.aiSuggestBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: analyzing ? colors.teal : colors.border,
                },
              ]}
              onPress={handleSuggestPress}
              disabled={analyzing}
              activeOpacity={0.85}
            >
              {analyzing ? (
                <LoadingGlobe size={20} />
              ) : (
                <Icon name="sparkles" size={14} color={colors.teal} />
              )}
              <Text style={[styles.aiSuggestBtnText, { color: colors.foreground }]}>
                {analyzing ? "Suggesting…" : "AI suggest"}
              </Text>
            </TouchableOpacity>
          </View>

          {submitHint ? (
            <Text
              style={[styles.submitHint, { color: colors.mutedForeground }]}
              accessibilityLiveRegion="polite"
            >
              {submitHint}
            </Text>
          ) : null}

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.retakeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                void stopAudio();
                pickedAssetRef.current = null;
                setSelectedPhoto(null);
                if (postIntent) applyPostIntentSeed();
              }}
            >
              <Icon name="refresh-cw" size={18} color={colors.foreground} />
              <Text style={[styles.retakeBtnText, { color: colors.foreground }]}>
                Retake
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: canSubmitPost ? colors.primary : colors.muted,
                },
              ]}
              onPress={submit}
              disabled={!canSubmitPost}
              activeOpacity={canSubmitPost ? 0.85 : 1}
              accessibilityState={{ disabled: !canSubmitPost }}
              accessibilityHint={submitHint ?? undefined}
            >
              <Text
                style={[
                  styles.submitBtnText,
                  {
                    color: canSubmitPost
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  },
                ]}
              >
                Submit & Match
              </Text>
              <Icon
                name="globe"
                size={18}
                color={
                  canSubmitPost ? colors.primaryForeground : colors.mutedForeground
                }
              />
            </TouchableOpacity>
          </View>
            </View>
          </KeyboardAwareScrollViewCompat>
      ) : (
        <View
          style={[
            styles.pickScreen,
            {
              paddingHorizontal: 20,
              paddingBottom: bottomPadding + 16,
            },
          ]}
        >
          {myPhotos.length > 0 && (
            <View style={styles.prevSection}>
              <Text style={[styles.prevTitle, { color: colors.mutedForeground }]}>
                Your recent photos
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.prevScroll}
              >
                {myPhotos.slice(0, 8).map((photo, i) => {
                  const rowKey = myPhotoRowKey(photo, i);
                  const displayUri = resolveMyPhotoThumbnailUri(photo);
                  const loc = photoCountryDisplay(photo.captureCountryCode);
                  return (
                  <View key={rowKey} style={styles.prevItem}>
                    <TouchableOpacity
                      onPress={() => {
                        selectRecentPhoto(photo);
                        if (photo.customAudioUrl) {
                          togglePreview(photo.customAudioUrl);
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      {displayUri ? (
                        <RemotePhotoImage
                          uri={displayUri}
                          fallbackUri={resolveMyPhotoFallbackUri(photo)}
                          style={[styles.prevPhoto, { borderColor: colors.border }]}
                          resizeMode="cover"
                          transitionMs={0}
                          recyclingKey={`recent-${rowKey}`}
                        />
                      ) : (
                        <View
                          style={[
                            styles.prevPhoto,
                            { borderColor: colors.border, backgroundColor: colors.card },
                          ]}
                        />
                      )}
                      {loc.code ? (
                        <View style={styles.prevCountryBadge}>
                          <Text style={styles.prevCountryFlag}>{loc.flag}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                    {photo.customAudioUrl ? (
                      <MicBadge
                        audioUrl={photo.customAudioUrl}
                        size="xs"
                        style={styles.prevMicBadge}
                      />
                    ) : null}
                  </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.pickSpacer} />

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
                AI-generated images are welcome. They show an AI generated label and can still make Waves.
              </Text>
            </View>
          </View>
        </View>
      )}

      <ProPaywallModal
        visible={aiPaywallOpen}
        onClose={() => setAiPaywallOpen(false)}
        onUnlocked={runAiSuggestions}
        title="AI suggest theme and vibe"
        note="You can set theme and vibe yourself anytime — no subscription needed."
        features={[
          "AI theme & vibe suggestions from your photos",
          "Clean share cards — no SameWave watermark",
          "Full-size reveal photos and higher-res exports",
        ]}
        finePrint="Posting without AI is always free. AI uses cloud vision — Pro covers your share of that cost. Billing period is shown in the store checkout."
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  intentPromptWrap: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  intentPrompt: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  intentPromptLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  intentPromptTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  intentPromptEmoji: { fontSize: 22 },
  intentPromptTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    flex: 1,
  },
  intentPromptDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginTop: 2,
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
  pickScreen: {
    flex: 1,
    paddingTop: 4,
  },
  pickSpacer: {
    flex: 1,
    minHeight: 20,
  },
  pickOptions: {
    gap: 12,
    paddingTop: 8,
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
  postFormScroll: {
    flex: 1,
  },
  postFormScrollContent: {
    gap: 6,
    paddingTop: 2,
  },
  photoPreviewShell: {
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  photoPreviewShellCompact: {
    borderRadius: 16,
  },
  photoPreviewImage: {
    width: "100%",
    height: "100%",
  },
  postFormControls: {
    flexShrink: 0,
    gap: 6,
  },
  aiInlineNote: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: -4,
  },
  aiSuggestSection: {
    flexShrink: 0,
    gap: 4,
    marginTop: 2,
    alignItems: "flex-end",
  },
  aiSuggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-end",
  },
  aiSuggestBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  aiSpottedLine: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: -2,
  },
  vibeSection: {
    gap: 6,
    flexShrink: 0,
  },
  submitHint: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 4,
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
    marginBottom: 4,
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
  prevItem: {
    position: "relative",
    marginRight: 8,
  },
  prevPhoto: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
  },
  prevMicBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
  },
  prevCountryBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  prevCountryFlag: {
    fontSize: 13,
  },
  themeSection: {
    gap: 8,
  },
  themeSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHeading: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  tokenChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    flexShrink: 0,
  },
  tokenChipEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  tokenChipLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
  },
  customInputText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingVertical: 0,
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
});
