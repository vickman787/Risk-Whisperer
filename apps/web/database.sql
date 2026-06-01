CREATE TABLE IF NOT EXISTS portfolio_state (
  id SERIAL PRIMARY KEY,
  meth_allocation NUMERIC NOT NULL DEFAULT 0,
  usdy_allocation NUMERIC NOT NULL DEFAULT 0,
  total_value_usd NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY,
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

INSERT INTO portfolio_state (meth_allocation, usdy_allocation, total_value_usd)
SELECT 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM portfolio_state);
