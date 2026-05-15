import { geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import land110 from "world-atlas/land-110m.json";

const topo = land110 as unknown as Topology;

/** GeoJSON land Feature derived from Natural Earth 110m (world-atlas). */
export const atlasLandGeoFeature = feature(
  topo,
  topo.objects.land as GeometryCollection,
);

/**
 * SVG path `d` for world land, projected with the same {@link GeoProjection}
 * as arcs and centroids (Equal Earth).
 */
export function atlasLandPathD(projection: GeoProjection): string {
  const gen = geoPath(projection);
  const d = gen(atlasLandGeoFeature as Parameters<typeof gen>[0]);
  return typeof d === "string" && d.length > 0 ? d : "";
}
