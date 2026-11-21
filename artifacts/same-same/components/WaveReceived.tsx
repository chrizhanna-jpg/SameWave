import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Scrim } from "@/components/Scrim";
import { Txt } from "@/components/Txt";
import { WaveJoin } from "@/components/WaveJoin";
import type { Wave } from "@/core/types";
import { colors, space } from "@/theme";

interface Props {
  wave: Wave;
  onContinue: () => void;
}

/**
 * Full-screen arrival moment for a Wave that formed since the last visit.
 * Photos meet on the logo seam; calm logo-blue chrome; shown once per Wave.
 */
export function WaveReceived({ wave, onContinue }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <WaveJoin
        width={width}
        height={height}
        top={{
          uri: wave.mine.uri,
          ownPhotoId: wave.mine.photoId,
          accessibilityLabel: "Your photo",
        }}
        bottom={{
          uri: wave.theirs.uri,
          accessibilityLabel: "Their photo",
        }}
      />
      <View
        style={[
          styles.chrome,
          {
            paddingTop: insets.top + space.lg,
            paddingBottom: insets.bottom + space.xl,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.top}>
          <Scrim kind="light" style={styles.pill}>
            <Txt variant="label" tone="primary" center>
              Wave received
            </Txt>
          </Scrim>
        </View>
        <View style={styles.bottom}>
          <Scrim>
            <Txt variant="hero" tone="white" center overPhoto>
              Wave
            </Txt>
          </Scrim>
          <Button label="Continue" onPress={onContinue} style={styles.continue} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  chrome: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
  },
  top: { alignItems: "center" },
  pill: { backgroundColor: colors.surfaceTranslucent },
  bottom: { alignItems: "center", gap: space.lg },
  continue: { alignSelf: "stretch", maxWidth: 360 },
});
