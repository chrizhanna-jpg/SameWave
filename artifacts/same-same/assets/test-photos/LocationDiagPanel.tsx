/**
 * Dev / Expo-preview location authenticity diagnostic.
 * Metro stubs this module when EXPO_PUBLIC_TEST_PHOTOS is not "1", so
 * production exports never include the panel UI or its labels.
 */
import { geoEqualEarth, geoPath } from "d3-geo";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

import type { CaptureCountrySource } from "@/core/captureCountry";
import { isApproximateCountrySource } from "@/core/captureCountry";
import type { Ripple, Wave } from "@/core/types";
import { nameFor } from "@/data/countries";
import { centroidLonLatForCountry } from "@/data/countryCentroids";
import { colors, space, type as typeStyle } from "@/theme";

const topology = land110 as unknown as Topology;
const land = feature(topology, topology.objects.land as GeometryCollection);

export type DiagSideRow = {
  key: string;
  waveId: string;
  side: "mine" | "theirs";
  countryCode: string | null;
  countryName: string;
  source: CaptureCountrySource | "unknown";
  lat: number | null;
  lng: number | null;
  plotLng: number | null;
  plotLat: number | null;
  approximate: boolean;
};

export function buildLocationDiagRows(
  waves: readonly Wave[],
  ripples: readonly Ripple[],
): DiagSideRow[] {
  const rows: DiagSideRow[] = [];
  for (const wave of waves) {
    for (const side of ["mine", "theirs"] as const) {
      const photo = wave[side];
      const ripple =
        side === "mine"
          ? ripples.find((r) => r.photoId === photo.photoId)
          : undefined;
      const source: CaptureCountrySource | "unknown" =
        ripple?.captureCountrySource ?? photo.countrySource ?? "unknown";
      const approximate = isApproximateCountrySource(
        source === "unknown" ? null : source,
      );
      const centroid = photo.countryCode
        ? centroidLonLatForCountry(photo.countryCode)
        : null;
      const usePrecise =
        !approximate && photo.lng != null && photo.lat != null;
      const plotLng = usePrecise ? photo.lng! : (centroid?.[0] ?? null);
      const plotLat = usePrecise ? photo.lat! : (centroid?.[1] ?? null);
      rows.push({
        key: `${wave.id}-${side}`,
        waveId: wave.id,
        side,
        countryCode: photo.countryCode,
        countryName: nameFor(photo.countryCode) ?? "Somewhere",
        source,
        lat: photo.lat ?? null,
        lng: photo.lng ?? null,
        plotLng,
        plotLat,
        approximate,
      });
    }
  }
  return rows;
}

type Props = {
  waves: readonly Wave[];
  ripples: readonly Ripple[];
};

/** Lists each Wave side's country provenance and optional map plot. */
export function LocationDiagPanel({ waves, ripples }: Props) {
  const rows = useMemo(() => buildLocationDiagRows(waves, ripples), [waves, ripples]);
  const [showOnMap, setShowOnMap] = useState<Record<string, boolean>>({});

  const plotted = rows.filter((r) => showOnMap[r.key] && r.plotLng != null && r.plotLat != null);

  const map = useMemo(() => {
    const width = 320;
    const height = 160;
    const projection = geoEqualEarth().fitSize([width, height], { type: "Sphere" });
    const landPath = geoPath(projection)(land) ?? "";
    const points = plotted
      .map((r) => {
        const xy = projection([r.plotLng!, r.plotLat!] as [number, number]);
        return xy ? { key: r.key, x: xy[0], y: xy[1], approximate: r.approximate } : null;
      })
      .filter(Boolean) as { key: string; x: number; y: number; approximate: boolean }[];
    return { width, height, landPath, points };
  }, [plotted]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Location diagnostic</Text>
      <Text style={styles.sub}>
        Country source for each Wave side (gps / photo / fallback). Preview and __DEV__ only.
      </Text>

      {plotted.length > 0 ? (
        <View style={styles.mapWrap} accessibilityLabel="Location diagnostic map">
          <Svg width={map.width} height={map.height}>
            <Path d={map.landPath} fill={colors.slate} fillOpacity={0.25} />
            {map.points.map((p) => (
              <Circle
                key={p.key}
                cx={p.x}
                cy={p.y}
                r={p.approximate ? 5 : 4}
                fill={p.approximate ? "transparent" : colors.waterMid}
                stroke={colors.waterMid}
                strokeWidth={p.approximate ? 1.5 : 0}
                strokeDasharray={p.approximate ? "2 2" : undefined}
              />
            ))}
          </Svg>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Text style={styles.empty}>No Waves yet — send a Ripple or enable sample photos.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>
                {row.side === "mine" ? "You" : "Them"} · {row.countryCode ?? "—"} · {row.countryName}
                {row.approximate ? " · approx." : ""}
              </Text>
              <Text style={styles.rowMeta}>source: {row.source}</Text>
              <Text style={styles.rowMeta}>
                lat/lng:{" "}
                {row.lat != null && row.lng != null
                  ? `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}`
                  : "—"}
              </Text>
              <Text style={styles.rowMeta}>
                plotted:{" "}
                {row.plotLat != null && row.plotLng != null
                  ? `${row.plotLat.toFixed(4)}, ${row.plotLng.toFixed(4)}`
                  : "—"}
              </Text>
            </View>
            <View style={styles.toggle}>
              <Text style={styles.toggleLabel}>show on map</Text>
              <Switch
                value={Boolean(showOnMap[row.key])}
                onValueChange={(on) =>
                  setShowOnMap((cur) => ({ ...cur, [row.key]: on }))
                }
                accessibilityLabel={`Show ${row.side} on map`}
              />
            </View>
          </View>
        ))
      )}
      {/* Keep Pressable so the tree stays interactive without cards. */}
      <Pressable
        onPress={() => setShowOnMap({})}
        style={styles.clear}
        accessibilityRole="button"
      >
        <Text style={styles.clearText}>Clear map toggles</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  title: { ...typeStyle.title, color: colors.slate },
  sub: { ...typeStyle.body, color: colors.textSecondary },
  empty: { ...typeStyle.body, color: colors.textSecondary, marginTop: space.md },
  mapWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typeStyle.label, color: colors.slate },
  rowMeta: { ...typeStyle.caption, color: colors.textSecondary },
  toggle: { alignItems: "center", gap: 4 },
  toggleLabel: { ...typeStyle.caption, color: colors.textSecondary },
  clear: { alignSelf: "flex-start", paddingVertical: space.sm },
  clearText: { ...typeStyle.label, color: colors.waterMid },
});
