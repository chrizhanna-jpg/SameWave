-- SameWave: Expo push tokens
-- Apply on Neon before / with the server deploy that uses this table.
-- Safe if the table already exists (IF NOT EXISTS).
--
-- Matches lib/db/src/schema/pushTokens.ts (pushTokensTable).
-- POST /api/push-tokens upserts rows; mutual-Wave pushes prune
-- DeviceNotRegistered tokens via the Expo Push API response.

CREATE TABLE IF NOT EXISTS push_tokens (
  id         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_token varchar(256) NOT NULL UNIQUE,
  platform   varchar(16) NOT NULL DEFAULT 'unknown',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);
