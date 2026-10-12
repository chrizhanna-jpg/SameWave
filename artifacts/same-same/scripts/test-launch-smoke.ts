/**
 * Smoke checks for launch-critical invariants (no RN imports).
 * Run: node --experimental-strip-types scripts/test-launch-smoke.ts
 * or: pnpm exec tsx scripts/test-launch-smoke.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

function assert(label: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function read(rel: string): string {
  return readFileSync(join(appRoot, rel), "utf8");
}

const layout = read("app/(tabs)/_layout.tsx");
assert(
  "tabs do NOT enable freezeOnBlur (known Expo 54 crash)",
  !layout.includes("freezeOnBlur: true"),
);
assert(
  "tabs do NOT enable lazy: true (known Expo 54 blank/crash)",
  !layout.includes("lazy: true"),
);

const match = read("app/(tabs)/match.tsx");
assert(
  "match never substitutes SAMPLE_PHOTOS[0] as your photo",
  !match.includes("SAMPLE_PHOTOS[0]"),
);
assert(
  "match gates deck on hasUploadedPhoto",
  match.includes("hasUploadedPhoto"),
);
assert(
  "match my-photo uses viewerOwnPhoto",
  match.includes("viewerOwnPhoto"),
);
assert(
  "match pauses audio on blur via pauseIfLease",
  match.includes("pauseIfLease(playLeaseRef.current)"),
);
assert(
  "match refuses to start audio while blurred",
  match.includes("isScreenFocusedRef"),
);
assert(
  "match plays the card clip without waiting for the image",
  match.includes("playClip(url)") &&
    !match.includes("candidateImageGateOpen") &&
    !match.includes("IMAGE_AUDIO_GATE"),
);
assert(
  "match claims the soundtrack when Ripple is focused",
  match.includes('applyTabFocusSoundtrack("match")'),
);
assert(
  "match recenters the next card only after that card is committed",
  match.includes("deckSettleToken") &&
    match.includes("setDeckSettleToken((n) => n + 1)"),
);
assert(
  "returning to Ripple stays quiet while a photo is fullscreen",
  match.includes("fullscreenUriRef.current != null"),
);

const home = read("app/(tabs)/index.tsx");
assert(
  "home silences the previous tab on focus",
  home.includes('applyTabFocusSoundtrack("home")'),
);

const waves = read("app/(tabs)/waves.tsx");
assert(
  "waves keeps the ripple inbox reachable",
  waves.includes('router.push("/echoes")'),
);
assert(
  "waves archive lists only waves the user kept",
  waves.includes("loadKeptWaves") && waves.includes("No saved Waves yet"),
);
assert(
  "waves silences the previous tab on focus",
  waves.includes('applyTabFocusSoundtrack("waves")'),
);

const profile = read("app/(tabs)/profile.tsx");
assert(
  "my path silences the previous tab on focus",
  profile.includes('applyTabFocusSoundtrack("profile")'),
);

const atlasTab = read("app/(tabs)/atlas.tsx");
assert(
  "world map silences the previous tab on focus",
  atlasTab.includes('applyTabFocusSoundtrack("home")'),
);

assert(
  "world tab shows ripples and waves this year",
  atlasTab.includes("fetchWorldYearCounts") &&
    atlasTab.includes("yearCountLabels(counts.ripples, counts.waves)"),
);

const discover = read("app/(tabs)/discover.tsx");
assert(
  "discover does not start focused and steal the player",
  discover.includes("const [focused, setFocused] = useState(false)") &&
    discover.includes("if (!focusedRef.current) return;"),
);

const audio = read("utils/audio.ts");
assert(
  "vibe playback is serialized on one command queue",
  audio.includes("audioCommands.enqueue") &&
    audio.includes("shouldPlay: false") &&
    audio.includes("clipShouldPlay(desiredPlaying, muted)"),
);

const wavefire = read("utils/wavefireAmbience.ts");
assert(
  "atlas ambience pauses in place instead of reloading each tab change",
  wavefire.includes("ambienceCommands.enqueue") &&
    !wavefire.includes("unloadAsync"),
);

const remote = read("components/RemotePhotoImage.tsx");
assert(
  "RemotePhotoImage coerces undefined uri safely",
  remote.includes('typeof uri === "string"') &&
    remote.includes("viewerOwnPhoto"),
);
assert(
  "viewerOwnPhoto never falls back to Unsplash placeholder",
  remote.includes("exhausted && !viewerOwnPhoto"),
);
assert(
  "Ripple photo reload ignores fallback-only updates",
  remote.includes("shouldResetDisplayedPhoto"),
);
assert(
  "painted viewer photo ignores later load errors",
  remote.includes("if (viewerOwnPhoto && loaded) return;"),
);

const atlas = read("components/AtlasGlobeExperience.tsx");
assert(
  "Atlas RAF is focus-gated",
  atlas.includes("useFocusEffect") && atlas.includes("requestAnimationFrame"),
);

const photoUri = read("utils/photoDisplayUri.ts");
assert(
  "user-own photo guards exported",
  photoUri.includes("isAllowedUserOwnPhotoUri") &&
    photoUri.includes("sanitizeUserOwnPhotoUri"),
);

assert(
  "match starts a card's clip only after its photo painted",
  match.includes("shownPhotoKey !== cardKey") &&
    match.includes("onResolved={(loadedRealImage)") &&
    match.includes("MUSIC_WAIT_FOR_PHOTO_MS"),
);
assert(
  "match retries the first clip once the gesture gate opens",
  match.includes("onUserInteracted(() => setAudioArmed(true))") &&
    match.includes("audioArmed,"),
);
assert(
  "slow clip loads never run inside the audio command queue",
  audio.includes("function startLoad(") &&
    audio.includes("if (afterLoad) return;"),
);

assert(
  "ripple photos run full width and the title and buttons fade together",
  match.includes('width: "100%"') &&
    match.includes("hideChromeForSwipe") &&
    match.includes("chromeAnimatedStyle") &&
    match.includes("Show title and buttons") &&
    !match.includes("const CARD_WIDTH"),
);
assert(
  "ripple title and buttons stay up when there is no deck to swipe",
  match.includes("const chromeActive = hasUploadedPhoto && !noMore;") &&
    match.includes("if (!chromeActive) setChrome(true);"),
);

assert(
  "a cached photo that loads before effects run still shows",
  remote.includes("const [loadedSrc, setLoadedSrc]") &&
    remote.includes("const loaded = loadedSrc !== null && loadedSrc === src;") &&
    !remote.includes("setLoaded("),
);
assert(
  "the next card is chosen ahead so its photo and clip are the ones warmed",
  match.includes("const upcomingRef = useRef<DeckPick[]>([]);") &&
    match.includes("takeUpcoming(currentKey) ?? pickDeckCandidate") &&
    match.includes("refillUpcoming(currentKey, DECK_LOOKAHEAD)"),
);
assert(
  "a swipe always commits even if the animation callback is dropped",
  match.includes("SWIPE_OUT_MS + 250") &&
    match.includes("swipeTokenRef.current === swipeToken") &&
    match.includes("SWIPE_STUCK_RECOVERY_MS"),
);
assert(
  "the upload ack does not re-roll the card being swiped",
  match.includes("const sameUpload =") && match.includes("if (sameUpload) return;"),
);
assert(
  "title and buttons step aside by themselves and a handle brings them back",
  match.includes("CHROME_AUTO_HIDE_MS") &&
    match.includes("function ChromeHandle(") &&
    match.includes("Show title and buttons"),
);

const tabsLayout = read("app/(tabs)/_layout.tsx");
assert(
  "the main menu hides with the Ripple title and buttons and always returns",
  match.includes("const menuHidden = tabFocused && chromeActive && !chromeShown;") &&
    match.includes("if (!tabFocused || !chromeActive || !chromeShown) return;") &&
    match.includes("if (tabFocused && chromeActive) setChrome(false);") &&
    match.includes("setChrome(!chromeActiveRef.current)") &&
    match.includes("setTabBarHidden(menuHidden)") &&
    match.includes("setTabBarHidden(false);") &&
    tabsLayout.includes("useTabBarHidden()") &&
    tabsLayout.includes('display: "none"'),
);

const remoteSource = read("utils/remotePhotoSource.ts");
const deckWarmer = read("utils/deckImageWarmer.ts");
const samplePrefetch = read("utils/sampleAssetPrefetch.ts");
assert(
  "the photo view and the deck warm-up request the same URL",
  remote.includes('import { normalizeRemotePhotoUri } from "@/utils/remotePhotoSource";') &&
    !remote.includes("function normalizeRemotePhotoUri(") &&
    remoteSource.includes("export function deckImageUri(") &&
    remoteSource.includes("normalizeRemotePhotoUri(uri, HERO_DISPLAY_WIDTH)") &&
    deckWarmer.includes("deckImageUri(uri)") &&
    match.includes("displayWidth={HERO_DISPLAY_WIDTH}"),
);
assert(
  "cold-start sample warm-up uses the deck warmer, not a different width",
  samplePrefetch.includes("warmDeckImages(uris, 20)") &&
    !samplePrefetch.includes("prefetchPhotoUris"),
);
assert(
  "ripple deck warms four cards ahead and swipes to a downloaded one first",
  match.includes("const DECK_LOOKAHEAD = 4;") &&
    match.includes("warmDeckImages(") &&
    match.includes("takeReadyFirst(upcomingRef.current") &&
    match.includes("hasDeckImageFailed(pick.photo.uri)") &&
    !match.includes("prefetchPhotoUris"),
);
assert(
  "a swipe does not re-query candidates while the pool is healthy",
  match.includes("shouldRefetchDeckPool({") &&
    match.includes("poolQueryRef.current = { key: queryKey, at: Date.now() };"),
);
assert(
  "a downloaded deck photo skips the placeholder flash",
  remote.includes("const paintsImmediately =") &&
    remote.includes("isDeckImageReady(safeUri)") &&
    remote.includes("(!loaded && !paintsImmediately)"),
);
assert(
  "the visible card loads ahead of background downloads",
  remote.includes('priority={priority === "hero" ? "high" : "normal"}'),
);

const shimmer = read("components/OceanShimmer.tsx");
assert(
  "ocean shimmer stays behind tab content",
  shimmer.includes("StyleSheet.absoluteFill") &&
    !shimmer.includes("absoluteFillObject"),
);

assert(
  "only the focused tab runs shimmer animations, after launch settles",
  shimmer.includes("useIsFocused()") &&
    shimmer.includes("cancelAnimation(t)") &&
    shimmer.includes("focused && settled") &&
    !shimmer.includes("InteractionManager"),
);

const rootLayout = read("app/_layout.tsx");
assert(
  "launch does not fetch multi-megabyte dev chunks via dynamic import",
  !/import\(\s*["']@\//.test(rootLayout),
);
assert(
  "image warm-up waits for first frames",
  rootLayout.includes("STARTUP_WARM_DELAY_MS") &&
    rootLayout.includes("setTimeout(() => {\n      void prefetchSampleAssetsOnColdStart()"),
);

const appContextSrc = read("context/AppContext.tsx");
assert(
  "header sync spinner always stops and first sync is deferred",
  appContextSrc.includes("CLOUD_SYNC_MAX_MS") &&
    appContextSrc.includes("Promise.race([") &&
    appContextSrc.includes("CLOUD_SYNC_FIRST_DELAY_MS"),
);

const apiSrc = read("utils/api.ts");
assert(
  "sync fetches have a hard timeout",
  apiSrc.includes("fetchSyncJson<") && apiSrc.includes("SYNC_FETCH_TIMEOUT_MS"),
);

const deckScoringSrc = read("utils/deckScoring.ts");
assert(
  "deck scoring reuses per-photo scores for the same requester context",
  deckScoringSrc.includes("scoreMemo") &&
    match.includes('from "@/utils/deckScoring"') &&
    !match.includes("function scoreCandidates("),
);
assert(
  "a swipe does not run the queue refill in front of the card change",
  !/loadNextCandidate = useCallback\(\(\) => \{[\s\S]*?prefetchDeckAhead\(next/.test(match) &&
    match.includes("setTimeout(() => prefetchDeckAhead(snapshotPhoto.uri), 0)"),
);
assert(
  "state saves are batched off the swipe commit and flushed on background",
  appContextSrc.includes("PERSIST_DEBOUNCE_MS") &&
    appContextSrc.includes("flushPendingPersist") &&
    appContextSrc.includes('status !== "active"'),
);

assert(
  "the next card eases in after a swipe instead of popping in",
  match.includes("CARD_ARRIVE_MS") &&
    match.includes("cardOpacity.value = withTiming(1") &&
    match.includes("CARD_ARRIVE_MAX_WAIT_MS") &&
    match.includes("arrivePendingKeyRef.current ===") &&
    match.includes("opacity: cardOpacity.value") &&
    match.includes("reduceMotionRef.current"),
);

assert(
  "the seen-photos debug pill is off unless explicitly enabled",
  match.includes("SHOW_DEDUP_DEBUG &&") &&
    match.includes('EXPO_PUBLIC_SHOW_DEDUP_DEBUG === "1"') &&
    !match.includes("{__DEV__ && ("),
);

const deferFocus = read("utils/deferTabFocus.ts");
assert(
  "tab focus deferral does not touch InteractionManager",
  deferFocus.includes("requestAnimationFrame") &&
    !deferFocus.includes("InteractionManager"),
);

console.log("Done. exitCode=", process.exitCode ?? 0);
