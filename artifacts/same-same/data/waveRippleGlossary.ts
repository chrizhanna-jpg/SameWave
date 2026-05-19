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
  "You tapped Same on their photo — waiting for them to Ripple back.";

export const WAVE_ONE_LINER =
  "They Rippled back — you both tapped Same on each other's photos.";

export const RIPPLE_WAVE_RULE =
  "Ripple when you tap Same. When they Ripple back, it becomes a Wave.";

export const ATLAS_FILTER_A11Y = {
  ripples: "Ripples only — one-way; waiting for them to Ripple back",
  waves: "Waves only — both sides Rippled back",
  wavefire:
    "Wavefire — live clusters of mutual Waves (both Rippled back)",
  ripplefire:
    "Ripplefire — all live Ripples worldwide (use Mine only to filter to yours)",
} as const;

export const ATLAS_FIRE_EMPTY = {
  wavefire: "No Active Wavefire",
  ripplefire: "No Active Ripplefire",
} as const;

export const ATLAS_COUNTRY_MODAL = {
  ripplesSent: "Ripples you sent (one-way)",
  ripplesReceived: "Ripples you received (one-way)",
  wavesMutual: "Waves — both sides Rippled back",
} as const;

export const ECHOES_SCREEN = {
  title: "Ripples & Waves",
  subtitle: RIPPLE_WAVE_RULE,
  emptyTitle: "No Ripples or Waves yet",
  emptyBody:
    "When someone sends you a Ripple, you'll be asked here whether you feel the same. If you Ripple back, it becomes a Wave.",
  pendingSubtitle:
    "Someone sent you a Ripple. Ripple back if you feel the same — then it's a Wave.",
  wavesSectionSubtitle: "Both of you Rippled back.",
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
    title: "New Ripple on your moment",
    body: "If their photo feels like yours, ripple back to make a Wave.",
    actionLabel: "Make a Wave",
  },
  mutual: {
    title: "You have a Wave! ✨",
    body: "You both tapped Same — open your Wave reveal to celebrate.",
    actionLabel: "View Wave",
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
    return `${n} new Ripple${n === 1 ? "" : "s"} waiting for you`;
  }
  return "Ripples & Waves — incoming Ripples and mutual Waves";
}
