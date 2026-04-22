// Stable identity for a photo URI used by every dedup surface in the app.
// Two URIs that point at the same image must produce the same key, even if
// they differ in query string, trailing slash, or (for data: URIs) any
// trailing transcoding noise.
//
// Rules:
//   - Unsplash images.unsplash.com/photo-XYZ?…  → "photo-XYZ"
//   - data:…base64,…                            → "data-<hash of first 256
//                                                   chars of the payload>"
//   - everything else                            → URI minus query string
//                                                   and trailing slash
export function photoKey(uri: string | undefined | null): string {
  if (!uri) return "";
  if (uri.startsWith("data:")) {
    // FNV-1a over the first 256 chars — enough entropy to distinguish
    // independently-uploaded photos without holding the entire payload.
    const slice = uri.slice(0, 256);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < slice.length; i++) {
      h ^= slice.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `data-${(h >>> 0).toString(36)}`;
  }
  const noQuery = uri.split("?")[0].replace(/\/+$/, "");
  const unsplash = noQuery.match(/\/(photo-[A-Za-z0-9_-]+)/);
  if (unsplash) return unsplash[1];
  return noQuery;
}
