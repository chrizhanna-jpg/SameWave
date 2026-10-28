import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";

/** Status shape the old expo-av call sites already understand. Positions stay in milliseconds. */
export type ClipStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  didJustFinish: boolean;
  positionMillis: number;
  durationMillis?: number;
};

export type ClipPlayer = {
  playAsync(): Promise<void>;
  pauseAsync(): Promise<void>;
  stopAsync(): Promise<void>;
  unloadAsync(): Promise<void>;
  setVolumeAsync(volume: number): Promise<void>;
  setPositionAsync(positionMillis: number): Promise<void>;
  getStatusAsync(): Promise<ClipStatus>;
  setStatusAsync(status: {
    shouldPlay?: boolean;
    isLooping?: boolean;
    volume?: number;
  }): Promise<void>;
  setOnPlaybackStatusUpdate(cb: (status: ClipStatus) => void): void;
};

function statusFrom(player: AudioPlayer, didJustFinish = false): ClipStatus {
  const native = player.currentStatus;
  const duration = native?.duration ?? 0;
  return {
    isLoaded: native?.isLoaded ?? true,
    isPlaying: player.playing,
    didJustFinish,
    positionMillis: Math.round((native?.currentTime ?? player.currentTime ?? 0) * 1000),
    durationMillis: duration > 0 ? Math.round(duration * 1000) : undefined,
  };
}

/** Load a bundled asset or remote URI. Playback options match the old Sound.createAsync initial status. */
export function createClipPlayer(
  source: number | { uri: string },
  initial?: { shouldPlay?: boolean; isLooping?: boolean; volume?: number },
): ClipPlayer {
  const player = createAudioPlayer(
    typeof source === "number" ? source : { uri: source.uri },
  );
  player.loop = initial?.isLooping ?? false;
  if (initial?.volume != null) player.volume = initial.volume;
  if (initial?.shouldPlay) player.play();

  let removed = false;
  return {
    async playAsync() {
      player.play();
    },
    async pauseAsync() {
      player.pause();
    },
    async stopAsync() {
      try {
        player.pause();
      } catch {
        /* already stopped */
      }
      try {
        await player.seekTo(0);
      } catch {
        /* ignore */
      }
    },
    async unloadAsync() {
      if (removed) return;
      removed = true;
      try {
        player.pause();
      } catch {
        /* ignore */
      }
      try {
        player.remove();
      } catch {
        /* ignore */
      }
    },
    async setVolumeAsync(volume: number) {
      player.volume = volume;
    },
    async setPositionAsync(positionMillis: number) {
      await player.seekTo(Math.max(0, positionMillis) / 1000);
    },
    async getStatusAsync() {
      return statusFrom(player);
    },
    async setStatusAsync(status) {
      if (status.isLooping != null) player.loop = status.isLooping;
      if (status.volume != null) player.volume = status.volume;
      if (status.shouldPlay === true) player.play();
      else if (status.shouldPlay === false) player.pause();
    },
    setOnPlaybackStatusUpdate(cb) {
      player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
        cb({
          isLoaded: status.isLoaded,
          isPlaying: status.playing,
          didJustFinish: status.didJustFinish,
          positionMillis: Math.round((status.currentTime || 0) * 1000),
          durationMillis:
            status.duration > 0 ? Math.round(status.duration * 1000) : undefined,
        });
      });
    },
  };
}

/** Speaker playback. Recording mode must not be left on or iOS routes clips to the earpiece. */
export async function configurePlaybackAudio(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: "duckOthers",
    shouldRouteThroughEarpiece: false,
  });
}

export async function configureRecordingAudio(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });
}
