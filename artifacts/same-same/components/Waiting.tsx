import React from "react";
import { StyleSheet, View } from "react-native";

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
}

/** Still water with rings, for the moments the app is getting ready. */
export function Waiting({ message, detail, onRetry }: Props) {
  return (
    <Screen center>
      <RippleRings size={220} />
      <View style={styles.words}>
        {message ? (
          <Txt variant="heading" center>
            {message}
          </Txt>
        ) : null}
        {detail ? (
          <Txt tone="haze" center style={styles.detail}>
            {detail}
          </Txt>
        ) : null}
        {onRetry ? <Button kind="soft" label="Try again" onPress={onRetry} style={styles.retry} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  words: { minHeight: 140, marginTop: space.lg, alignItems: "center", alignSelf: "stretch" },
  detail: { marginTop: space.sm },
  retry: { marginTop: space.lg, alignSelf: "center", minWidth: 200 },
});
