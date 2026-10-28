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
assert(
  "map keeps the atlas route and is labelled Waves",
  layout.includes('name="atlas"') &&
    layout.includes('title: "Waves"') &&
    layout.includes('name="wave-glyph"') &&
    !layout.includes('title: "Map"'),
);
assert(
  "waves inbox tab stays in the layout but is hidden",
  layout.includes('name="waves"') &&
    layout.includes("SHOW_WAVES_TAB ? undefined : null"),
);

const rootLayout = read("app/_layout.tsx");
assert(
  "splash hide stays on font readiness, not the wave reveal",
  rootLayout.includes("if (fontsReady)") &&
    rootLayout.includes("SplashScreen.hideAsync()") &&
    rootLayout.includes("<EchoFlash"),
);
assert(
  "tabs route is unchanged",
  rootLayout.includes('name="(tabs)"') && rootLayout.includes('name="reveal"'),
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
  "ripple tab drops the generic similar and prompt lines",
  !match.includes("Find your similar") && !match.includes("Today's prompt"),
);
assert(
  "ripple tab shows the home play focus",
  match.includes("resolveRipplePlayPresentation") &&
    match.includes("subscribeRipplePlayFocus"),
);

const home = read("app/(tabs)/index.tsx");
assert(
  "home play buttons record the theme and the interests",
  home.includes('kind: "challenge"') &&
    home.includes('kind: "interests"') &&
    home.includes("setRipplePlayFocus"),
);

const camera = read("app/camera.tsx");
assert(
  "interests play still attaches tags after vibe hydration",
  camera.includes("interestsSeededRef") && camera.includes("seedInterestTags"),
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
