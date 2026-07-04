# Image loading contract (free-server)

Client-first pipeline: resize/compress on device, skip server Sharp when possible, cache aggressively via expo-image + metadata index, prefetch conservatively, telemetry behind `EXPO_PUBLIC_IMAGE_LOAD_V2`.

## Client vs server

| Step | Where | Notes |
|------|--------|------|
| Resize/compress at upload | **Client** (`utils/uploadImageProcessing.ts`) | 960w display, 480w preview, 240w thumb JPEG |
| Persist encoded sizes | **Server** (`POST /api/photos`) | Uses client `displayBase64` + `deckPreviewBase64` when sent; else Sharp fallback |
| Stream thumbnails | **Server** (`GET /api/photos/:id/image?w=`) | Serves pre-encoded bytes; cold path still resizes |
| Disk/memory cache | **Client** (expo-image `memory-disk` + `imageLoadCache.ts` index) | Metadata LRU; bytes in expo-image cache |
| Prefetch | **Client** | Hero on tab focus; deck ahead N=3 when v2 flag on |
| Telemetry batch | **Client → Server** | `POST /api/telemetry/image-summary` every 5 min |

## Thumbnail sizes & compression

| Asset | Width | JPEG quality |
|-------|-------|--------------|
| Upload display | 960px | 0.82 |
| Deck preview (inline + hero) | 480px | 0.80 |
| Upload thumb | 240px | 0.78 |
| Waves feed tile request | 320px (`?w=320`) | server-encoded |

## Cache policy

- **Bytes**: expo-image `cachePolicy="memory-disk"` (platform-managed eviction).
- **Metadata index**: AsyncStorage `samesame_img_cache_index_v1`, max **500** URIs, LRU by `lastAccess`.
- **Memory index**: max **64** entries for fast hit/miss telemetry.
- **Cache hit heuristic**: load completes in **≤120ms** → hit.
- **HTTP**: `Cache-Control: private, max-age=86400, stale-while-revalidate=3600` on image streams.
- **Versioning**: photo `id` is the cache key; new upload = new id.

## Telemetry events

| Event | When |
|-------|------|
| `img_request_start` | RemotePhotoImage begins fetch |
| `img_request_end` | Load settled |
| `img_cache_hit` / `img_cache_miss` | Based on latency heuristic |
| `img_blank_frame` | Skeleton visible >800ms |
| `img_prefetch` | Background prefetch |
| `img_error` | Exhausted retry chain |

**Dashboard / logs**

- Client summary: `getImageTelemetrySummary()` in dev; persisted in AsyncStorage.
- Server aggregate: `GET https://samewave.onrender.com/api/telemetry/image-summary`
- Server logs: pino `image telemetry summary` on each batch POST.

## Feature flag & canary

Set in `.env` / EAS:

```bash
EXPO_PUBLIC_IMAGE_LOAD_V2=true
```

**Rollout**

1. Deploy API (client-encoded upload + telemetry route + longer cache headers).
2. Enable flag for internal builds → monitor `cacheHitRate` on telemetry endpoint.
3. Expand to 10% → 50% → 100% if:
   - Cache hit rate ≥ **70%** for returning users
   - Blank-frame events not increasing vs baseline
4. **Rollback**: unset `EXPO_PUBLIC_IMAGE_LOAD_V2` (upload processing still runs; only prefetch depth + telemetry + hero priority revert).

## Tests

```bash
cd artifacts/same-same
pnpm exec tsx scripts/test-image-load-cache.ts
pnpm exec tsx scripts/test-resolve-my-photo.ts
```

## Do not regress

- Hero images use `priority="hero"` and `displayWidth=480` on match/flash.
- Waves tiles use `displayWidth=320`.
- Upload always calls `prepareUploadImages` before `uploadPhoto`.
- PRs touching `RemotePhotoImage`, `imageLoadCache`, or `uploadImageProcessing` must run the test scripts above.
