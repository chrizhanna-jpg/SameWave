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
- **Schema** (`lib/db/src/schema/`): `users`, `photos`, `votes`, `reports`. Photos carry `theme` (text), `tags` (text[]), `shape_tags` (text[], constrained vocabulary for visual form), `subjects` (text[], free-form concrete nouns extracted by Gemini at upload — e.g. `["apple","sculpture","park"]` — heaviest single matching axis: 3 pts × min(overlap, 5) = 0..15), `country_code`, `expires_at` (now + 30 days), `status` (active/removed/pending_review), `report_count`, and an unused `embedding vector(768)` column reserved for a future similarity-search upgrade. `POST /api/photos/backfill-subjects` (X-Admin-Token: BACKFILL_ADMIN_TOKEN) populates the column for legacy rows; sentinel values `_none` / `_failed` are written so the loop converges.
- **Matching**: SQL-based scoring on tag overlap + theme equality/substring with a small random jitter for ordering variety. The Replit Gemini AI Integrations proxy does **not** support embeddings (`embedContent` returns `INVALID_ENDPOINT`), so the `pgvector` column stays nullable and unused for now — wire OpenAI embeddings (or another provider) in if/when fuzzier matching is needed.
- **Moderation**: report-based hiding (`REPORT_HIDE_THRESHOLD = 3`). The `reports` table has a unique `(reporter_user_id, photo_id)` index and the report endpoint uses `onConflictDoNothing` + skips the count bump on conflict, so the threshold can only be reached by 3 distinct reporters. Pre-upload Gemini safety check is Phase 2.
- **Retention**: 30 days for free users; signed-in users get permanent retention (free, anchored to Clerk authId). A background expiry job is Phase 3 — for now `expires_at` filtering at query time is sufficient.

## Billing — SameWave Pro (RevenueCat)

- **What's paid**: a single £1 one-time, lifetime unlock that removes the share-card watermark, switches reveal/echo-pair to a stacked full-size photo layout, and ships higher-resolution exports. Photo retention is **free** (anchored to Clerk authId, see Auth section). Socials exchange is free.
- **Provider**: RevenueCat (`@replit/revenuecat-sdk` for the seed script, `react-native-purchases` for the client). The Replit RevenueCat connector is wired up via `proposeIntegration` and the OAuth token is injected automatically.
- **Modelled as**: non-consumable IAP — bought once, unlocks forever. Same product identifier (`samewave_pro`) on iOS App Store and Google Play (not `productId:basePlanId` — that's subscriptions only). Test Store mirrors the same SKU at £1.00 GBP.
- **Entities** (seeded by `pnpm --filter @workspace/scripts run seed:revenuecat`): project `SameWave`; one app per store (Test / App Store / Play Store) all on bundle/package `app.echo.samesame`; one product per app; entitlement `pro`; offering `default` (set as current); package `lifetime` containing all three products.
- **Public API key selection** (`artifacts/same-same/lib/revenuecat.tsx`): Expo Go (`Constants.executionEnvironment === "storeClient"`), web preview, and `__DEV__` all use the Test Store key — only native production builds hit Play Billing / StoreKit. Keys ship as `EXPO_PUBLIC_REVENUECAT_*_API_KEY` (public, safe to inline in `eas.json`).
- **Mirroring**: `RevenueCatProBridge` in `app/_layout.tsx` mirrors `customerInfo.entitlements.active["pro"]` onto `AppContext.proUnlocked` via the new `setProUnlocked` setter, but only after the SDK has actually returned a CustomerInfo object (`hasResolvedEntitlements`). This avoids revoking Pro on cold start before bootstrap completes, or permanently if the bootstrap fails offline.
- **Paywall UX** (`app/reveal.tsx`): never hardcode the price — pull `priceString` from `offerings.current.availablePackages[0].product.priceString`. Restore link is required by Apple's review guidelines and useful for re-installs / new-device sign-ins.

## Production Auth Quirks (Replit-managed Clerk)

- **Clerk SDK MUST be proxied in production builds.** The `pk_live_*` Clerk publishable key Replit auto-provisions points the Frontend API at `clerk.<your-app>.replit.app`, which is a TWO-LEVEL subdomain under `replit.app`. Replit's wildcard TLS cert only covers ONE level (`*.replit.app`), so Android (and any strict TLS client) rejects the cert and the SDK's environment fetch hangs forever — manifesting as a black screen after the splash. Fix: set `proxyUrl="https://<api-domain>/api/__clerk"` on `<ClerkProvider>` so the SDK, OAuth handshake, and token refresh all route through the api-server's `clerkProxyMiddleware` on the single-level main domain (which IS covered by the wildcard cert). See the long comment block in `artifacts/same-same/app/_layout.tsx`. Dev (Expo Go) leaves `proxyUrl` undefined and talks straight to the test instance on `*.clerk.accounts.dev`, which has its own valid cert.
- **Boot gate, not `<ClerkLoaded>`.** `<ClerkLoaded>` returns null until ready with no fallback for the never-ready case. We use a custom `ClerkBootGate` that shows a branded loading spinner during the wait and an actionable "Can't reach SameWave / Try again" screen if Clerk hasn't bootstrapped within 8 s — so a future TLS / proxy / network failure can never brick users at a black screen again.

## Future Ideas (post-launch backlog)

- **User-recorded vibe audio**: when uploading a photo, let users optionally record their own audio clip (matching the same length as the existing music clips) instead of picking from the music library. Could be them talking, singing, ambient sound, or live music. Plays back on the card the same way the music clips do. Adds a "moment" feel that pre-recorded music can't match. (Captured during Play Store submission; ship after first internal-test cycle.)

## Post-Launch Admin / Legal Reminders

- **Register the "SameWave" trademark in the UK once the app is live and being used.** The brand name is the single most valuable thing to protect — copyright on code is automatic, but the name needs an active registration to stop competitors. Cost is around £170 for a self-filed application (no solicitor needed). Steps:
  1. Search the existing register first at https://www.gov.uk/search-for-trademark — confirm "SameWave" is free in the relevant classes.
  2. File at https://www.gov.uk/how-to-register-a-trade-mark in **Class 9** (downloadable mobile applications / software) and **Class 42** (software-as-a-service / SaaS). Both classes together typically cost ~£200.
  3. Optional: file the **logo** as a separate figurative trademark if you want the artwork itself protected.
  4. EU and US filings are separate and significantly more expensive (£600+ each); only worth doing once there's traction in those markets.
- **What is NOT protectable** and never will be: the *concept* of an anonymous photo-matching app, generic UI patterns (swipe, infinite scroll), or descriptive phrases like "find your photo twin". A competitor building a clone under a different name is legal — the trademark only stops them using the SameWave name or a confusingly similar one.
- **Software patents**: not worth pursuing for this app. Hard to obtain in the UK/EU, expensive in the US, and the underlying matching concept isn't novel enough to be patentable.
- **Action trigger**: do the trademark search + filing within the first month of being live, before any press coverage or organic growth makes the name a target.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
