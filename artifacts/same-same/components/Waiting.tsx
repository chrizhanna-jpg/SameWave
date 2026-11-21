import React from "react";
import { StyleSheet, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { RippleRings } from "@/components/RippleRings";
import { Screen } from "@/components/Screen";
import { Txt } from "@/components/Txt";
import { space } from "@/theme";

interface Props {
  /** Shown when waiting has gone on long enough to deserve a word. */
  message?: string | null;
  detail?: string | null;
  onRetry?: () => void;
  /** Show the SameWave mark instead of (or above) the rings. */
  brand?: boolean;
}

/** Soft mist with a quiet ring — for the moments the app is getting ready. */
export function Waiting({ message, detail, onRetry, brand }: Props) {
  return (
    <Screen center>
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
        {onRetry ? <Button kind="soft" label="Try again" onPress={onRetry} style={styles.retry} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  words: { minHeight: 120, marginTop: space.lg, alignItems: "center", alignSelf: "stretch" },
  detail: { marginTop: space.sm },
  retry: { marginTop: space.lg, alignSelf: "center", minWidth: 200 },
});
