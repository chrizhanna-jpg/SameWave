import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { consumePendingCapture } from "@/utils/captureBus";
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
import { requestAtlasRefresh } from "@/utils/atlasHub";
import { detectPhotoOrigin, type PhotoSource } from "@/utils/photoOrigin";
import {
  MUSIC_LIBRARY,
  pickClipForSeed,
  suggestGenre,
  type MusicGenre,
} from "@/data/musicLibrary";
import {
  markUserInteracted,
  pausePreview,
  playClip,
  resetPlaybackMode,
  stop as stopAudio,
  stopIfLease,
  togglePreview,
} from "@/utils/audio";
import { MicBadge } from "@/components/MicBadge";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

// Hard cap on recordings: 10s of audio at the AAC preset below lands well
// under our 1MB API budget (typically ~80–120KB) and keeps clips snappy
// in the match feed. We auto-stop at this length so no UI work needed.
const MAX_RECORD_MS = 10_000;

// `audio/m4a` reads natively on both iOS and Android in expo-av. Mime is
// recorded alongside the bytes so the playback `data:` URL works on both.
const RECORDING_MIME = "audio/m4a";

const MAX_TAGS = 4;
/** After this wait we still navigate to Ripple; upload still gets server AI. */
const SUBMIT_ANALYSIS_WAIT_CAP_MS = 5000;
/** Short beat so “posted” flashes before switching tabs (~stack transition). */
const NAV_TO_RIPPLE_MS = 380;
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
  const {
    addMyPhoto,
    setMyPhotoBackendId,
    setMyPhotoUploadState,
    myPhotos,
    myCountryCode,
  } = useApp();
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
  // Free-form concrete subjects from Gemini (apple, sculpture…). Not
  // shown to the user but persisted on the local MyPhoto record so the
  // match screen can pass them into /candidates as `subjects=`. Mirror
  // ref kept in sync so submit() reads the freshest value after the
  // analyzePhoto await.
  const aiSubjectsRef = useRef<string[]>([]);
  /** Same-role as aiTagsRef: theme can update on the analyze tick before React re-renders. */
  const aiThemeRef = useRef("");
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
  // The horizontal vibe-chip ScrollView and a per-chip layout map so we
  // can auto-scroll the AI's pick into view (centered when possible).
  // Otherwise the AI might pick a vibe that's off-screen and the user
  // wouldn't realize one is selected at all.
  const musicScrollRef = useRef<ScrollView>(null);
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
    aiThemeRef.current = "";
    setAiTheme("");
    setThemeText("");
    setThemeEdited(false);
    themeEditedRef.current = false;
    // Reset the music vibe so the next photo gets its own AI suggestion.
    setMusicGenre(null);
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
    setMusicGenre(g);
    setGenreEdited(true);
    genreEditedRef.current = true;
    Haptics.selectionAsync().catch(() => {});
    // Tap = swap + play. Use the photo URI as the seed so the same
    // photo→genre combo always picks the same clip.
    const seed = selectedPhoto ?? "preview";
    const clip = pickClipForSeed(g, seed);
    playLeaseRef.current = playClip(clip.url);
  };

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
    router.push("/in-camera");
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
      const cap = consumePendingCapture();
      if (cap) {
        const asset: ImagePicker.ImagePickerAsset = {
          uri: cap.uri,
          base64: cap.base64,
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
        acceptPhoto(asset, "camera");
      }
      return () => {
        void pausePreview();
      };
    }, []),
  );

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
    // Wait briefly for Gemini so Ripple gets tags/themes; cap wait so slow
    // networks don't stall the navigation (upload still merges server AI).
    if (inFlightAnalysisRef.current) {
      setSubmitted(true); // visually lock the button immediately
      let capTimer: ReturnType<typeof setTimeout> | undefined;
      const cap = new Promise<void>((resolve) => {
        capTimer = setTimeout(resolve, SUBMIT_ANALYSIS_WAIT_CAP_MS);
      });
      try {
        await Promise.race([inFlightAnalysisRef.current, cap]);
      } catch {
        // ignore — we'll just submit without AI tags
      } finally {
        if (capTimer) clearTimeout(capTimer);
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
      : normalizeTheme(aiThemeRef.current) || normalizeTheme(challenge.title);
    // Lock in a final genre — user pick wins; otherwise AI suggestion
    // from the just-analysed theme + merged tags. We compute on submit
    // so a brief race (user submits before AI returns) still records
    // a sensible vibe instead of nothing.
    const finalGenre: MusicGenre =
      musicGenreRef.current ?? suggestGenre(finalTheme, merged);
    // Snapshot the recorded clip too — addMyPhoto stores the local URL so
    // the user can preview their own vibe from "My photos", and uploadPhoto
    // ships the base64 to the backend so others hear it on match.
    const recordedBase64 = customAudioBase64;
    const recordedUrl = customAudioUrl;
    addMyPhoto(
      selectedPhoto,
      finalTheme,
      merged,
      isAi,
      finalGenre,
      recordedUrl ?? undefined,
      // Free-form subjects from Gemini — captured in analyzeSelected
      // and stashed on the local MyPhoto so the match screen can pass
      // them into /candidates as the `subjects=` query param. Empty if
      // analysis hadn't returned by the time the user submitted.
      aiSubjectsRef.current,
    );
    // Stop the preview clip — user is leaving the screen.
    void stopAudio();
    void teardownPreviewSound();
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
        customAudioBase64: recordedBase64 ?? undefined,
        customAudioMime: recordedBase64 ? RECORDING_MIME : undefined,
      })
        .then((res) => {
          // Store the backend ID back onto the local photo record so future
          // votes against this photo can flag it as the voter's side and
          // form echo offers. Also forward the upload-time `subjects`
          // array — the upload's analysis is the authoritative one (it's
          // what got persisted and what /candidates ranks against), so
          // any drift between the pre-upload analyze pass and the
          // upload-time pass is reconciled in favor of the server.
          // setMyPhotoBackendId no-ops when the array is empty so a
          // failed upload-time analysis doesn't wipe usable local
          // subjects we already had.
          if (res?.id && localUri) {
            // Success path: setMyPhotoBackendId also flips uploadState
            // to "ok" — no separate setMyPhotoUploadState call needed.
            // Merge theme/tags/music from the server response so Ripple
            // (and /candidates) see the upload-time AI result even when
            // the pre-upload /analyze-photo call failed or the user left
            // the camera tab before it finished.
            setMyPhotoBackendId(localUri, {
              backendId: res.id,
              subjects: res.subjects,
              theme: res.theme,
              tags: res.tags,
              musicGenre: res.musicGenre,
            });
            requestAtlasRefresh();
          } else if (localUri) {
            // uploadPhoto resolved but the body was malformed / missing
            // an id — treat as failed so the match screen surfaces a
            // real "upload failed, retry" instead of pretending we're
            // still uploading. Until v1.2.5 this was silently swallowed
            // and left users stuck at the "still uploading" footer.
            setMyPhotoUploadState(localUri, "failed");
          }
        })
        .catch(() => {
          // Network / fetch threw — same surfacing as the malformed-body
          // case above. The user can re-tap "Post a photo" or use the
          // retry path on the match screen.
          if (localUri) setMyPhotoUploadState(localUri, "failed");
        });
    } else if (!isAi && selectedPhoto) {
      // Non-AI photo without base64 — image picker / camera failed to
      // include the encoded body, so the upload was never attempted.
      // Without this branch the photo would sit at uploadState=
      // "pending" forever, even though no request is in flight. Mark
      // it failed so the match screen surfaces "didn't reach the
      // server, post again" instead of an indefinite "still
      // uploading" footer.
      setMyPhotoUploadState(selectedPhoto, "failed");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      // Ripple opens `/camera` without `?from=home`. `router.back()` is flaky
      // on some Android / Expo stacks and can leave users on a stuck modal.
      // Home flow also wants the swipe tab — always replace explicitly.
      router.replace("/(tabs)/match");
    }, NAV_TO_RIPPLE_MS);
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
                      It'll be marked with an AI badge and won't count as a wave connection.
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
                    // While analyzing we now use the same teal accent
                    // as the "spotted" state but a touch more vivid so
                    // the whole banner reads as actively working,
                    // not idle. Previously it used colors.border which
                    // matched the card and made the banner invisible.
                    borderColor: colors.teal,
                    borderWidth: analyzing ? 1.5 : 1,
                  },
                ]}
              >
                {analyzing ? (
                  <View style={styles.aiBannerRow}>
                    <LoadingGlobe size={36} />
                    <Text
                      style={[
                        styles.aiBannerLabel,
                        { color: colors.foreground, marginLeft: 12 },
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

            {/* Music vibe sits right under the photo so it's the first
                creative choice the user makes — the picker influences
                what the matched stranger will hear in the celebration,
                so it deserves prime real estate, not the bottom of the
                form. */}
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
                ref={musicScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.musicChips}
                onLayout={(e) => {
                  musicScrollWidthRef.current = e.nativeEvent.layout.width;
                }}
                style={{
                  // When the user has recorded their own clip, the chip
                  // picker no longer drives playback — fade it out so
                  // the override is visually obvious.
                  opacity: customAudioUrl ? 0.45 : 1,
                }}
              >
                {MUSIC_LIBRARY.map((g) => {
                  const active = musicGenre === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => handleGenreTap(g.id)}
                      activeOpacity={0.85}
                      disabled={!!customAudioUrl}
                      onLayout={(e) => {
                        const { x, width } = e.nativeEvent.layout;
                        chipLayoutsRef.current[g.id] = { x, width };
                      }}
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

            {/* Voice memo / vibe recording. Sits right under the music
                vibe chips because conceptually it's "the other source
                of audio for this photo" — picking a chip OR recording
                yourself fills the same slot for the matched stranger.
                Web is excluded because expo-av's recorder is mobile-only. */}
            {Platform.OS !== "web" && (
              <View style={styles.themeSection}>
                <View style={styles.tagSectionHeader}>
                  <Text
                    style={[
                      styles.themeSectionLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Your voice (optional)
                  </Text>
                  <Text
                    style={[
                      styles.tagCount,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    up to 10s · plays instead of music
                  </Text>
                </View>

                {customAudioUrl ? (
                  <View
                    style={[
                      styles.recorderCard,
                      { backgroundColor: colors.card, borderColor: colors.teal },
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.recorderPlayBtn,
                        { backgroundColor: colors.teal },
                      ]}
                      onPress={togglePreviewRecording}
                      activeOpacity={0.85}
                      accessibilityLabel={
                        isPreviewingRecording
                          ? "Stop preview"
                          : "Play your recording"
                      }
                    >
                      <Icon
                        name={isPreviewingRecording ? "x" : "volume-2"}
                        size={20}
                        color="#001018"
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.recorderTitle,
                          { color: colors.foreground },
                        ]}
                      >
                        Your vibe is set
                      </Text>
                      <Text
                        style={[
                          styles.recorderSub,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {formatMs(recordedDurationMs)} ·{" "}
                        {isPreviewingRecording ? "Playing…" : "Tap to preview"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={clearRecording}
                      hitSlop={10}
                      accessibilityLabel="Remove recording"
                    >
                      <Icon name="x" size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.recorderCard,
                      {
                        backgroundColor: isRecording
                          ? colors.primary + "1A"
                          : colors.card,
                        borderColor: isRecording
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                  >
                    {/* Only the mic button itself is pressable. The
                        surrounding card / text is non-interactive so a
                        thumb scrolling past the row no longer triggers
                        an accidental recording. */}
                    <TouchableOpacity
                      onPressIn={startRecording}
                      onPressOut={() => {
                        // Release fires for both finished and cancelled
                        // touches — finishRecording is idempotent thanks
                        // to the stop guard, so it's safe in either case.
                        void finishRecording();
                      }}
                      delayPressIn={120}
                      delayPressOut={150}
                      activeOpacity={0.9}
                      accessibilityLabel="Hold to record vibe"
                      style={[
                        styles.recorderMicBtn,
                        {
                          backgroundColor: isRecording
                            ? colors.primary
                            : colors.background,
                          borderColor: isRecording
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Icon
                        name="mic"
                        size={20}
                        color={
                          isRecording
                            ? colors.primaryForeground
                            : colors.foreground
                        }
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} pointerEvents="none">
                      <Text
                        style={[
                          styles.recorderTitle,
                          { color: colors.foreground },
                        ]}
                      >
                        {isRecording ? "Recording…" : "Hold mic to record"}
                      </Text>
                      <Text
                        style={[
                          styles.recorderSub,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {isRecording
                          ? `${formatMs(recordingProgressMs)} / 0:10 — release to save`
                          : "Say a word, hum a tune, share the moment"}
                      </Text>
                    </View>
                  </View>
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
                AI-generated images are welcome but get an AI badge and don't count as wave connections.
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
                <View key={i} style={styles.prevItem}>
                  {/* Tap on the photo body re-selects it for a fresh post
                      AND toggles preview of its voice clip if one exists —
                      this way users can both hear their past recording and
                      re-share that photo with a single tap. We route through
                      `togglePreview` (rather than calling `playClip` directly)
                      so the resulting lease is tracked by `pausePreview()` and
                      gets paused when the user navigates away. The mic badge
                      below uses its own Pressable to toggle play/pause
                      without affecting the selection. */}
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedPhoto(photo.uri);
                      if (photo.customAudioUrl) {
                        togglePreview(photo.customAudioUrl);
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      style={[styles.prevPhoto, { borderColor: colors.border }]}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                  {photo.customAudioUrl ? (
                    <MicBadge
                      audioUrl={photo.customAudioUrl}
                      size="xs"
                      style={styles.prevMicBadge}
                    />
                  ) : null}
                </View>
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
  recorderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  recorderMicBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  recorderPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  recorderTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  recorderSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
