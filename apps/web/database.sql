CREATE TABLE IF NOT EXISTS portfolio_state (
  id SERIAL PRIMARY KEY,
  owner_key TEXT NOT NULL DEFAULT 'legacy:global',
  meth_allocation NUMERIC NOT NULL DEFAULT 50,
  usdy_allocation NUMERIC NOT NULL DEFAULT 50,
  total_value_usd NUMERIC NOT NULL DEFAULT 10000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY,
  owner_key TEXT NOT NULL DEFAULT 'legacy:global',
  tx_hash TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  action TEXT NOT NULL,
  from_asset TEXT NOT NULL,
  to_asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  risk_before INTEGER NOT NULL,
  risk_after INTEGER NOT NULL,
  confidence INTEGER NOT NULL,
  status TEXT NOT NULL,
  market_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS decisions_owner_created_idx ON decisions (owner_key, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_state_owner_updated_idx ON portfolio_state (owner_key, updated_at DESC);
