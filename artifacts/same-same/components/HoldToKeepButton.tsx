import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import Animated, {
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

const TEAL = "#00C9B1";
const HOLD_MS = 3000;
const SIZE = 112;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function HoldToKeepButton({ onKept }: { onKept: () => void }) {
  const progress = useSharedValue(0);
  const [label, setLabel] = useState("Hold to keep");
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setLabel("Kept");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onKept();
  };

  const gesture = Gesture.LongPress()
    .minDuration(HOLD_MS)
    .onBegin(() => {
      progress.value = withTiming(1, { duration: HOLD_MS });
    })
    .onFinalize((_e, success) => {
      if (success) {
        runOnJS(finish)();
        return;
      }
      progress.value = withTiming(0, { duration: 180 });
    });

  const props = useAnimatedProps(() => ({
    strokeDashoffset: C * (1 - progress.value),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.wrap} accessibilityRole="button" accessibilityLabel="Hold to keep">
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#1E4D5C" strokeWidth={STROKE} fill="#0D2B3A" />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={TEAL}
            strokeWidth={STROKE}
            fill="transparent"
            strokeDasharray={`${C} ${C}`}
            animatedProps={props}
            strokeLinecap="round"
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <Text style={styles.label}>{label}</Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", width: SIZE, height: SIZE },
  label: {
    position: "absolute",
    color: "#F0F8FF",
    fontSize: 13,
    textAlign: "center",
    width: 78,
    fontFamily: "Inter_600SemiBold",
  },
});
