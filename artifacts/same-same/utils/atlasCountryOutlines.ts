import { geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";

import { ISO3166_NUMERIC_3_TO_ALPHA2 } from "@/data/atlasIso3166NumericToAlpha2";

import countries110 from "world-atlas/countries-110m.json";

type CountryFeature = {
  type: "Feature";
  id?: string | number;
  geometry: { type: string } | null;
  properties?: Record<string, unknown>;
};

let featuresByAlpha2: Map<string, CountryFeature> | null = null;

function padNumericId(id: unknown): string {
  const n = typeof id === "number" ? id : Number(String(id));
  if (!Number.isFinite(n)) return "";
  return String(Math.trunc(n)).padStart(3, "0");
}

function loadCountryFeatures(): Map<string, CountryFeature> {
  if (featuresByAlpha2) return featuresByAlpha2;
  const topo = countries110 as unknown as Topology;
  const fc = feature(topo, topo.objects.countries) as {
    features: CountryFeature[];
  };
  const map = new Map<string, CountryFeature>();
  for (const f of fc.features) {
    const pad = padNumericId(f.id);
    if (!pad) continue;
    const a2 = ISO3166_NUMERIC_3_TO_ALPHA2[pad];
    if (!a2 || a2.length !== 2 || !f.geometry) continue;
    map.set(a2.toUpperCase(), f);
  }
  featuresByAlpha2 = map;
  return map;
}

/** SVG path `d` for one ISO alpha-2 country at the current projection. */
export function atlasCountryPathD(
  projection: GeoProjection,
  code: string,
): string | null {
  const k = code.trim().toUpperCase();
  if (k.length !== 2) return null;
  const f = loadCountryFeatures().get(k);
  if (!f?.geometry) return null;
  const gen = geoPath(projection);
  const d = gen(f as Parameters<typeof gen>[0]);
  return typeof d === "string" && d.length > 0 ? d : null;
}

/** Projected outlines for Wavefire cluster countries. */
export function atlasCountryPathsForCodes(
  projection: GeoProjection,
  codes: string[],
): { code: string; d: string }[] {
  const seen = new Set<string>();
  const out: { code: string; d: string }[] = [];
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (code.length !== 2 || seen.has(code)) continue;
    seen.add(code);
    const d = atlasCountryPathD(projection, code);
    if (d) out.push({ code, d });
  }
  return out;
}
