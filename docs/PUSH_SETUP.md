# SameWave push setup (Android only)

iOS push is **out of scope** for now — do not configure APNs, iOS push entitlements, or iPhone builds for notifications.

Real remote push needs a **development or production build**. Expo Go (Android SDK 53+) cannot receive remote Expo push.

## Already in the repo

| Piece | Status |
| --- | --- |
| Client: `expo-notifications`, ask after first Ripple, channel id `waves`, `waveId` routing → reveal | PR #45 |
| Client: auto-reveal backup on launch/foreground (persisted `revealedWaveIds`) | PR #45 |
| `eas.json` → `development` (`developmentClient: true`, `distribution: internal`) | Present |
| `expo-dev-client` dependency | Present (~58) |
| `app.json` → `android.googleServicesFile`: `./google-services.json` | Present |
| `android.permission.POST_NOTIFICATIONS` | Present |
| Server: `POST /api/push-tokens`, Expo Push on **mutual** Wave only, prune `DeviceNotRegistered` | Separate server PR (see below) |
| Migration SQL | `lib/db/migrations/0001_push_tokens.sql` |

## Package name

Android application id (Firebase Android app + `google-services.json`):

`echo.samewaveripple.app`

EAS project id: `435d5953-8fbe-48a4-9b0c-85096db24c53` (owner `chrizhanna`).

## Remaining steps (Chris)

### 1. Firebase (Android)

1. Create a Firebase project (or use an existing one).
2. Add an **Android** app with package name `echo.samewaveripple.app`.
3. Download `google-services.json` and place it at:

   `artifacts/same-same/google-services.json`

   (gitignored — never commit).

4. In Firebase → Project settings → Service accounts → generate a **FCM V1** service-account JSON key (for EAS).

### 2. EAS credentials (Android FCM)

```bash
cd artifacts/same-same
eas credentials -p android
```

Upload the FCM V1 service-account JSON when prompted (Expo “FCM V1 service account key”).

### 3. Development build (Android only — after `google-services.json` is in place)

```bash
cd artifacts/same-same
eas build --platform android --profile development
```

Install the resulting APK / internal distribution build on the test device. Open it (not Expo Go) for real remote push.

### 4. Database + server deploy (separate server PR — not PR #45)

1. Apply the migration SQL from the server PR to Neon (Chris applies — agents do not).
2. Merge the **server-only** PR to `main` so Render deploys (Chris merges — agents do not).

Exact SQL (also in `lib/db/migrations/0001_push_tokens.sql`):

```sql
CREATE TABLE IF NOT EXISTS push_tokens (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_token varchar(256) NOT NULL UNIQUE,
  platform   varchar(16) NOT NULL DEFAULT 'unknown',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);
```

If `push_tokens` already exists on Neon, this is a no-op (`IF NOT EXISTS`).

### 5. Smoke test

1. Dev-client build signed in → send a Ripple → grant notifications when prompted.
2. Form a **mutual** Wave from another account → device should receive an Expo push (channel `waves`, payload includes `waveId`).
3. Tap notification → full-screen Wave reveal once.
4. Kill/reopen app with an unrevealed Wave and no push → auto-reveal after splash (backup path).
5. Same Wave must not reveal twice (persisted `revealedWaveIds`).

## Explicitly not doing (for now)

- iOS / APNs / Apple Developer push setup
- EAS build before `google-services.json` is supplied
- Merging PR #45 for push server deploy (use the small server-only PR instead)
