/**
 * Canonical Ripple / Wave definitions for user-facing copy.
 *
 * **Ripple** — You tap Same on someone's photo (one-way). Stays a Ripple until
 * they tap Same back on yours.
 *
 * **Wave** — They Rippled back. Both sides tapped Same → mutual echo on the server
 * (`echo.state === "mutual"`, Atlas `kind: "wave"`).
 */

/** One sentence each — use in tooltips, empty states, accessibility. */
export const RIPPLE_ONE_LINER =
  "Someone tapped Ripple; waiting for them to Ripple back and make a Wave.";

/** Shown to both people when a Ripple becomes a Wave (push, toast, reveal). */
export const WAVE_MUTUAL_TAGLINE =
  "You rippled back! Send a Ripple. Catch a Wave.";

export const WAVE_ONE_LINER = WAVE_MUTUAL_TAGLINE;

export const RIPPLE_WAVE_RULE =
  "Ripple when you tap Same. When they Ripple back, it becomes a Wave.";

export const ATLAS_FILTER_A11Y = {
  all: "All — every live Ripple and Wave on the map",
  ripples:
    "Ripples only — someone tapped Ripple; waiting to Ripple back and make a Wave",
  waves: `Waves only — ${WAVE_MUTUAL_TAGLINE}`,
  mine: "Mine only — Ripples and Waves you are part of",
  wavefire:
    "Wavefire — global fire circle when matching moments connect into a shared campfire",
  ripplefire:
    "Ripplefire — fire circle from Ripples who resonated but have not become a Wave yet",
} as const;

/** Shown under the Atlas filter bar for the active mode only. */
export const ATLAS_FILTER_HINT = {
  all: "All — Every live Ripple and Wave connection on the map.",
  ripples:
    "Ripples — Someone tapped Ripple; waiting for them to Ripple back and make a Wave.",
  waves: "Waves — They rippled back! Send a Ripple. Catch a Wave.",
  mine: "Mine only — Only Ripples and Waves you are part of.",
  wavefire:
    "Wavefire — A global fire circle that lights up when matching moments connect, bringing people on the same wavelength into a shared campfire space.",
  ripplefire:
    "Ripplefire — A fire circle formed from Ripples, gathering people who resonated with the same moments but haven't yet connected as a Wave.",
} as const;

export const ATLAS_FILTER_HINT_MINE_SIGNIN =
  "Sign in to filter the map to Ripples and Waves you are part of.";

export const ATLAS_FIRE_EMPTY = {
  wavefire: "No Active Wavefire",
  ripplefire: "No Active Ripplefire",
} as const;

export const ATLAS_COUNTRY_MODAL = {
  ripplesSent: "Ripples you sent (one-way)",
  ripplesReceived: "Ripples you received (one-way)",
  wavesMutual: `Waves — ${WAVE_MUTUAL_TAGLINE}`,
} as const;

export const ECHOES_SCREEN = {
  title: "Ripples & Waves",
  subtitle: RIPPLE_WAVE_RULE,
  emptyTitle: "No Ripples or Waves yet",
  emptyBody:
    "When someone sends you a Ripple, you'll be asked here whether you feel the same. If you Ripple back, it becomes a Wave.",
  pendingSubtitle:
    "Someone tapped Ripple. Ripple back if you feel the same — then it's a Wave.",
  wavesSectionSubtitle: WAVE_MUTUAL_TAGLINE,
} as const;

export const MATCH_HISTORY_EMPTY =
  "Send a Ripple when you tap Same on a photo pair. When they Ripple back, your Ripple becomes a Wave.";

export const THEME_WAVES_EMPTY = (themeLabel: string) =>
  `No Waves here yet. Tap Same on a ${themeLabel} photo to send a Ripple. When someone Ripples back, it's a Wave.`;

export const DISCOVER_A11Y = {
  ripple: `Ripple — ${RIPPLE_ONE_LINER}`,
  wave: `Wave — ${WAVE_ONE_LINER}`,
} as const;

/** Remote push + in-app toast copy (keep in sync with api-server `pushCopy.ts`). */
export const PUSH_COPY = {
  pending: {
    title: "Someone tapped Ripple",
    body: "Ripple back if you feel the same — then it's a Wave.",
    actionLabel: "Ripple back",
  },
  mutual: {
    title: "Catch a Wave! ✨",
    body: WAVE_MUTUAL_TAGLINE,
    actionLabel: "Catch a Wave",
  },
} as const;

export const PUSH_CATEGORY = {
  rippleIncoming: "ripple_incoming",
  waveMutual: "wave_mutual",
} as const;

export const PUSH_ACTION = {
  makeWave: "make_wave",
  viewWave: "view_wave",
} as const;

export function profileEchoBellA11y(unreadRipples: number): string {
  if (unreadRipples > 0) {
    const n = unreadRipples;
    return `${n} Ripple${n === 1 ? "" : "s"} — Ripple back to make a Wave`;
  }
  return "Ripples & Waves — incoming Ripples and mutual Waves";
}
