import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { isPlayingUrl, onPlaybackChange, togglePreview } from "@/utils/audio";

interface Props {
  audioUrl: string;
  size?: "xs" | "sm" | "md";
  style?: StyleProp<ViewStyle>;
  /**
   * When false the badge is a plain non-interactive view (used inside
   * containers that already own the tap, e.g. a TouchableOpacity row).
   * The parent should call `togglePreview(audioUrl)` itself in that case.
   */
  interactive?: boolean;
}

/**
 * Small "this photo has a voice clip" badge. Renders a mic when nothing is
 * playing for this URL and switches to a speaker icon (highlighted) while
 * the singleton player is actively looping this clip — so the user gets
 * unambiguous feedback that their tap is doing something.
 */
export function MicBadge({ audioUrl, size = "sm", style, interactive = true }: Props) {
  const colors = useColors();
  const [playing, setPlaying] = useState(() => isPlayingUrl(audioUrl));

  useEffect(() => {
    setPlaying(isPlayingUrl(audioUrl));
    return onPlaybackChange(() => setPlaying(isPlayingUrl(audioUrl)));
  }, [audioUrl]);

  const onPress = useCallback(() => togglePreview(audioUrl), [audioUrl]);

  const dim = size === "xs" ? 20 : size === "sm" ? 24 : 28;
  const iconSize = size === "xs" ? 11 : size === "sm" ? 13 : 15;

  const visual = (
    <View
      style={[
        styles.badge,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: playing ? colors.green : "rgba(0,0,0,0.62)",
          borderColor: "rgba(255,255,255,0.95)",
        },
      ]}
    >
      <Icon
        name={playing ? "volume2" : "mic"}
        size={iconSize}
        color="#ffffff"
      />
    </View>
  );

  if (!interactive) {
    return <View style={style}>{visual}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        playing ? "Pause your voice clip" : "Preview your voice clip"
      }
      onPress={onPress}
      hitSlop={8}
      style={style}
    >
      {visual}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
});
