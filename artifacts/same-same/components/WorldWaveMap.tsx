import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { geoEqualEarth } from "d3-geo";

import { flagFor, nameFor } from "@/data/countries";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import { atlasLandGeoFeature, atlasLandPathD } from "@/utils/atlasWorldLand";

export type LiveDot = {
  countryCode: string;
  bornAt: number;
};

const BG = "#0A1F2E";
const LAND = "#1E4D5C";
const DOT = "#00C9B1";

export function WorldWaveMap({
  width,
  height,
  dots,
  countLabel,
}: {
  width: number;
  height: number;
  dots: LiveDot[];
  countLabel: string;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const seen = useRef<Set<string>>(new Set());
  const [pulseFrom, setPulseFrom] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fresh: string[] = [];
    for (const dot of dots) {
      const code = dot.countryCode.toUpperCase();
      if (seen.current.has(code)) continue;
      seen.current.add(code);
      fresh.push(code);
    }
    if (fresh.length === 0) return;
    const started = Date.now();
    setPulseFrom((prev) => {
      const next = { ...prev };
      for (const code of fresh) next[code] = started;
      return next;
    });
  }, [dots]);

  const projected = useMemo(() => {
    const projection = geoEqualEarth().fitExtent(
      [
        [16, 48],
        [width - 16, height - 24],
      ],
      atlasLandGeoFeature as never,
    );
    const land = atlasLandPathD(projection);
    const newest = new Map<string, LiveDot>();
    for (const dot of dots) {
      const code = dot.countryCode.toUpperCase();
      const prev = newest.get(code);
      if (!prev || dot.bornAt > prev.bornAt) newest.set(code, { ...dot, countryCode: code });
    }
    const placed = [...newest.values()]
      .map((dot) => {
        const centroid = centroidLonLatForAtlas(dot.countryCode);
        if (!centroid) return null;
        const xy = projection([centroid[0], centroid[1]]);
        if (!xy) return null;
        const age = now - dot.bornAt;
        if (age > 60 * 60 * 1000) return null;
        const fade = age > 55 * 60 * 1000 ? 1 - (age - 55 * 60 * 1000) / (5 * 60 * 1000) : 1;
        const pulsedAt = pulseFrom[dot.countryCode] ?? 0;
        const pulse = now - pulsedAt < 800 ? 12 : 6;
        return {
          code: dot.countryCode,
          x: xy[0],
          y: xy[1],
          r: pulse,
          opacity: Math.max(0, fade),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
    return { land, placed };
  }, [dots, height, now, pulseFrom, width]);

  return (
    <View style={[styles.fill, { backgroundColor: BG }]}>
      <Text style={styles.count}>{countLabel}</Text>
      <View style={styles.map}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setTip(null)} />
        <Svg width={width} height={height} pointerEvents="none">
          {projected.land ? <Path d={projected.land} fill={LAND} /> : null}
          {projected.placed.flatMap((dot) => [
            <Circle
              key={`${dot.code}-glow`}
              cx={dot.x}
              cy={dot.y}
              r={dot.r + 8}
              fill={DOT}
              opacity={dot.opacity * 0.28}
            />,
            <Circle
              key={dot.code}
              cx={dot.x}
              cy={dot.y}
              r={dot.r}
              fill={DOT}
              opacity={dot.opacity}
            />,
          ])}
        </Svg>
        {projected.placed.map((dot) => (
          <Pressable
            key={`hit-${dot.code}`}
            onPress={() => {
              const name = nameFor(dot.code) ?? dot.code;
              setTip(`${flagFor(dot.code)} ${name}`);
            }}
            style={{
              position: "absolute",
              left: dot.x - 16,
              top: dot.y - 16,
              width: 32,
              height: 32,
            }}
            accessibilityLabel={nameFor(dot.code) ?? dot.code}
          />
        ))}
      </View>
      {tip ? (
        <View style={styles.tip}>
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  count: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    zIndex: 2,
    color: DOT,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  map: { flex: 1 },
  tip: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    backgroundColor: "#0D2B3A",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#1E4D5C",
  },
  tipText: { color: "#F0F8FF", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
