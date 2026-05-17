/**
 * In-memory URIs for match/reveal cards. Candidate photos are often huge
 * base64 `data:` URLs; persisting them in AsyncStorage can truncate or
 * corrupt `theirPhoto`, and RN's stock Image fails on long data URIs while
 * expo-image handles them on the Match screen.
 */
const byMatchId = new Map<string, { myPhoto: string; theirPhoto: string }>();

export function stashMatchPhotoUris(
  matchId: string,
  myPhoto: string,
  theirPhoto: string,
): void {
  const id = matchId.trim();
  if (!id || !theirPhoto.trim()) return;
  byMatchId.set(id, { myPhoto, theirPhoto });
}

export function resolveMatchPhotoUris(
  matchId: string,
  fallback: { myPhoto: string; theirPhoto: string },
): { myPhoto: string; theirPhoto: string } {
  const hit = byMatchId.get(matchId);
  if (!hit) return fallback;
  return {
    myPhoto: hit.myPhoto || fallback.myPhoto,
    theirPhoto: hit.theirPhoto || fallback.theirPhoto,
  };
}
