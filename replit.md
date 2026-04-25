# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Same Same (Mobile App — brand "Echo", tagline "same same")
- **Type**: Expo (React Native)
- **Location**: `artifacts/same-same/`
- **Preview**: `/` (root)
- **Purpose**: Global visual matching game — post a daily-life photo, swipe through others, celebrate matches with strangers elsewhere. No text chat — connection is via opt-in anonymous social-handle exchange.

#### Features:
- Onboarding flow (3 steps with globe animation)
- Swipe screen: two photos side by side, swipe left/right to judge similarity
- Reveal screen: countries revealed, similarity score meter, country animation
- World Map: fill in countries as you match, region breakdown
- Profile: badges system, match history (Same Same / Recent Different), photo gallery
- Camera/upload: take a photo or pick from library for daily challenges
- Connect requests: opt-in anonymous handle exchange after a match
- AsyncStorage for local UI state; backend for the shared photo pool

#### Key Files:
- `app/_layout.tsx` — root layout with providers
- `app/index.tsx` — redirect to onboarding or tabs
- `app/onboarding.tsx` — 3-step onboarding
- `app/(tabs)/match.tsx` — main swipe screen (real candidates in production, synthetic in dev)
- `app/(tabs)/map.tsx` — world map
- `app/(tabs)/profile.tsx` — profile/stats
- `app/reveal.tsx` — post-swipe reveal
- `app/camera.tsx` — photo upload (also fire-and-forget uploads to backend)
- `context/AppContext.tsx` — global UI state with AsyncStorage
- `utils/api.ts` — backend client (deviceId auth, uploadPhoto, fetchCandidates, votePhoto, reportPhoto)
- `data/samplePhotos.ts` — dev-only sample/synthetic photo generator (gated by `ENABLE_SYNTHETIC_MATCHES` = `__DEV__`)
- `constants/colors.ts` — dark theme (navy + coral + teal) plus design tokens: `radii` scale (sm/md/lg/xl/pill), `shadows` recipes (sm/md/lg/glowPrimary/glowAccent — work cross-platform via `shadow*` + `elevation`), `gradients` pairs (primary/warm/surface/surfaceElevated/hero/challenge), and layered surface colors (`bgElevated`, `bgElevated2`, `cardElevated`, `borderSubtle`)
- `components/Surface.tsx` — drop-in card with elevation + radius + bg, no behavior
- `components/PressableScale.tsx` — drop-in for `TouchableOpacity`, springs inward on press via reanimated, optional haptic tap
- `components/GradientCard.tsx` — drop-in card with two-tone gradient + shadow + radius
- `hooks/useCountUp.ts` — animated integer counter (ease-out cubic) for hero stats

### API Server
- **Type**: Express (TypeScript) on `artifacts/api-server/`
- **Endpoints powering Echo**:
  - `POST /api/analyze-photo` — Gemini-powered theme + tags from an image
  - `POST /api/photos` — upload (analyze + persist with 30-day TTL)
  - `GET  /api/photos/candidates` — ranked match pool, excludes own/voted/expired/over-reported
  - `POST /api/photos/:id/vote` — record a same/different verdict
  - `POST /api/photos/:id/report` — flag a photo (3 reports → hidden pending review)

## Photo Storage Architecture (Phase 1)

- **Identity**: anonymous device ID (UUID generated client-side, persisted in AsyncStorage, sent as `X-Device-Id` header). Resolved server-side to a `users` row. Clerk Google sign-in is planned for Phase 2.
- **Storage**: photos are kept as base64 inline in the `photos.bytes_base64` column with an 8 MB binary cap. Object storage is the next-step migration when scale demands it.
- **Schema** (`lib/db/src/schema/`): `users`, `photos`, `votes`, `reports`. Photos carry `theme` (text), `tags` (text[]), `country_code`, `expires_at` (now + 30 days), `status` (active/removed/pending_review), `report_count`, and an unused `embedding vector(768)` column reserved for a future similarity-search upgrade.
- **Matching**: SQL-based scoring on tag overlap + theme equality/substring with a small random jitter for ordering variety. The Replit Gemini AI Integrations proxy does **not** support embeddings (`embedContent` returns `INVALID_ENDPOINT`), so the `pgvector` column stays nullable and unused for now — wire OpenAI embeddings (or another provider) in if/when fuzzier matching is needed.
- **Moderation**: report-based hiding (`REPORT_HIDE_THRESHOLD = 3`). The `reports` table has a unique `(reporter_user_id, photo_id)` index and the report endpoint uses `onConflictDoNothing` + skips the count bump on conflict, so the threshold can only be reached by 3 distinct reporters. Pre-upload Gemini safety check is Phase 2.
- **Retention**: 30 days for free users (Pro paywall + extended retention is Phase 3). A background expiry job is also Phase 3 — for now `expires_at` filtering at query time is sufficient.

## Future Ideas (post-launch backlog)

- **User-recorded vibe audio**: when uploading a photo, let users optionally record their own audio clip (matching the same length as the existing music clips) instead of picking from the music library. Could be them talking, singing, ambient sound, or live music. Plays back on the card the same way the music clips do. Adds a "moment" feel that pre-recorded music can't match. (Captured during Play Store submission; ship after first internal-test cycle.)
- **Pro tier (paywall)**: paid upgrade. Initial perks idea: photos kept indefinitely (vs. 30-day auto-delete on free), possibly extra daily uploads and special themes. Phase 3 in the storage architecture notes above. (Captured during Play Store submission; design + pricing TBD before build.)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
