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

### Same Same (Mobile App)
- **Type**: Expo (React Native)
- **Location**: `artifacts/same-same/`
- **Preview**: `/` (root)
- **Purpose**: Global visual matching game — "Different places. Same people."

#### Features:
- Onboarding flow (3 steps with globe animation)
- Swipe screen: two photos side by side, swipe left/right to judge similarity
- Reveal screen: countries revealed, similarity score meter, country animation
- World Map: fill in countries as you match, region breakdown
- Profile: badges system, match history, photo gallery
- Camera/upload: take a photo or pick from library for daily challenges
- AsyncStorage persistence (no backend needed)

#### Key Files:
- `app/_layout.tsx` — root layout with providers
- `app/index.tsx` — redirect to onboarding or tabs
- `app/onboarding.tsx` — 3-step onboarding
- `app/(tabs)/index.tsx` — main swipe screen
- `app/(tabs)/map.tsx` — world map
- `app/(tabs)/profile.tsx` — profile/stats
- `app/reveal.tsx` — post-swipe reveal
- `app/camera.tsx` — photo upload
- `context/AppContext.tsx` — global state with AsyncStorage
- `data/samplePhotos.ts` — sample photos + daily challenges
- `constants/colors.ts` — dark theme (navy + coral + teal)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
