/**
 * Point-in-polygon checks against the bundled Natural Earth countries-110m
 * atlas (via world-atlas). Used by the centroid validation test and the
 * location diagnostic — not for runtime map drawing.
 */
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries110 from "world-atlas/countries-110m.json";

import { ALPHA2_TO_ISO_NUMERIC } from "./isoNumeric";

/**
 * Codes whose centroids are intentionally absent from countries-110m
 * (tiny islands / city-states below the atlas resolution, or the fictional
 * "Somewhere" ZZ pin). The validation test skips these instead of failing.
 */
export const ATLAS_POLYGON_EXCEPTIONS: ReadonlySet<string> = new Set([
  "ZZ", // fictional open-ocean fallback
  "MT",
  "SG",
  "HK",
  "MV",
  "BH",
  "CV",
  "ST",
  "KM",
  "SC",
  "MU",
  "BB",
  "LC",
  "VC",
  "GD",
  "AG",
  "DM",
  "KN",
  "WS",
  "TO",
  "KI",
  "FM",
  "PW",
  "MH",
  "NR",
  "TV",
]);

type CountryFeat = {
  type: "Feature";
  id?: string | number;
  properties: { name: string };
  geometry: GeoJSON.Geometry;
};

let cached: CountryFeat[] | null = null;
let byNumeric: Map<string, CountryFeat> | null = null;
let kosovo: CountryFeat | null = null;

function load(): CountryFeat[] {
  if (cached) return cached;
  const topology = countries110 as unknown as Topology;
  const fc = feature(topology, topology.objects.countries as GeometryCollection);
  cached = fc.features as CountryFeat[];
  byNumeric = new Map();
  for (const f of cached) {
    if (f.id != null) byNumeric.set(String(f.id).padStart(3, "0"), f);
    if (f.properties?.name === "Kosovo") kosovo = f;
  }
  return cached;
}

/** Atlas polygon for an ISO alpha-2 code, or null when absent / exception. */
export function atlasCountryFeature(code: string): CountryFeat | null {
  load();
  const k = code.trim().toUpperCase();
  if (!k || ATLAS_POLYGON_EXCEPTIONS.has(k)) return null;
  if (k === "XK") return kosovo;
  const numeric = ALPHA2_TO_ISO_NUMERIC[k];
  if (!numeric || !byNumeric) return null;
  return byNumeric.get(numeric) ?? null;
}

/** True when [lng, lat] lies inside the country's atlas polygon. */
export function pointInAtlasCountry(
  code: string,
  lonLat: readonly [number, number],
): boolean {
  const feat = atlasCountryFeature(code);
  if (!feat) return false;
  return geoContains(feat, [lonLat[0], lonLat[1]]);
}

export function atlasCountryName(code: string): string | null {
  return atlasCountryFeature(code)?.properties?.name ?? null;
}
