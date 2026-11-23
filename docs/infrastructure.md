# SameWave — infrastructure & hosting

Where the app runs in production, what each service does, and rough capacity
on **free / hobby** tiers. User counts are approximate; upgrade paths are
noted where the repo calls them out.

**Production API:** `https://samewave.onrender.com`  
**Android package:** `echo.samewaveripple.app`  
**iOS bundle:** `echo.samewaveripple.app`  
**Package rename checklist:** [PACKAGE_RENAME_APP_ECHO_SAMEWAVE.md](./PACKAGE_RENAME_APP_ECHO_SAMEWAVE.md)

---

## Architecture

```mermaid
flowchart TB
  subgraph clients [User devices]
    App[SameWave app\nExpo / React Native]
  end

  subgraph stores [App stores]
    Play[Google Play]
    Apple[App Store / TestFlight]
  end

  subgraph build [Build pipeline]
    EAS[EAS builds]
    Gradle[Local Gradle optional]
  end

  subgraph hosted [Hosted services]
    Render[samewave.onrender.com\napi-server]
    Neon[(Neon Postgres\n+ pgvector)]
    R2[(Cloudflare R2\nphoto objects, optional)]
    Clerk[Clerk auth]
    OpenAI[OpenAI API]
    RC[RevenueCat]
    ExpoPush[Expo Push\nexp.host]
  end

  EAS --> Play
  Gradle --> Play
  EAS --> Apple
  Play --> App
  Apple --> App

  App --> Render
  App --> Clerk
  App --> RC
  RC --> Play
  RC --> Apple

  Render --> Neon
  Render --> R2
  Render --> Clerk
  Render --> OpenAI
  Render --> ExpoPush
  ExpoPush --> App
```

**Auth path in production:** the mobile app talks to Clerk through a proxy on
Render (`/api/__clerk` → `frontend-api.clerk.dev`). See
`artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`.

---

## Services at a glance

| Service | What it's for | Approx. user / capacity (free–hobby tier) |
|--------|----------------|-------------------------------------------|
| **Expo / React Native** | Client app on device | Unlimited installs |
| **Google Play** | Android distribution | Unlimited public users; closed test needs **12 testers × 14 days** (new personal accounts) |
| **Apple App Store / TestFlight** | iOS distribution | Unlimited at store scale; TestFlight has Apple tester limits |
| **EAS (Expo Application Services)** | Cloud signing & builds | **~30 builds/month** (pipeline, not MAU) |
| **Expo Updates (OTA)** | JS updates without store release | **~1,000 MAU** on free EAS Update — **mostly disabled** in this project (`checkAutomatically: "NEVER"`) |
| **Android Studio + Gradle** | Local AAB builds (optional) | Dev machine only |
| **Clerk** | Sign-in, sessions, user identity | **~50,000 MAU** (Hobby) |
| **Google Cloud / Google Sign-In** | OAuth for Android | Same order of magnitude as Clerk MAU |
| **Render** | Hosts Node `api-server` | **~low hundreds concurrent** on free; **no hard MAU** — **5 GB egress/mo**, sleeps after **~15 min** idle |
| **Neon** | Production Postgres + vectors | **~60,000 MAU** (vendor); **~dozens–low hundreds of heavy photo users** in practice (**0.5 GB** storage) while bytes stay in the database |
| **Cloudflare R2** | Optional photo object storage (S3 API). Off until all five `R2_*` vars are set | Object storage; public reads via `R2_PUBLIC_BASE_URL` |
| **Docker + Postgres** | Local dev database only | Not production |
| **OpenAI API** | Photo analysis (themes, tags, shapes) | **Budget-limited** (pay per request) |
| **RevenueCat** | IAP entitlements (`pro`) | Free until **~$2,500/mo** tracked revenue, then **1%** |
| **Google Play Billing** | Store purchases (`samewave_pro`) | Unlimited buyers (Google scales) |
| **Apple IAP** (via RevenueCat) | iOS purchases | Unlimited buyers at store scale |
| **Expo Push** (`exp.host`) | Push notifications | **~600 notifications/sec** per project; free to send; server batches **100/call** |

### Not used for production hosting

