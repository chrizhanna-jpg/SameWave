import { pause } from "@/utils/audio";
import { stopFirecircleAmbience } from "@/utils/firecircleAudio";
import {
  focusActions,
  type SoundtrackTab,
} from "@/utils/tabSoundtrackPolicy";
import {
  startWavefireAmbience,
  stopWavefireAmbience,
} from "@/utils/wavefireAmbience";

/**
 * Apply the soundtrack that should be audible the moment a tab is focused.
 * Ripple's card clip is started by that screen (it knows the photo URL).
 * Call this from the tab's focus callback, not from blur: a blur pause
 * would run after the next tab has already started and would cut it off.
 */
export function applyTabFocusSoundtrack(tab: SoundtrackTab): void {
  for (const action of focusActions(tab)) {
    if (action === "pause-vibe") {
      void pause();
    } else if (action === "stop-ambience") {
      void stopWavefireAmbience();
      void stopFirecircleAmbience();
    } else if (action === "start-ambience") {
      void startWavefireAmbience();
    }
  }
}
