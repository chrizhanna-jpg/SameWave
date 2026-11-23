/**
 * Home (and Ripple) post-send confirmation.
 *
 * A travelling Ripple alone must not keep the screen on "Send another" —
 * that state is persisted and would show on every Home entry. Waiting UI
 * is only for the send that just happened, until the user dismisses it
 * (leaves the tab, or taps Send another).
 *
 * Upload ("Upload moment") alone is not a Ripple send. "Your Ripple is out
 * there" only after the user offers a Ripple on Match; photo-only uses
 * arrival / waiting copy.
 */
export function shouldShowHomeWaiting(opts: {
  hasTravellingRipple: boolean;
  postSendWaiting: boolean;
  sendingAnother: boolean;
}): boolean {
  return opts.hasTravellingRipple && opts.postSendWaiting && !opts.sendingAnother;
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
