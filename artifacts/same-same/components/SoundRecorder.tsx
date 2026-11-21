import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { playbackModeChanged, playClip, stopClip } from "@/device/sound";
import { colors, layout, radius, space } from "@/theme";

/** The server keeps sounds up to about a megabyte; ten seconds is well inside that. */
const MAX_SECONDS = 10;

export interface Recording {
  uri: string;
  mime: string;
}

interface Props {
  value: Recording | null;
  onChange: (recording: Recording | null) => void;
}

/** Optional: a few seconds of sound to travel with the photo. */
export function SoundRecorder({ value, onChange }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS);
  const [playing, setPlaying] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopping = useRef(false);

  const endTicker = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };

  const restorePlayback = async () => {
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: false }).catch(
      () => undefined,
    );
    playbackModeChanged();
  };

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    endTicker();
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) onChange({ uri, mime: Platform.OS === "web" ? "audio/webm" : "audio/mp4" });
      else setProblem("That didn't record. Try again.");
    } catch {
      setProblem("That didn't record. Try again.");
    } finally {
      setRecording(false);
      stopping.current = false;
      await restorePlayback();
    }
  };

  const start = async () => {
    setProblem(null);
    stopClip();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setProblem("SameWave needs the microphone to record a sound.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setSecondsLeft(MAX_SECONDS);
      ticker.current = setInterval(() => setSecondsLeft((left) => left - 1), 1000);
    } catch {
      setProblem("The microphone isn't available right now.");
      await restorePlayback();
    }
  };

  useEffect(() => {
    if (recording && secondsLeft <= 0) void stop();
    // `stop` reads only refs and the recorder, which do not change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, secondsLeft]);

  useEffect(
    () => () => {
      endTicker();
      stopClip();
    },
    [],
  );

  if (recording) {
    return (
      <Pressable
        onPress={() => void stop()}
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
        style={styles.row}
      >
        <Icon name="stop" size={20} color={colors.ember} />
        <Txt style={styles.label}>{`Recording… ${Math.max(0, secondsLeft)}`}</Txt>
        <Txt variant="quiet" tone="haze">
          Tap to stop
        </Txt>
      </Pressable>
    );
  }

  if (value) {
    return (
      <View style={styles.row}>
        <Pressable
          hitSlop={layout.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Stop" : "Play your sound"}
          onPress={() => {
            if (playing) {
              stopClip();
              return;
            }
            setPlaying(true);
            void playClip(value.uri, () => setPlaying(false));
          }}
        >
          <Icon name={playing ? "stop" : "play"} size={20} />
        </Pressable>
        <Txt style={styles.label}>Sound added</Txt>
        <Button
          kind="quiet"
          label="Remove"
          onPress={() => {
            stopClip();
            onChange(null);
          }}
          style={styles.remove}
        />
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={() => void start()}
        accessibilityRole="button"
        accessibilityLabel="Record a sound"
        style={styles.row}
      >
        <Icon name="mic" size={20} />
        <Txt style={styles.label}>Record a sound</Txt>
        <Txt variant="quiet" tone="haze">
          {`Up to ${MAX_SECONDS} seconds`}
        </Txt>
      </Pressable>
      {problem ? (
        <Txt variant="quiet" tone="ember" style={styles.problem}>
          {problem}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    height: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.pondLift,
  },
  label: { flex: 1 },
  remove: { paddingVertical: 0, paddingHorizontal: 0 },
  problem: { marginTop: space.sm },
});
