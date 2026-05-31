import type { AtlasConnection } from "@/utils/api";
import {
  ATLAS_FIRE_WINDOW_MS,
  RIPPLEFIRE_MIN_COUNTRIES,
  RIPPLEFIRE_MIN_EVENTS,
} from "@/utils/atlasFireConfig";
import {
  connectionsInFireWindow,
  detectRipplefireClusters,
} from "@/utils/atlasWavefire";

export type RipplefireDiagnosticsReport = {
  generatedAt: string;
  fireWindowDays: number;
  apiRippleCount: number;
  apiWaveCount: number;
  ripplesInWindow: number;
  wavesInWindow: number;
  domesticRipplesInWindow: number;
  crossBorderRipplesInWindow: number;
  ripplefireClusterCount: number;
  largestClusterEvents: number;
  largestClusterCountries: number;
  clusterSummaries: Array<{
    displayTheme: string;
    events: number;
    countries: string[];
    domesticOnly: boolean;
  }>;
  orphanRipplesInWindow: number;
  missingCreatedAt: number;
  viewerCountryCode: string | null;
  hints: string[];
};

function parseCreatedMs(c: AtlasConnection): number {
  const t = Date.parse(c.createdAt);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Client-side Ripplefire report from Atlas connections (API + local merges).
 * Use in Atlas diagnostics UI to see why clusters / rings may not appear.
 */
export function buildRipplefireDiagnosticsReport(
  connections: AtlasConnection[],
  options?: {
    viewerCountryCode?: string;
    localRippleMergeCount?: number;
    fireWindowMs?: number;
  },
): RipplefireDiagnosticsReport {
  const windowMs = options?.fireWindowMs ?? ATLAS_FIRE_WINDOW_MS;
  const fireWindowDays = Math.round(windowMs / (24 * 60 * 60 * 1000));
  const apiRipples = connections.filter((c) => c.kind === "ripple");
  const apiWaves = connections.filter((c) => c.kind === "wave");
  const ripplesInWindow = connectionsInFireWindow(
    connections,
    windowMs,
    "ripple",
  );
  const wavesInWindow = connectionsInFireWindow(connections, windowMs, "wave");
  const domestic = ripplesInWindow.filter((c) => c.from === c.to);
  const crossBorder = ripplesInWindow.filter((c) => c.from !== c.to);
  const clusters = detectRipplefireClusters(
    connections,
    windowMs,
    RIPPLEFIRE_MIN_EVENTS,
    RIPPLEFIRE_MIN_COUNTRIES,
  );
  const clusteredIds = new Set(clusters.flatMap((cl) => cl.connections.map((c) => c.id)));
  const orphanRipples = ripplesInWindow.filter((c) => !clusteredIds.has(c.id));
  const missingCreatedAt = ripplesInWindow.filter(
    (c) => !Number.isFinite(parseCreatedMs(c)),
  ).length;

  const hints: string[] = [];
  if (connections.length === 0) {
    hints.push("No connections from API — sign in, refresh Atlas, or check API URL.");
  }
  if (ripplesInWindow.length === 0 && apiRipples.length > 0) {
    hints.push(
      `API has ${apiRipples.length} ripple(s) but none in the last ${fireWindowDays}d window — they may be older than the fire window.`,
    );
  }
  if (ripplesInWindow.length > 0 && clusters.length === 0) {
    hints.push(
      "Ripples exist in window but no Ripplefire cluster formed — check minEvents/minCountries thresholds.",
    );
  }
  if (domestic.length > 0 && clusters.every((cl) => cl.countryCodes.length < 2)) {
    hints.push(
      "Domestic-only ripples (same country both ends): need app build with single-country ring/arc fix (vc40+).",
    );
  }
  if (orphanRipples.length > 0) {
    hints.push(
      `${orphanRipples.length} in-window ripple(s) not in any cluster (solo theme buckets should still appear as clusters of 1).`,
    );
  }
  if (missingCreatedAt > 0) {
    hints.push(`${missingCreatedAt} ripple(s) missing valid createdAt — excluded from fire window.`);
  }

  const viewer = (options?.viewerCountryCode ?? "").trim().toUpperCase();
  if (viewer && /^[A-Z]{2}$/.test(viewer)) {
    const mineRipples = ripplesInWindow.filter((c) => c.mine === true);
    if (mineRipples.length === 0 && (options?.localRippleMergeCount ?? 0) === 0) {
      hints.push(
        "No ripples marked mine in API — set profile country or check same-country merge.",
      );
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    fireWindowDays,
    apiRippleCount: apiRipples.length,
    apiWaveCount: apiWaves.length,
    ripplesInWindow: ripplesInWindow.length,
    wavesInWindow: wavesInWindow.length,
    domesticRipplesInWindow: domestic.length,
    crossBorderRipplesInWindow: crossBorder.length,
    ripplefireClusterCount: clusters.length,
    largestClusterEvents: clusters[0]?.connections.length ?? 0,
    largestClusterCountries: clusters[0]?.countryCodes.length ?? 0,
    clusterSummaries: clusters.slice(0, 8).map((cl) => ({
      displayTheme: cl.displayTheme,
      events: cl.connections.length,
      countries: cl.countryCodes,
      domesticOnly: cl.countryCodes.length <= 1,
    })),
    orphanRipplesInWindow: orphanRipples.length,
    missingCreatedAt,
    viewerCountryCode: viewer || null,
    hints,
  };
}
