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

const home = read("app/(tabs)/index.tsx");
assert(
  "home silences the previous tab on focus",
  home.includes('applyTabFocusSoundtrack("home")'),
);

const waves = read("app/(tabs)/waves.tsx");
assert("waves uses FlatList virtualization", waves.includes("FlatList"));
assert(
  "waves yours slot sanitizes stock URIs",
  waves.includes("sanitizeUserOwnPhotoUri") && waves.includes("viewerOwnPhoto"),
);
assert(
  "waves scroll hint does not setState every frame",
  waves.includes("scrollMetricsRef") && !waves.includes("setScrollY("),
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
  "atlas takes the soundtrack on focus",
  atlasTab.includes('applyTabFocusSoundtrack("atlas")'),
);

const discover = read("app/(tabs)/discover.tsx");
assert(
  "discover does not start focused and steal the player",
  discover.includes("const [focused, setFocused] = useState(false)"),
);

const audio = read("utils/audio.ts");
assert(
  "vibe playback is serialized on one command queue",
  audio.includes("audioCommands.enqueue") &&
    audio.includes("shouldPlay: false"),
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

console.log("Done. exitCode=", process.exitCode ?? 0);
