import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";

type Props = {
  syncing: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  size?: number;
};

/** Header refresh control — spins while a background server sync runs. */
export function SyncRefreshButton({
  syncing,
  onPress,
  accessibilityLabel = "Sync with server",
  style,
  size = 22,
}: Props) {
  const colors = useColors();
  const spin = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (syncing) {
      loopRef.current?.stop();
      spin.setValue(0);
      loopRef.current = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loopRef.current.start();
      return () => {
        loopRef.current?.stop();
      };
    }
    loopRef.current?.stop();
    spin.setValue(0);
    return undefined;
  }, [syncing, spin]);

  const spinStyle = {
    transform: [
      {
        rotate: spin.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "360deg"],
        }),
      },
    ],
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: syncing }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      disabled={syncing && !onPress}
      onPress={onPress}
      style={[styles.btn, style]}
    >
      <Animated.View style={spinStyle}>
        <Icon
          name="refresh-cw"
          size={size}
          color={syncing ? colors.mutedForeground : colors.primary}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 4,
  },
});
