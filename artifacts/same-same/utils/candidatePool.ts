import type { SamplePhoto } from "@/data/samplePhotos";
import { photoKey } from "@/utils/photoKey";

/** Dedupe live + supplemental pools by stable image key. */
export function mergeCandidatePools(
  primary: SamplePhoto[],
  extra: SamplePhoto[],
): SamplePhoto[] {
  const seen = new Set<string>();
  const out: SamplePhoto[] = [];
  for (const p of [...primary, ...extra]) {
    const k = photoKey(p.uri);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