| Item | Notes |
|------|--------|
| **Vercel, Supabase, Firebase (runtime), Sentry** | No deploy config in repo |
| **Static web** (`expo export` + `server/serve.js`) | Self-hosted only; no cloud host documented |
| **Unsplash / incompetech.com** | Demo images and royalty-free music URLs only |

---

## Client & distribution

### Expo / React Native (client)

- **Purpose:** SameWave UI — camera, matching, echoes, atlas — on iOS and Android.
- **Config:** `artifacts/same-same/` (`app.json`, `app.config.js`, `eas.json`).
- **Capacity:** No hosting cap; each install runs locally and calls the API.

### Google Play

- **Purpose:** Primary Android distribution (internal → closed → production).
- **Capacity:** Effectively unlimited public installs.
- **Docs:** [play-store-go-live.md](./play-store-go-live.md), `artifacts/same-same/CLOSED_TESTING_CHECKLIST.md`.

### Apple App Store / TestFlight

- **Purpose:** iOS distribution; bundle `echo.samewaveripple.app`.
- **Capacity:** Store-scale; increment `ios.buildNumber` per upload.

### EAS (Expo Application Services)

- **Purpose:** Cloud builds, credentials, submit to stores.
- **Project ID:** `435d5953-8fbe-48a4-9b0c-85096db24c53` (`app.json`).
- **Capacity:** Free tier **~30 cloud builds/month** (resets monthly). Local builds on Windows use Gradle scripts instead of EAS cloud on native Windows.

### Expo Updates (OTA)

- **Purpose:** Over-the-air JS updates (`https://u.expo.dev/...`).
- **This repo:** Updates channel configured but **auto-check disabled** — store releases are the main delivery path.

---

## Authentication

### Clerk

- **Purpose:** Sign-in, sessions; `@clerk/expo` on client, `@clerk/express` on API.
- **Production:** Proxy via `EXPO_PUBLIC_CLERK_PROXY_URL` → `https://samewave.onrender.com/api/__clerk`.
- **Capacity:** **~50,000 MAU** on Clerk Hobby (free).
- **Launch:** Switch from `pk_test_` / `sk_test_` to **`pk_live_` / `sk_live_`** before public launch.

### Google Sign-In (Google Cloud)

- **Purpose:** Android OAuth; Play App Signing SHA-1/256 in Cloud Console.
- **Allowlist:** `echo.samewaveripple.app://callback` in Clerk.

---

## Backend & data

### Render — `samewave.onrender.com`

- **Purpose:** Hosts `artifacts/api-server` — REST API, Clerk proxy, OpenAI analysis, push sender, health checks.
- **Capacity (free web service):** **~750 instance hours/month**, **5 GB** outbound bandwidth, **cold start** after idle sleep. Fine for closed testing; upgrade for always-on production traffic.
- **Setup:** Env vars from `artifacts/api-server/.env.render.example` (no `render.yaml` in repo — manual service config).

### Neon — Postgres

- **Purpose:** Users, photos, echoes, matches, push tokens; **pgvector** for embeddings (768-d).
- **Connection:** `DATABASE_URL` with `?sslmode=require`.
- **Capacity (free):** **~60,000 MAU** (Neon marketing limit) but **0.5 GB storage** is the practical cap while photo bytes live in the database. With R2 configured, new uploads store object keys only.

### Cloudflare R2 (optional)

- **Purpose:** JPEG and custom-audio bytes for new uploads. Postgres keeps `original_key`, `display_key`, `deck_preview_key`, `audio_key`, and `content_prefix_md5`.
- **Off by default:** if any of the five `R2_*` variables is missing, uploads and reads stay on base64 columns.
- **Reads:** `GET /api/photos/:id/image` proxies object bytes (ETag, 304, `?w=` resize). Echo `uri` values are the public object URL when a key exists, and a `data:` URI when the bytes are still in Postgres. Deck `previewUri` stays a `data:` URI.
- **Bucket:** public read via the r2.dev subdomain or a custom domain whose origin is `R2_PUBLIC_BASE_URL`. Writes use the S3 API key. The React Native app does not need CORS. Stock `stock_%` rows stay on Unsplash and are not copied.

### Docker Compose (local only)

- **Purpose:** `postgres:16-alpine` on port 5432 for local dev (`artifacts/api-server/docker-compose.yml`).
- **Not** used for production API hosting.

---

