-- Token store for auto-refreshing Instagram tokens.
-- Tokens are read by the daily content script at startup.
-- Instagram tokens are automatically refreshed when < 14 days remain.

CREATE TABLE IF NOT EXISTS nc_token_store (
  key           text PRIMARY KEY,
  value         text NOT NULL,
  refreshed_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS but allow service_role full access (script uses service key)
ALTER TABLE nc_token_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON nc_token_store
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
