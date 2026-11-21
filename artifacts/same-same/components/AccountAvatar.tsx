import React from "react";
import { Pressable } from "react-native";

import { FrostIconWell } from "@/components/Frost";
import { Icon } from "@/components/Icon";
import { colors, layout } from "@/theme";

interface Props {
  onPress: () => void;
}

/**
 * Account control — same frosted well as the help button (size, border, icon
 * colour). Person glyph instead of a profile photo so it fits Style 3 chrome.
 */
export function AccountAvatar({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={layout.hitSlop}
      accessibilityRole="button"
      accessibilityLabel="Account"
    >
      <FrostIconWell>
        <Icon name="account" size={22} color={colors.waterMuted} />
      </FrostIconWell>
    </Pressable>
  );
}
