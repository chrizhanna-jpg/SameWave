/**
 * Push notification copy — keep aligned with
 * `artifacts/same-same/data/waveRippleGlossary.ts` (`PUSH_COPY`).
 */
export const PUSH_COPY = {
  pending: {
    title: "New Ripple on your moment",
    body: "If their photo feels like yours, ripple back to make a Wave.",
    categoryId: "ripple_incoming",
  },
  mutual: {
    title: "You have a Wave! ✨",
    body: "You both tapped Same — open your Wave reveal to celebrate.",
    categoryId: "wave_mutual",
  },
} as const;
