import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { resetPlaybackMode } from "@/utils/audio";
import { loadRippleSoundEnabled } from "@/utils/keptWaves";

const DROP = require("../assets/audio/ripple-drop.wav");
const CHIME = require("../assets/audio/wave-chime.wav");

async function playOnce(source: number, volume: number): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      allowsRecording: false,
    });
    const player = createAudioPlayer(source);
    player.volume = volume;
    player.play();
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        /* already released */
      }
      void resetPlaybackMode();
    }, 1400);
  } catch {
    void resetPlaybackMode();
  }
}

/** Opt-in water drop. Default off. Silent switch wins because playsInSilentMode is false. */
export async function playRippleSoundIfEnabled(): Promise<void> {
  if (!(await loadRippleSoundEnabled())) return;
  await playOnce(DROP, 0.35);
}

/** Wave reveal chime. Respects the silent switch. Not gated by the ripple toggle. */
export async function playWaveChime(): Promise<void> {
  await playOnce(CHIME, 0.4);
}
