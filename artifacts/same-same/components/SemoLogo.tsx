import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Line, G } from "react-native-svg";

type Props = {
  size?: "sm" | "md" | "lg";
  color?: string;
  accent?: string;
  showTagline?: boolean;
  taglineColor?: string;
};

type Letter = { points: [number, number][]; edges: [number, number][] };

const LETTER_W = 22;
const LETTER_H = 28;
const LETTER_GAP = 8;

const LETTERS: Record<string, Letter> = {
  S: {
    points: [
      [20, 0],
      [0, 0],
      [0, 14],
      [20, 14],
      [20, 28],
      [0, 28],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
  },
  E: {
    points: [
      [20, 0],
      [0, 0],
      [0, 14],
      [14, 14],
      [0, 28],
      [20, 28],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
      [4, 5],
    ],
  },
  M: {
    points: [
      [0, 28],
      [0, 0],
      [11, 14],
      [22, 0],
      [22, 28],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  O: {
    points: [
      [7, 0],
      [15, 0],
      [22, 7],
      [22, 21],
      [15, 28],
      [7, 28],
      [0, 21],
      [0, 7],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 0],
    ],
  },
};

const SIZE_MAP = {
  sm: { svgH: 22, dotR: 1.6, stroke: 1.2, tagline: 11, gap: 2 },
  md: { svgH: 36, dotR: 2.2, stroke: 1.6, tagline: 13, gap: 4 },
  lg: { svgH: 56, dotR: 3.2, stroke: 2.2, tagline: 15, gap: 6 },
} as const;

export function SemoLogo({
  size = "md",
  color = "#0F172A",
  accent,
  showTagline = true,
  taglineColor = "#64748B",
}: Props) {
  const s = SIZE_MAP[size];
  const word = "SEMO";
  const totalW = word.length * LETTER_W + (word.length - 1) * LETTER_GAP;
  const scale = s.svgH / LETTER_H;
  const renderW = totalW * scale;
  const lineColor = accent ?? color;

  return (
    <View style={styles.wrap}>
      <Svg width={renderW} height={s.svgH} viewBox={`0 0 ${totalW} ${LETTER_H}`}>
        {word.split("").map((ch, idx) => {
          const letter = LETTERS[ch];
          if (!letter) return null;
          const offsetX = idx * (LETTER_W + LETTER_GAP);
          return (
            <G key={`${ch}-${idx}`} transform={`translate(${offsetX} 0)`}>
              {letter.edges.map(([a, b], i) => {
                const [x1, y1] = letter.points[a];
                const [x2, y2] = letter.points[b];
                return (
                  <Line
                    key={`l-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={lineColor}
                    strokeWidth={s.stroke}
                    strokeLinecap="round"
                    opacity={0.55}
                  />
                );
              })}
              {letter.points.map(([x, y], i) => (
                <Circle
                  key={`p-${i}`}
                  cx={x}
                  cy={y}
                  r={s.dotR}
                  fill={color}
                />
              ))}
            </G>
          );
        })}
      </Svg>
      {showTagline && (
        <Text
          style={[
            styles.tagline,
            { color: taglineColor, fontSize: s.tagline, marginTop: s.gap },
          ]}
        >
          same same
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-start",
  },
  tagline: {
    fontFamily: "Inter_500Medium",
    letterSpacing: 2,
    textTransform: "lowercase",
  },
});

export default SemoLogo;
