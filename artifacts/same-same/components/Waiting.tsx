import React from "react";
import { StyleSheet, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Frost } from "@/components/Frost";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { sceneFor } from "@/data/scenes";
import { space } from "@/theme";

interface Props {
  /** Shown when waiting has gone on long enough to deserve a word. */
  message?: string | null;
  detail?: string | null;
  onRetry?: () => void;
  /** Show the SameWave mark instead of (or above) the rings. */
  brand?: boolean;
}

/** Soft Style 3 scene with a frosted waiting card. */
export function Waiting({ message, detail, onRetry, brand }: Props) {
  return (
    <Screen center scene={sceneFor.starting}>
      <Frost kind="card" style={styles.card} contentStyle={styles.pad}>
        {brand ? <BrandMark size={88} /> : <RippleRings size={200} />}
        <View style={styles.words}>
          {message ? (
            <Txt variant="heading" center>
              {message}
            </Txt>
          ) : null}
          {detail ? (
            <Txt tone="secondary" center style={styles.detail}>
              {detail}
            </Txt>
          ) : null}
          {onRetry ? (
            <Button kind="soft" label="Try again" onPress={onRetry} style={styles.retry} />
          ) : null}
        </View>
      </Frost>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: "stretch", maxWidth: 400 },
  pad: {
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  words: { minHeight: 120, marginTop: space.lg, alignItems: "center", alignSelf: "stretch" },
  detail: { marginTop: space.sm },
  retry: { marginTop: space.lg, alignSelf: "center", minWidth: 200 },
});
