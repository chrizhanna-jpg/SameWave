/**
 * Post-send confirmation copy and gates.
 *
 * A travelling Ripple alone must not keep the UI on "Send another" —
 * that state is persisted and would show on every entry. Waiting UI
 * is only for the send that just happened, until the user dismisses it.
 *
 * Upload ("Upload moment") alone is not a Ripple send. "Your Ripple is out
 * there" only after the user offers a Ripple on Match — that chrome lives on
 * the Ripple tab. Home may still show photo-only arrival waiting (not the
 * Ripple-sent moment).
 */

export function shouldShowHomeWaiting(opts: {
  hasTravellingRipple: boolean;
  postSendWaiting: boolean;
  sendingAnother: boolean;
  /** When true, Ripple-sent chrome is on the Ripple tab — Home stays normal. */
  rippleOffered?: boolean;
}): boolean {
  if (opts.rippleOffered) return false;
  return opts.hasTravellingRipple && opts.postSendWaiting && !opts.sendingAnother;
}

/** Ripple tab: show "Your Ripple is out there" + RippleRings after Match offer. */
export function shouldShowRippleSentWaiting(opts: {
  hasTravellingRipple: boolean;
  postSendWaiting: boolean;
  rippleOffered: boolean;
}): boolean {
  return opts.hasTravellingRipple && opts.postSendWaiting && opts.rippleOffered;
}

export type HomeWaitingCopy = {
  title: string;
  tagline: string;
  /** Omitted for photo-only — the title already carries the arrival line. */
  caption: string | null;
};

export function homeWaitingCopy(opts: { rippleOffered: boolean }): HomeWaitingCopy {
  if (opts.rippleOffered) {
    return {
      title: "Your Ripple is out there",
      tagline: "We'll tell you when someone shares your moment.",
      caption: "Waves usually arrive within a few days.",
    };
  }
  return {
    title: "Ripples and Waves arrive in a few days.",
    tagline: "We'll tell you when someone shares your moment.",
    caption: null,
  };
}
