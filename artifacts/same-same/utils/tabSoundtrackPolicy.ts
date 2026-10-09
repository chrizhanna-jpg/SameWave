/**
 * Which soundtrack a bottom tab should own while it is focused.
 * Ripple plays the current card's vibe. Atlas plays the beach loop.
 * Home, Waves, and My Path are silent — they take the player so the
 * previous tab's music cannot keep running.
 */
export type SoundtrackTab = "home" | "match" | "waves" | "atlas" | "profile";

export type SoundtrackAction =
  | "pause-vibe"
  | "stop-ambience"
  | "start-ambience"
  | "play-ripple";

export function focusActions(tab: SoundtrackTab): SoundtrackAction[] {
  switch (tab) {
    case "match":
      // Stop Atlas loops. The Ripple screen then plays the visible card.
      return ["stop-ambience", "play-ripple"];
    case "atlas":
      return ["pause-vibe", "start-ambience"];
    case "home":
    case "waves":
    case "profile":
      return ["pause-vibe", "stop-ambience"];
    default: {
      const exhaustive: never = tab;
      return exhaustive;
    }
  }
}
