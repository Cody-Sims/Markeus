-- ============================================
-- Markeus D1 Schema v2: Structured Market Data
-- ============================================

-- Keep the cache table for short-lived API response caching
-- (already exists from migration 0001)

-- ============================================
-- WATCHLISTS
-- ============================================

-- User-defined or Yahoo-synced watchlists
CREATE TABLE IF NOT EXISTS watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'yahoo'
  yahoo_list_id TEXT,                     -- Yahoo portfolio/list ID if synced
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Symbols belonging to each watchlist
CREATE TABLE IF NOT EXISTS watchlist_symbols (
  watchlist_id INTEGER NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (watchlist_id, symbol)
);

-- Index to quickly find all watchlists containing a symbol
CREATE INDEX IF NOT EXISTS idx_ws_symbol ON watchlist_symbols(symbol);

-- ============================================
-- STOCK DATA
-- ============================================

-- Daily OHLCV candles (one row per symbol per trading day)
CREATE TABLE IF NOT EXISTS stock_candles (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume INTEGER NOT NULL,
  PRIMARY KEY (symbol, date)
);

-- Fast lookup for date-range queries per symbol
CREATE INDEX IF NOT EXISTS idx_candles_date ON stock_candles(symbol, date DESC);

-- Latest quote snapshot (one row per symbol, upserted on each fetch)
CREATE TABLE IF NOT EXISTS stock_quotes (
  symbol TEXT PRIMARY KEY,
  price REAL NOT NULL,
  change REAL NOT NULL,
  change_percent REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  open REAL NOT NULL,
  previous_close REAL NOT NULL,
  market_timestamp INTEGER NOT NULL,  -- Unix ms from exchange
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- OPTIONS DATA
-- ============================================

-- Point-in-time snapshots of individual option contracts
-- Each row = one contract's pricing at one snapshot date
CREATE TABLE IF NOT EXISTS options_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,               -- underlying (e.g. GLD)
  contract_symbol TEXT NOT NULL,      -- OCC symbol (e.g. GLD260618C00450000)
  type TEXT NOT NULL CHECK(type IN ('call', 'put')),
  strike REAL NOT NULL,
  expiration TEXT NOT NULL,           -- YYYY-MM-DD
  snapshot_date TEXT NOT NULL,        -- YYYY-MM-DD when captured
  bid REAL,
  ask REAL,
  last REAL,
  volume INTEGER,
  open_interest INTEGER,
  implied_volatility REAL
);

-- Unique: one snapshot per contract per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_oc_unique
  ON options_contracts(contract_symbol, snapshot_date);

-- Query by underlying + expiration (e.g. "show me all GLD calls expiring June 18")
CREATE INDEX IF NOT EXISTS idx_oc_chain
  ON options_contracts(symbol, expiration, type, strike);

-- Query by underlying + snapshot date (e.g. "what did the chain look like on April 10?")
CREATE INDEX IF NOT EXISTS idx_oc_snapshot
  ON options_contracts(symbol, snapshot_date);

-- Available expirations per underlying (derived, but useful to cache the list)
CREATE TABLE IF NOT EXISTS options_expirations (
  symbol TEXT NOT NULL,
  expiration TEXT NOT NULL,           -- YYYY-MM-DD
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (symbol, expiration)
);

-- ============================================
-- SYNC TRACKING
-- ============================================

-- Log every sync operation so we know what data we have and when it was refreshed
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  data_type TEXT NOT NULL,            -- 'candles' | 'options' | 'quote' | 'expirations'
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  range TEXT,                         -- e.g. '1y', '6mo' (for candles)
  records_count INTEGER,
  status TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'error'
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_symbol ON sync_log(symbol, data_type, synced_at DESC);
