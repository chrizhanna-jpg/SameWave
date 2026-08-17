# AGENTS.md

## Cursor Cloud specific instructions

This is the **SameWave** (aka SameSame) pnpm monorepo — a mobile photo-matching / "vibe"
social app. The runtime pieces you can develop and test in this environment are:

| Service | Package | Dev command (from repo root) | Port |
| --- | --- | --- | --- |
| API server (Express + Drizzle) | `@workspace/api-server` (`artifacts/api-server`) | `pnpm dev:api-server` | 8787 |
| Mobile app (Expo / React Native) | `@workspace/same-same` (`artifacts/same-same`) | `pnpm dev:mobile` (device) or web: `pnpm --filter @workspace/same-same exec expo start --web` | 8081 |
| Postgres 16 + pgvector | infra for `@workspace/db` + api-server | see "Database" below | 5432 |

The `dev:block-robots*` scripts in the root `package.json` are dead — no such packages
exist in the repo. `artifacts/mockup-sandbox` is an optional internal Vite design tool
(needs `PORT` and `BASE_PATH` env vars, or its `vite.config.ts` throws).

### Environment files (gitignored — recreate if missing)

`.env` files are gitignored, so they are **not** in the repo. The install/update script does
not create them. Two are needed for local dev; recreate from the committed `.env.example`
files if absent:

- `artifacts/api-server/.env`: set `PORT=8787`, `LISTEN_HOST=0.0.0.0`, and
  `DATABASE_URL=postgresql://samesame:samesame_dev@127.0.0.1:5432/samesame` (matches the
  docker-compose creds and the local Postgres set up below). `CLERK_*`, `OPENAI_API_KEY`,
  `RESEND_API_KEY` are optional — the server boots and serves public routes without them.
- `artifacts/same-same/.env`: point the app at the local backend with
  `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_HOSTED_API_URL`, and `EXPO_PUBLIC_DEV_API_URL` all
  set to `http://127.0.0.1:8787`, plus the committed `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
  from `.env.example`.

### Database (Postgres + pgvector)

Docker is not available here, so a **native** PostgreSQL 16 is used instead of the
`docker compose up -d` flow in `artifacts/api-server/docker-compose.yml` (same
credentials). The cluster may not auto-start on a fresh boot — start it and confirm the
role/db/extension exist:

```
sudo pg_ctlcluster 16 main start
# one-time (already done in the snapshot; safe to re-run):
sudo -u postgres psql -c "CREATE ROLE samesame LOGIN PASSWORD 'samesame_dev';"
sudo -u postgres psql -c "CREATE DATABASE samesame OWNER samesame;"
sudo -u postgres psql -d samesame -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

The schema uses the pgvector `vector(N)` type (see `lib/db/src/schema/_vector.ts`), so the
`vector` extension **must** exist in the `samesame` DB before pushing schema, or
`drizzle-kit push` fails with `type "vector" does not exist`. Apply the schema with:

```
pnpm --filter @workspace/db run push
```

`drizzle-kit push` reads `DATABASE_URL` from `artifacts/api-server/.env`. There are no SQL
migration files — schema is synced via push.

### Running & non-obvious caveats

- **api-server:** `pnpm dev:api-server` runs `scripts/dev.mjs`, which esbuild-**builds**
  then runs `dist/index.mjs` (it does not typecheck — see below). It loads
  `artifacts/api-server/.env`. Look for `Server listening` on port 8787. Public routes that
  work without Clerk: `/api/healthz`, `/api/public/backend-status`, `/api/public/app-config`,
  `/api/photos/atlas`, `/api/photos/atlas/:cc`.
- **Seeding core data without auth:** all write routes (`POST /api/photos`, votes, etc.)
  require Clerk — `resolveUserFromRequest` returns null when `CLERK_SECRET_KEY` is unset, so
  there is no device-id fallback in that case. To exercise the core Atlas/matching feature
  end-to-end without Clerk, run `pnpm --filter @workspace/api-server run seed:atlas-global`
  (idempotent) and read it back via `GET /api/photos/atlas`.
- **Mobile app auth is a hard blocker for authenticated screens:** the sign-in screen
  (`artifacts/same-same/app/sign-in.tsx`) only supports Google OAuth via Clerk (`useSSO`,
  `oauth_google`) with "no anonymous mode" by design. The committed `pk_test` Clerk dev
  instance does not have Google OAuth configured, so you cannot reach the main tabs (Atlas
  map, camera, feed) in this environment without the repo owner configuring Google OAuth in
  the Clerk dashboard (or providing working credentials). The pre-auth flow (onboarding →
  country picker → sign-in) renders fine and is the extent of UI testable here.
- **Expo web** is the only way to view the app UI here (no device/emulator). First bundle
  takes ~15-30s. `react-native-web` is present; native-only modules (camera, purchases)
  degrade gracefully on web.
- **Typecheck currently fails on pre-existing committed code**, not on setup:
  `pnpm typecheck` errors in `lib/db` (drizzle-zod + zod 3.25 `ZodType` mismatch) and
  cascades into `api-server` (implicit-any, missing `previewUri`, unbuilt `lib/db/dist`).
  This is the committed state — do not "fix" it as part of environment setup. The esbuild
  build (`pnpm --filter @workspace/api-server run build`) and runtime are unaffected.
- **No linter and no test framework** are configured (only Prettier as a dep, no `lint`/
  `test` scripts). `tsc` typecheck is the only automated static check.
