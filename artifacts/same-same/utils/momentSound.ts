import { Audio } from "expo-av";

import { warmAudioSession } from "@/utils/audio";

export type MomentPlayback = "played" | "fallback";

export type MomentSoundHandle = {
  /** Resolves to "fallback" when the clip cannot start. Never rejects. */
  ready: Promise<MomentPlayback>;
  stop: () => void;
};

/**
 * Play a bundled sting without going through the music-vibe lease.
 * Failures resolve to "fallback" so a missing clip never blocks the UI.
 * Call `stop()` on dismiss — playback is capped at `maxMs` either way.
 */
export function startMomentSound(
  source: number,
  opts: { maxMs: number; volume?: number },
): MomentSoundHandle {
  let stopped = false;
  let sound: Audio.Sound | null = null;
  let cap: ReturnType<typeof setTimeout> | null = null;

  const release = () => {
    if (cap) {
      clearTimeout(cap);
      cap = null;
    }
    const current = sound;
    sound = null;
    if (!current) return;
    void current.stopAsync().catch(() => {});
    void current.unloadAsync().catch(() => {});
  };

  const ready = (async (): Promise<MomentPlayback> => {
    try {
      warmAudioSession();
      const created = await Audio.Sound.createAsync(source, {
        shouldPlay: !stopped,
        volume: opts.volume ?? 0.8,
        isLooping: false,
      });
      sound = created.sound;
      if (stopped) {
        release();
        return "fallback";
      }
      cap = setTimeout(release, opts.maxMs);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) release();
      });
      return "played";
    } catch {
      release();
      return "fallback";
    }
  })();

  return {
    ready,
    stop() {
      stopped = true;
      release();
    },
  };
}
