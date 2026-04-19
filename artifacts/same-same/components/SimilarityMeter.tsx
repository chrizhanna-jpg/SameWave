import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  score: number;
  animate?: boolean;
}

export function SimilarityMeter({ score, animate = true }: Props) {
  const colors = useColors();
  const width = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const numberVal = useRef(new Animated.Value(0)).current;
  const displayScore = useRef(0);

  useEffect(() => {
    if (animate) {
      Animated.parallel([
        Animated.timing(width, {
          toValue: score,
          duration: 1500,
          delay: 300,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(numberVal, {
          toValue: score,
          duration: 1500,
          delay: 300,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      width.setValue(score);
      opacity.setValue(1);
      numberVal.setValue(score);
    }
  }, [score, animate]);

  const barWidth = width.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  const getColor = () => {
    if (score >= 80) return colors.teal;
    if (score >= 60) return colors.gold;
    return colors.primary;
  };

  const getLabel = () => {
    if (score >= 90) return "Incredibly similar";
    if (score >= 80) return "Very similar";
    if (score >= 70) return "Quite similar";
    if (score >= 60) return "Somewhat similar";
    return "Different but human";
  };

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {getLabel()}
        </Text>
        <Animated.Text
          style={[styles.score, { color: getColor() }]}
        >
          {score}%
        </Animated.Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.secondary }]}>
        <Animated.View
          style={[
            styles.bar,
            {
              width: barWidth,
              backgroundColor: getColor(),
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  score: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 4,
  },
});
