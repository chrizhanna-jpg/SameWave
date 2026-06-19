import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";

import { Icon } from "@/components/Icon";
import { PressableScale } from "@/components/PressableScale";
import { useColors } from "@/hooks/useColors";
import { isMuted, onMuteChange, setMuted } from "@/utils/audio";

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Match header uses elevated card; explore overlays use translucent dark. */
  variant?: "header" | "overlay";
  iconSize?: number;
  accessibilityLabelMuted?: string;
  accessibilityLabelUnmuted?: string;
};

/** Global vibe / ambience mute — shared with Match and Atlas surfaces. */
export function AudioMuteButton({
  style,
  variant = "header",
  iconSize = 18,
  accessibilityLabelMuted = "Unmute vibe music",
  accessibilityLabelUnmuted = "Mute vibe music",
}: Props) {
  const colors = useColors();
  const [muted, setMutedState] = useState(isMuted());

  useEffect(() => onMuteChange(setMutedState), []);

  const toggleMute = useCallback(() => {
    setMuted(!isMuted());
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const backgroundColor =
    variant === "overlay" ? "rgba(255,255,255,0.12)" : colors.cardElevated;

  return (
    <PressableScale
      onPress={toggleMute}
      haptic="selection"
      scaleTo={0.92}
      style={[
        styles.btn,
        variant === "header" ? colors.shadows.sm : null,
        { backgroundColor },
        style,
      ]}
      accessibilityLabel={muted ? accessibilityLabelMuted : accessibilityLabelUnmuted}
    >
      <Icon
        name={muted ? "volumeX" : "volume2"}
        size={iconSize}
        color={colors.foreground}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
