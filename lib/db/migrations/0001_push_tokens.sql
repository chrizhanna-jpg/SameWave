-- SameWave: Expo push tokens (branch-only migration — DO NOT apply to Neon
-- until Chris approves. Do not deploy to Render with this until then.)
--
-- One row per Expo push token. A user may have multiple devices, so user_id
-- is NOT unique. The token itself is unique (Expo issues a stable token per
-- install). Re-registration upserts on expo_token to refresh user_id +
-- updated_at.
--
-- Schema matches lib/db/src/schema/pushTokens.ts (pushTokensTable).

CREATE TABLE IF NOT EXISTS push_tokens (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_token varchar(256) NOT NULL UNIQUE,
  platform   varchar(16) NOT NULL DEFAULT 'unknown',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);

-- Notes for operators (Chris):
-- 1. Review this SQL, then run against Neon only when ready.
-- 2. API already upserts via POST /api/push-tokens and sends via Expo Push
--    API when a Wave (mutual echo) forms; invalid DeviceNotRegistered tokens
--    are pruned automatically.
-- 3. Android channel id used by the client + Expo messages: "waves".
