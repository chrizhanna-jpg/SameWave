# Image loading contract (free-server)

Client-first pipeline with **two asset classes**: static sample photos (Unsplash CDN) and versioned user uploads (`/api/photos/:id/image`). See also sample vs user split below.

## Asset classes

### Sample photos (app-provided)

| Property | Value |
|----------|--------|
| **Hosting** | `https://images.unsplash.com/photo-{id}` (Unsplash CDN — static edge cache) |
| **In-app registry** | `data/samplePhotos.ts` (~28+ curated deck entries) |
| **Server stock rows** | `stock_*` ids resolve to same Unsplash CDN via `stockPhotoCdn.ts` |
| **Cache-Control** | Unsplash CDN: long-lived public cache; client adds `auto=format&fit=crop&q=80` |
| **Versioning** | Stable Unsplash photo id in URL path (immutable per asset) |
| **Prefetch** | 12 URIs on first launch, 6 on subsequent (`sampleAssetPrefetch.ts`) |
| **Target hit rate** | ≥ **95%** sample cache hits after first launch |

### User uploads

| Property | Value |
|----------|--------|
| **Endpoint** | `GET /api/photos/{photoId}/image?w={width}` |
| **Versioning** | Photo `id` (UUID) — new upload = new id |
| **Cache-Control** | `private, max-age=3600, stale-while-revalidate=86400` |
| **Validation** | `ETag` + `Last-Modified`; client sends `If-None-Match` in background |
| **304 responses** | Cheap freshness check without re-downloading bytes |
| **Upload** | Client pre-encodes 960w + 480w before POST (skips server Sharp) |
| **Target hit rate** | ≥ **70%** disk cache hits on repeat views |

## Client vs server

| Step | Where | Notes |
|------|--------|------|
| Sample cold-start prefetch | **Client** | `prefetchSampleAssetsOnColdStart()` on app launch |
| Resize/compress at upload | **Client** | 960w display, 480w preview, 240w thumb JPEG |
| Persist encoded sizes | **Server** | Uses client `displayBase64` + `deckPreviewBase64` when sent |
| Stream thumbnails | **Server** | Pre-encoded bytes + ETag; 304 on `If-None-Match` |
| Disk/memory cache | **Client** | expo-image `memory-disk` + metadata index v2 |
| Background validation | **Client** | `validateUserPhotoInBackground()` after cache-hit loads |
| Telemetry batch | **Client → Server** | Split sample/user counters every 5 min |

## Thumbnail sizes

| Asset | Width | Format |
|-------|-------|--------|
| Sample deck hero | 480px | WebP/JPEG via `auto=format` |
| User upload stream | 320–480px | JPEG (pre-encoded at upload) |
| Waves feed | 320px | `?w=320` |

## Cache policy

- **Sample bytes**: expo-image disk + Unsplash CDN edge cache.
- **User bytes**: expo-image disk; metadata index max **500** URIs (LRU).
- **Memory index**: max **64** entries.
- **Hit heuristic**: load ≤ **120ms** → cache hit.
- **User ETag store**: per-URI in metadata index (`samesame_img_cache_index_v2`).

## Telemetry events

| Event | Asset | When |
|-------|-------|------|
| `img_sample_cache_hit` / `_miss` | Sample | Latency-based |
| `img_user_cache_hit` / `_miss` | User | Latency-based |
| `img_conditional_304` | User | Background `If-None-Match` returned 304 |
| `img_sample_prefetch_batch` | Sample | Cold-start prefetch batch |
| `img_blank_frame` | Both | Skeleton >800ms |

**Dashboards**

- `GET /api/telemetry/image-summary` → `sampleCacheHitRate`, `userCacheHitRate`
- Platform admin stats → `imageTelemetry` object
- Client: `getImageTelemetrySummary()`

## Feature flag & canary

```bash
EXPO_PUBLIC_IMAGE_LOAD_V2=true
```

**SLO gates for full rollout**

- Sample cache hit rate ≥ **95%**
- User thumbnail cache hit rate ≥ **70%**
- Blank-frame events flat or down vs baseline

**Rollback**: unset flag (sample prefetch on launch still runs; telemetry/conditional GET/hero priority revert).

## QA checklist (canary)

1. **Cold start**: open app → matching tab; sample hero visible <400ms.
2. **Return to matching**: leave tab → return; hero <200ms (disk hit).
3. **Fresh user upload**: post photo → appears in deck <700ms first view.
4. **Waves feed**: no blank tiles; placeholder → image <500ms.
5. **Offline**: cached samples/user thumbs still render from disk.
6. **Telemetry**: `GET /api/telemetry/image-summary` shows `sampleCacheHitRate` >0.9 after session.

## Tests

```bash
cd artifacts/same-same
pnpm exec tsx scripts/test-image-load-cache.ts
pnpm exec tsx scripts/test-image-asset-class.ts
```

## Do not regress

- Sample prefetch runs on every app launch (deferred).
- User streams must return `ETag` + conditional 304 support.
- Hero: `priority="hero"`, `displayWidth=480`.
- Waves: `displayWidth=320`.
- Upload: always `prepareUploadImages()` before `uploadPhoto`.
