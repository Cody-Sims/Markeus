-- Optimize backtesting queries that filter by symbol + snapshot date + expiration
CREATE INDEX IF NOT EXISTS idx_oc_snapshot_exp
  ON options_contracts(symbol, snapshot_date, expiration);
