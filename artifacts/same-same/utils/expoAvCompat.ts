// Expo Go 57 does not include expo-av. This keeps the existing Sound and
// Recording call sites working on top of expo-audio.

import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync as setExpoAudioModeAsync,
} from "expo-audio";

type Player = ReturnType<typeof createAudioPlayer>;

type PlaybackStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  durationMillis: number;
  positionMillis: number;
  didJustFinish: boolean;
};

type StatusUpdate = {
  shouldPlay?: boolean;
  isLooping?: boolean;
  volume?: number;
  positionMillis?: number;
};

type AvSource = number | string | { uri?: string } | null | undefined;

function toSource(source: AvSource): number | string | { uri: string } | null {
  if (source == null) return null;
  if (typeof source === "number" || typeof source === "string") return source;
  if (typeof source.uri === "string") return { uri: source.uri };
  return null;
}

const LOAD_TIMEOUT_MS = 10_000;

/** expo-av resolved createAsync only once the clip was loaded; expo-audio does not. */
function waitForLoad(player: Player, timeoutMs: number): Promise<boolean> {
  if (player.isLoaded) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sub: { remove: () => void } | null = null;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      sub?.remove();
      resolve(ok);
    };
    sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.isLoaded) finish(true);
    });
    timer = setTimeout(() => finish(player.isLoaded), timeoutMs);
    if (player.isLoaded) finish(true);
  });
}

type LegacyAudioMode = {
  allowsRecordingIOS?: boolean;
  playsInSilentModeIOS?: boolean;
  staysActiveInBackground?: boolean;
  shouldDuckAndroid?: boolean;
  playThroughEarpieceAndroid?: boolean;
  allowsRecording?: boolean;
  playsInSilentMode?: boolean;
  shouldPlayInBackground?: boolean;
  shouldRouteThroughEarpiece?: boolean;
  interruptionMode?: "mixWithOthers" | "doNotMix" | "duckOthers";
};

export namespace Audio {
  export class Sound {
    private player: Player;
    private sub: { remove: () => void } | null = null;

    private constructor(player: Player) {
      this.player = player;
    }

    static async createAsync(
      source: AvSource,
      initialStatus?: StatusUpdate,
    ): Promise<{ sound: Sound }> {
      const startsPlaying = initialStatus?.shouldPlay === true;
      const player = createAudioPlayer(toSource(source), {
        downloadFirst: !startsPlaying,
      });
      const sound = new Sound(player);
      try {
        if (initialStatus) await sound.setStatusAsync(initialStatus);
        const loaded = await waitForLoad(player, LOAD_TIMEOUT_MS);
        // A paused load that never finishes must not be handed back as
        // ready: the caller would play() it later, mid-swipe, on top of
        // whatever clip belongs to the card on screen by then.
        if (!loaded && !startsPlaying) throw new Error("audio load timed out");
      } catch (error) {
        await sound.unloadAsync();
        throw error;
      }
      return { sound };
    }

    setOnPlaybackStatusUpdate(cb: ((status: PlaybackStatus) => void) | null): void {
      this.sub?.remove();
      this.sub = null;
      if (!cb) return;
      this.sub = this.player.addListener("playbackStatusUpdate", (status) => {
        cb({
          isLoaded: status.isLoaded,
          isPlaying: status.playing,
          durationMillis: (status.duration || 0) * 1000,
          positionMillis: (status.currentTime || 0) * 1000,
          didJustFinish: status.didJustFinish,
        });
      });
    }

    async getStatusAsync(): Promise<PlaybackStatus> {
      const duration = this.player.duration;
      const position = this.player.currentTime;
      return {
        isLoaded: this.player.isLoaded,
        isPlaying: this.player.playing,
        durationMillis: Number.isFinite(duration) ? duration * 1000 : 0,
        positionMillis: Number.isFinite(position) ? position * 1000 : 0,
        didJustFinish: false,
      };
    }

    async setStatusAsync(status: StatusUpdate): Promise<void> {
      if (status.isLooping != null) this.player.loop = status.isLooping;
      if (status.volume != null) this.player.volume = status.volume;
      if (status.positionMillis != null) {
        await this.player.seekTo(status.positionMillis / 1000);
      }
      if (status.shouldPlay === true) this.player.play();
      else if (status.shouldPlay === false) this.player.pause();
    }

    async playAsync(): Promise<void> {
      this.player.play();
    }

    async pauseAsync(): Promise<void> {
      this.player.pause();
    }

    async stopAsync(): Promise<void> {
      this.player.pause();
      try {
        await this.player.seekTo(0);
      } catch {
        /* already released */
      }
    }

    async setVolumeAsync(volume: number): Promise<void> {
      this.player.volume = volume;
    }

    async setPositionAsync(positionMillis: number): Promise<void> {
      await this.player.seekTo(positionMillis / 1000);
    }

    async unloadAsync(): Promise<void> {
      this.sub?.remove();
      this.sub = null;
      // Pause first so a clip that is still buffering cannot start once the
      // native player has been told to go away.
      try {
        this.player.pause();
      } catch {
        /* already released */
      }
      try {
        this.player.remove();
      } catch {
        /* already released */
      }
    }
  }

  export class Recording {
    private recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;

    async prepareToRecordAsync(
      options?: Parameters<
        InstanceType<typeof AudioModule.AudioRecorder>["prepareToRecordAsync"]
      >[0],
    ): Promise<void> {
      const preset = options ?? RecordingPresets.HIGH_QUALITY;
      this.recorder = new AudioModule.AudioRecorder(preset);
      await this.recorder.prepareToRecordAsync(preset);
    }

    async startAsync(): Promise<void> {
      this.recorder?.record();
    }

    async stopAndUnloadAsync(): Promise<void> {
      if (!this.recorder) return;
      await this.recorder.stop();
    }

    getURI(): string | null {
      return this.recorder?.uri ?? null;
    }

    async getStatusAsync(): Promise<{ durationMillis: number }> {
      const seconds = this.recorder?.currentTime ?? 0;
      return { durationMillis: seconds * 1000 };
    }
  }

  export const RecordingOptionsPresets = RecordingPresets;

  export async function setAudioModeAsync(mode: LegacyAudioMode): Promise<void> {
    await setExpoAudioModeAsync({
      playsInSilentMode: mode.playsInSilentMode ?? mode.playsInSilentModeIOS ?? true,
      allowsRecording: mode.allowsRecording ?? mode.allowsRecordingIOS ?? false,
      shouldPlayInBackground:
        mode.shouldPlayInBackground ?? mode.staysActiveInBackground ?? false,
      shouldRouteThroughEarpiece:
        mode.shouldRouteThroughEarpiece ?? mode.playThroughEarpieceAndroid ?? false,
      interruptionMode:
        mode.interruptionMode ??
        (mode.shouldDuckAndroid === false ? "mixWithOthers" : "duckOthers"),
    });
  }

  export const requestPermissionsAsync = requestRecordingPermissionsAsync;
}
