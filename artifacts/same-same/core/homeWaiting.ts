/**
 * Home (and Ripple) post-send confirmation.
 *
 * A travelling Ripple alone must not keep the screen on "Send another" —
 * that state is persisted and would show on every Home entry. Waiting UI
 * is only for the send that just happened, until the user dismisses it
 * (leaves the tab, or taps Send another).
 */
export function shouldShowHomeWaiting(opts: {
  hasTravellingRipple: boolean;
  postSendWaiting: boolean;
  sendingAnother: boolean;
}): boolean {
  return opts.hasTravellingRipple && opts.postSendWaiting && !opts.sendingAnother;
}
