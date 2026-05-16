// Wavefire-only ambience: separate from the global vibe-clip singleton
// (utils/audio.ts) so Atlas does not steal Match / Discover playback.
//
// Delegates to `firecircleAudio` (ocean + fire loops + ducking).

import {
  startFirecircleAmbience,
  stopFirecircleAmbience,
} from "@/utils/firecircleAudio";

export async function stopWavefireAmbience(): Promise<void> {
  await stopFirecircleAmbience();
}

export async function startWavefireAmbience(): Promise<void> {
  await startFirecircleAmbience();
}
