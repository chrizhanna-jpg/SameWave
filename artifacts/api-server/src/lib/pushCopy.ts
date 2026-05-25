/**
 * Push notification copy — keep aligned with
 * `artifacts/same-same/data/waveRippleGlossary.ts` (`PUSH_COPY`).
 */
export const PUSH_COPY = {
  pending: {
    title: "Someone tapped Ripple",
    body: "Ripple back if you feel the same — then it's a Wave.",
    categoryId: "ripple_incoming",
  },
  mutual: {
    title: "Catch a Wave! ✨",
    body: "You rippled back! Send a Ripple. Catch a Wave.",
    categoryId: "wave_mutual",
  },
} as const;
