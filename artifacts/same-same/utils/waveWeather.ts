import { centroidLonLatForAtlas } from "@/utils/atlasCountryCentroids";
import { weatherWord } from "@/utils/waveCopy";

function dayKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Country-centroid weather only. Returns null when the lookup fails. */
export async function weatherAtCountry(
  countryCode: string | null | undefined,
  iso: string | null | undefined,
): Promise<string | null> {
  if (!countryCode || !iso) return null;
  const centroid = centroidLonLatForAtlas(countryCode);
  const day = dayKey(iso);
  if (!centroid || !day) return null;
  const [lon, lat] = centroid;
  const hour = new Date(iso).toISOString().slice(0, 13);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=weather_code&past_days=31&forecast_days=1&timezone=UTC`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      hourly?: { time?: string[]; weather_code?: number[] };
    };
    const times = body.hourly?.time ?? [];
    const codes = body.hourly?.weather_code ?? [];
    let best = -1;
    for (let i = 0; i < times.length; i++) {
      if ((times[i] ?? "").slice(0, 13) === hour) {
        best = i;
        break;
      }
    }
    if (best < 0) return null;
    return weatherWord(codes[best]);
  } catch {
    return null;
  }
}