## AI

### OpenAI API

- **Purpose:** `analyzePhoto` / `POST /api/analyze-photo` — themes, tags, shapes, subjects.
- **Config:** `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` (Azure-compatible).
- **Capacity:** Pay-per-use; monitor quota and cost as uploads grow.

---

## Payments

### RevenueCat

- **Purpose:** Unified IAP — entitlement `pro`, offerings, customer info.
- **Capacity:** Free under **~$2,500/month** tracked revenue; then **1%** of revenue.
- **Keys:** `EXPO_PUBLIC_REVENUECAT_*` (client), `REVENUECAT_SECRET_API_KEY` (scripts).

### Google Play Billing

- **Purpose:** In-app product **`samewave_pro`** (lifetime Pro, **£1.00 GBP** in docs).
- **Capacity:** Store-managed; unlimited purchasers.

### Apple In-App Purchase

- **Purpose:** iOS purchases via RevenueCat.
- **Capacity:** Store-managed.

See [play-store-go-live.md](./play-store-go-live.md) for Play Console + RevenueCat wiring.

---

## Push notifications

### Expo Push Notification service

- **Purpose:** Server sends to `https://exp.host/--/api/v2/push/send`; client registers tokens via `expo-notifications`.
- **Implementation:** `artifacts/api-server/src/lib/push.ts` (up to **100 messages per request**).
- **Capacity:** **~600 notifications/second** per project; no per-user fee.
- **Note:** No direct FCM/APNs integration in server code — Expo abstracts delivery.

---

## Key environment variables

| Area | Variables | Where documented |
|------|-----------|------------------|
| Client → API | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_DEV_API_URL` | `artifacts/same-same/.env.example` |
| Clerk (client) | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CLERK_PROXY_URL` | `.env.example`, `eas.json` |
| RevenueCat | `EXPO_PUBLIC_REVENUECAT_*` | `.env.example` |
| API (Render) | `DATABASE_URL`, `CLERK_*`, `OPENAI_*`, `PORT` | `artifacts/api-server/.env.example`, `.env.render.example` |
| Photo objects (optional) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | `artifacts/api-server/.env.example`, `.env.render.example` |

Production builds in `eas.json` point at `https://samewave.onrender.com` and the Clerk proxy on the same host.

---

## Operational limits (from code & docs)

| Limit | Value | Source |
|-------|--------|--------|
| HTTP JSON body | **12 MB** (other routes). Photo upload allows base64 headroom above a **5 MB** original and returns **413** past that | `api-server` Express config, `photoLimits.ts` |
| Photo upload (binary) | **5 MB** decoded original (`MAX_PHOTO_BYTES`) | `api-server` `POST /api/photos` |
| Photo sends | **30 per account per rolling 24 hours** (`MAX_PHOTOS_PER_DAY`). Delete does not refund | `photo_send_log` plus live `photos` rows |
| API client timeout | **30 s** | `artifacts/same-same/utils/api.ts` |
| Clerk UI boot timeout | **8 s** | `app/_layout.tsx` |
| Expo Push batch | **100** per API call | `api-server/src/lib/push.ts` |
| Render cold start | After **~15 min** idle (free) | Preflight / ops notes |

---

## Practical bottleneck

On the **current architecture** (photo bytes in Postgres until R2 env vars are set, API on Render free):

1. **Neon storage (0.5 GB)** — limits total photo volume before MAU limits on Clerk or Play matter.
2. **Render sleep + single instance** — cold starts and concurrency during spikes.
3. **OpenAI cost** — scales with every analyzed upload.

**Scaling path (when needed):** paid Neon + always-on Render (or another host). New photo bytes can move to R2 by setting the five `R2_*` variables; old test rows are cleared with `artifacts/api-server/scripts/clear-test-photo-bytes.sql` (not run on boot). `GET /api/photos/:id/image` keeps returning bytes.

---

## Related docs

- [play-store-go-live.md](./play-store-go-live.md) — Play Billing, RevenueCat, testers
- `artifacts/same-same/ANDROID_STUDIO_AND_CLOSED_TESTING.md` — local Android builds
- `artifacts/same-same/CLOSED_TESTING_CHECKLIST.md` — pre-launch checklist
- `artifacts/api-server/.env.example` — full API env reference
