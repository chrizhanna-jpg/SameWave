import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";

import type { AtlasConnection } from "@/utils/api";
import { centroidLonLatForCountry } from "@/data/countryCentroids";
import { atlasArcPathD, createAtlasProjection } from "@/utils/atlasArcPath";
import { useColors } from "@/hooks/useColors";
import { flagFor, nameFor } from "@/data/countries";

const MAP_HEIGHT = 200;
const ACCENT = "#4FD89C";
const GOLD = "#FFD166";

interface Props {
  width: number;
  connections: AtlasConnection[];
}

function normalizeConnections(raw: AtlasConnection[]): AtlasConnection[] {
  const seen = new Set<string>();
  const out: AtlasConnection[] = [];
  for (const c of raw) {
    const from = c.from.trim().toUpperCase();
    const to = c.to.trim().toUpperCase();
    if (from.length !== 2 || to.length !== 2 || from === to) continue;
    const key = `${c.kind}:${from < to ? from : to}:${from < to ? to : from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, from, to });
    if (out.length >= 48) break;
  }
  return out;
}

export function AtlasLiveConnections({ width, connections }: Props) {
  const colors = useColors();
  const list = useMemo(() => normalizeConnections(connections), [connections]);

  const projection = useMemo(
    () => createAtlasProjection(width, MAP_HEIGHT),
    [width],
  );

  const paths = useMemo(() => {
    const items: Array<{
      key: string;
      d: string;
      kind: "ripple" | "wave";
      fresh: boolean;
    }> = [];
    for (const c of list) {
      const a = centroidLonLatForCountry(c.from);
      const b = centroidLonLatForCountry(c.to);
      if (!a || !b) continue;
      const d = atlasArcPathD(projection, a, b);
      if (!d) continue;
      items.push({
        key: c.id,
        d,
        kind: c.kind,
        fresh: c.fresh === true,
      });
    }
    return items;
  }, [list, projection]);

  if (list.length === 0) return null;

  return (
    <View style={[styles.wrap, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Ripples & waves
      </Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Green dashed = ripple (one side echoed). Gold = wave (mutual).
      </Text>
      <Svg width={width} height={MAP_HEIGHT} viewBox={`0 0 ${width} ${MAP_HEIGHT}`}>
        <G>
          {paths.map((p) =>
            p.kind === "wave" ? (
              <Path
                key={p.key}
                d={p.d}
                fill="none"
                stroke={GOLD}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.92}
              />
            ) : (
              <Path
                key={p.key}
                d={p.d}
                fill="none"
                stroke={ACCENT}
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeDasharray="4 5"
                opacity={p.fresh ? 0.9 : 0.65}
              />
            ),
          )}
        </G>
      </Svg>
      <View style={styles.legendList}>
        {list.slice(0, 12).map((c) => (
          <View key={c.id} style={styles.legendRow}>
            <Text style={styles.legendFlags}>
              {flagFor(c.from)} {flagFor(c.to)}
            </Text>
            <Text
              style={[styles.legendText, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {nameFor(c.from) ?? c.from} ↔ {nameFor(c.to) ?? c.to}
              <Text style={{ color: c.kind === "wave" ? GOLD : ACCENT }}>
                {" "}
                · {c.kind === "wave" ? "Wave" : "Ripple"}
              </Text>
            </Text>
          </View>
        ))}
        {list.length > 12 ? (
          <Text style={[styles.more, { color: colors.mutedForeground }]}>
            +{list.length - 12} more
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 10,
    overflow: "hidden",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginBottom: 4,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 17,
  },
  legendList: { gap: 6, marginTop: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendFlags: { fontSize: 16, minWidth: 44 },
  legendText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12 },
  more: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
});
