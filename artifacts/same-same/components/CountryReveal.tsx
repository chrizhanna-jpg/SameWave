import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  leftCountry: string;
  leftFlag: string;
  rightCountry: string;
  rightFlag: string;
}

export function CountryReveal({ leftCountry, leftFlag, rightCountry, rightFlag }: Props) {
  const colors = useColors();
  const leftAnim = useRef(new Animated.Value(0)).current;
  const rightAnim = useRef(new Animated.Value(0)).current;
  const lineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(leftAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(lineAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(rightAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.country,
          {
            opacity: leftAnim,
            transform: [
              {
                translateX: leftAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.flag}>{leftFlag}</Text>
        <Text style={[styles.countryName, { color: colors.foreground }]}>
          You
        </Text>
        <Text style={[styles.countryLabel, { color: colors.mutedForeground }]}>
          {leftCountry}
        </Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.connector,
          {
            width: lineAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 48],
            }),
            backgroundColor: colors.primary,
          },
        ]}
      />

      <Animated.View
        style={[
          styles.country,
          {
            opacity: rightAnim,
            transform: [
              {
                translateX: rightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.flag}>{rightFlag}</Text>
        <Text style={[styles.countryName, { color: colors.foreground }]}>
          Them
        </Text>
        <Text style={[styles.countryLabel, { color: colors.mutedForeground }]}>
          {rightCountry}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  country: {
    alignItems: "center",
    width: 100,
  },
  flag: {
    fontSize: 40,
    marginBottom: 4,
  },
  countryName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  countryLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
  },
  connector: {
    height: 2,
    marginHorizontal: 8,
  },
});
