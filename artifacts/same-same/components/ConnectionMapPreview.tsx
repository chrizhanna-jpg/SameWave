import React, { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { useColors } from "@/hooks/useColors";
import { flagFor, nameFor } from "@/data/countries";
import {
  atlasArcPathD,
  createConnectionPreviewProjection,
} from "@/utils/atlasArcPath";
import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import { atlasLandPathD } from "@/utils/atlasWorldLand";

const RIPPLE_ARC = "#4FD89C";
const WAVE_ARC = "#FFD166";

export type ConnectionMapKind = "ripple" | "wave";

type ConnectionMapPreviewProps = {
  fromCode?: string | null;
  toCode?: string | null;
  kind: ConnectionMapKind;
  width: number;
  /** Defaults to ~42% of width — a short strip above the share card body. */
  height?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Solid ocean via the wrapper View (not SVG gradients/rects) so land
   * and arcs paint reliably inside ViewShot and on Android.
   */
  captureSafe?: boolean;
};

/**
 * Mini Atlas-style map for a single ripple or wave: world land, one arc
 * between country centroids, endpoint dots. Static (ViewShot-safe).
 */
export function ConnectionMapPreview({
  fromCode,
  toCode,
  kind,
  width,
  height: heightProp,
  style,
  captureSafe = false,
}: ConnectionMapPreviewProps) {
  const colors = useColors();
  const w = Math.max(1, Math.round(width));
  const h = Math.max(48, Math.round(heightProp ?? w * 0.42));
  const gradId = useMemo(
    () => `connOcean-${kind}-${fromCode ?? "x"}-${toCode ?? "y"}`,
    [kind, fromCode, toCode],
  );

  const fromLon = fromCode ? centroidLonLatForAtlas(fromCode) : null;
  const toLon = toCode ? centroidLonLatForAtlas(toCode) : null;

  const sameCountry =
    fromCode &&
    toCode &&
    fromCode.trim().toUpperCase() === toCode.trim().toUpperCase();

  const arcColor = kind === "wave" ? WAVE_ARC : RIPPLE_ARC;

  const { landPathD, arcD, fromPx, toPx } = useMemo(() => {
    const projection = createConnectionPreviewProjection(w, h, fromLon, toLon);
    const land = atlasLandPathD(projection);
    let arc = "";
    if (fromLon && toLon) {
      arc = atlasArcPathD(projection, fromLon, toLon);
    }
    const a = fromLon ? projection(fromLon) : null;
    const b = toLon ? projection(toLon) : null;
    const toPxPoint = (p: readonly [number, number] | null) => {
      if (!p) return null;
      const [x, y] = p;
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    };
    return {
      landPathD: land,
      arcD: arc,
      fromPx: toPxPoint(a),
      toPx: toPxPoint(b),
    };
  }, [w, h, fromLon, toLon]);

  const a11yLabel =
    fromCode && toCode
      ? `Connection map from ${nameFor(fromCode) ?? fromCode} to ${nameFor(toCode) ?? toCode}`
      : "Connection map";

  const wrapBg = captureSafe ? "#2E9AC8" : "#0a1628";

  return (
    <View
      collapsable={false}
      renderToHardwareTextureAndroid={false}
      style={[
        styles.wrap,
        { width: w, height: h, borderColor: colors.border, backgroundColor: wrapBg },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      <Svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={StyleSheet.absoluteFill}
      >
        {!captureSafe ? (
          <>
            <Defs>
              <RadialGradient id={gradId} cx="50%" cy="48%" rx="72%" ry="64%">
                <Stop offset="0%" stopColor="#4DC4FA" />
                <Stop offset="55%" stopColor={colors.card} />
                <Stop offset="100%" stopColor={colors.background} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={h} fill={`url(#${gradId})`} />
          </>
        ) : null}
        <G>
          {landPathD ? (
            <Path
              d={landPathD}
              fill="#E8F4F8"
              fillOpacity={0.93}
              stroke="#1FA9F0"
              strokeOpacity={0.18}
              strokeWidth={0.2}
            />
          ) : null}
          {arcD && !sameCountry ? (
            <Path
              d={arcD}
              fill="none"
              stroke={arcColor}
              strokeWidth={kind === "wave" ? 1.35 : 0.9}
              strokeLinecap="round"
              strokeDasharray={kind === "ripple" ? "3 4" : undefined}
              opacity={0.92}
            />
          ) : null}
          {sameCountry && fromPx ? (
            <Circle
              cx={fromPx.x}
              cy={fromPx.y}
              r={14}
              fill={arcColor}
              opacity={0.14}
            />
          ) : null}
          {fromPx ? (
            <Circle
              cx={fromPx.x}
              cy={fromPx.y}
              r={sameCountry ? 5 : 3.5}
              fill={arcColor}
              stroke="#ffffff"
              strokeWidth={1}
            />
          ) : null}
          {toPx && !sameCountry ? (
            <Circle
              cx={toPx.x}
              cy={toPx.y}
              r={3.5}
              fill={arcColor}
              stroke="#ffffff"
              strokeWidth={1}
            />
          ) : null}
        </G>
      </Svg>
      <View style={styles.flagOverlay} pointerEvents="none">
        {fromCode ? (
          <Text style={styles.flagEmoji} accessibilityLabel={nameFor(fromCode) ?? fromCode}>
            {flagFor(fromCode)}
          </Text>
        ) : (
          <View />
        )}
        {!sameCountry && toCode ? (
          <Text style={styles.flagEmoji} accessibilityLabel={nameFor(toCode) ?? toCode}>
            {flagFor(toCode)}
          </Text>
        ) : (
          <View />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  flagOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 5,
  },
  flagEmoji: {
    fontSize: 16,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
