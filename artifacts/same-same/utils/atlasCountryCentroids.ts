import { geoCentroid } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";

import { ISO3166_NUMERIC_3_TO_ALPHA2 } from "@/data/atlasIso3166NumericToAlpha2";
import { COUNTRY_CENTROID_LON_LAT } from "@/data/countryCentroids";

import countries110 from "world-atlas/countries-110m.json";

let cached: Record<string, readonly [number, number]> | null = null;

type LonLatFeature = {
  id?: string | number;
  geometry: { type: string } | null;
};

function padNumericId(id: unknown): string {
  const n = typeof id === "number" ? id : Number(String(id));
  if (!Number.isFinite(n)) return "";
  return String(Math.trunc(n)).padStart(3, "0");
}

function buildFromWorldAtlas(): Record<string, readonly [number, number]> {
  const topo = countries110 as unknown as Topology;
  const fc = feature(topo, topo.objects.countries) as {
    features: LonLatFeature[];
  };
  const out: Record<string, readonly [number, number]> = {};
  for (const f of fc.features) {
    const pad = padNumericId(f.id);
    if (!pad) continue;
    const a2 = ISO3166_NUMERIC_3_TO_ALPHA2[pad];
    if (!a2 || a2.length !== 2) continue;
    if (!f.geometry) continue;
    const [lon, lat] = geoCentroid(f as Parameters<typeof geoCentroid>[0]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out[a2.toUpperCase()] = [lon, lat];
  }
  return { ...COUNTRY_CENTROID_LON_LAT, ...out };
}

function atlasCentroidTable(): Record<string, readonly [number, number]> {
  if (!cached) cached = buildFromWorldAtlas();
  return cached;
}

/**
 * Lon/lat for an ISO 3166-1 alpha-2 code: Natural Earth polygon centroids
 * (110m) when available, otherwise the static table in `countryCentroids.ts`.
 */
export function centroidLonLatForAtlas(
  code: string,
): readonly [number, number] | null {
  const k = code.trim().toUpperCase();
  if (k.length !== 2) return null;
  const t = atlasCentroidTable()[k];
  return t ?? null;
}
