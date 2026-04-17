import type { StockCandle, OptionsContract } from './types'
import * as yahoo from './providers/yahoo'

// --- NYSE Trading Calendar ---

// NYSE holidays 2025-2029 (observed dates)
const NYSE_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18',
  '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01',
  '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26',
  '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06',
  '2027-11-25', '2027-12-24',
  // 2028
  '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29',
  '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23',
  '2028-12-25',
  // 2029
  '2029-01-01', '2029-01-15', '2029-02-19', '2029-03-30',
  '2029-05-28', '2029-06-19', '2029-07-04', '2029-09-03',
  '2029-11-22', '2029-12-25',
])

export function isUSTradingDay(date: Date): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return false // weekend
  const dateStr = date.toISOString().split('T')[0]
  return !NYSE_HOLIDAYS.has(dateStr)
}

export function getTradingDays(from: string, to: string): string[] {
  const days: string[] = []
  const current = new Date(from)
  const end = new Date(to)

  while (current <= end) {
    if (isUSTradingDay(current)) {
      days.push(current.toISOString().split('T')[0])
    }
    current.setDate(current.getDate() + 1)
  }

  return days
}

// --- Sync Results ---

export interface SymbolSyncResult {
  symbol: string
  candles?: { new: number; total: number; lastDate: string }
  options?: { expirations: number; contracts: number }
  error?: string
}

export interface DailySyncReport {
  startedAt: string
  completedAt: string
  tradingDay: boolean
  symbols: SymbolSyncResult[]
}

// --- Incremental Candle Sync ---

export async function syncCandlesIncremental(
  db: D1Database,
  symbol: string
): Promise<{ new: number; total: number; lastDate: string }> {
  // Find last candle date we have
  const lastRow = await db.prepare(
    'SELECT MAX(date) as last_date FROM stock_candles WHERE symbol = ?'
  ).bind(symbol).first<{ last_date: string | null }>()

  let candles: StockCandle[]

  if (!lastRow?.last_date) {
    // No data — full backfill
    candles = await yahoo.fetchStockHistory(symbol, '2y')
  } else {
    // Incremental — only fetch since last date
    candles = await yahoo.fetchStockHistorySince(symbol, lastRow.last_date)
  }

  if (candles.length > 0) {
    await batchInsertCandles(db, symbol, candles)
  }

  // Get updated total
  const countRow = await db.prepare(
    'SELECT COUNT(*) as count, MAX(date) as last_date FROM stock_candles WHERE symbol = ?'
  ).bind(symbol).first<{ count: number; last_date: string }>()

  await db.prepare(
    'INSERT INTO sync_log (symbol, data_type, range, records_count, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(symbol, 'candles', lastRow?.last_date ? 'incremental' : '2y', candles.length, 'success').run()

  return {
    new: candles.length,
    total: countRow?.count ?? candles.length,
    lastDate: countRow?.last_date ?? candles[candles.length - 1]?.date ?? '',
  }
}

// --- Multi-Expiration Options Sync ---

export async function syncOptionsMultiExpiration(
  db: D1Database,
  symbol: string,
  maxExpirations = 6
): Promise<{ expirations: number; contracts: number }> {
  const today = new Date().toISOString().split('T')[0]

  // First call gets expirations list + nearest chain
  const firstChain = await yahoo.fetchOptionsChain(symbol)

  // Store expirations
  const futureExps = firstChain.expirations.filter((e) => e >= today)
  if (futureExps.length > 0) {
    const expStmts = futureExps.map((exp) =>
      db.prepare('INSERT OR REPLACE INTO options_expirations (symbol, expiration) VALUES (?, ?)').bind(symbol, exp)
    )
    for (let i = 0; i < expStmts.length; i += 100) {
      await db.batch(expStmts.slice(i, i + 100))
    }
  }

  // Store contracts from the first call
  let totalContracts = 0
  const allContracts: Array<{ contract: OptionsContract; expiration: string }> = []

  for (const [expDate, data] of Object.entries(firstChain.chains)) {
    for (const c of [...data.calls, ...data.puts]) {
      allContracts.push({ contract: c, expiration: expDate })
    }
  }

  // Fetch additional expirations (nearest N that we don't already have)
  const targetExps = futureExps.slice(0, maxExpirations)
  const alreadyFetched = new Set(Object.keys(firstChain.chains))

  for (const exp of targetExps) {
    if (alreadyFetched.has(exp)) continue

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300))

    try {
      const chain = await yahoo.fetchOptionsChain(symbol, exp)
      for (const [expDate, data] of Object.entries(chain.chains)) {
        for (const c of [...data.calls, ...data.puts]) {
          allContracts.push({ contract: c, expiration: expDate })
        }
      }
    } catch {
      // Non-fatal — skip this expiration
    }
  }

  // Batch insert all contracts
  if (allContracts.length > 0) {
    const stmts = allContracts.map(({ contract: c }) =>
      db.prepare(
        `INSERT OR REPLACE INTO options_contracts
         (symbol, contract_symbol, type, strike, expiration, snapshot_date, bid, ask, last, volume, open_interest, implied_volatility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        symbol, c.symbol, c.type, c.strike, c.expiration, today,
        c.bid, c.ask, c.last, c.volume, c.openInterest, c.impliedVolatility ?? null
      )
    )
    for (let i = 0; i < stmts.length; i += 100) {
      await db.batch(stmts.slice(i, i + 100))
    }
    totalContracts = allContracts.length
  }

  const expsSynced = new Set(allContracts.map((c) => c.expiration)).size

  await db.prepare(
    'INSERT INTO sync_log (symbol, data_type, records_count, status) VALUES (?, ?, ?, ?)'
  ).bind(symbol, 'options', totalContracts, 'success').run()

  return { expirations: expsSynced, contracts: totalContracts }
}

// --- Daily Sync Orchestrator ---

export async function runDailySync(
  db: D1Database,
  options?: { maxSymbols?: number; includeOptions?: boolean }
): Promise<DailySyncReport> {
  const startedAt = new Date().toISOString()
  const includeOptions = options?.includeOptions !== false
  const today = new Date()
  const tradingDay = isUSTradingDay(today)

  // Get all watchlist symbols
  const { results } = await db.prepare(
    'SELECT DISTINCT symbol FROM watchlist_symbols ORDER BY symbol'
  ).all<{ symbol: string }>()

  let symbols = results.map((r) => r.symbol)

  if (options?.maxSymbols) {
    symbols = symbols.slice(0, options.maxSymbols)
  }

  const report: DailySyncReport = {
    startedAt,
    completedAt: '',
    tradingDay,
    symbols: [],
  }

  // Even on non-trading days, we might want to sync options (premiums change with time decay)
  // But skip candles on non-trading days since there's nothing new
  for (const symbol of symbols) {
    const result: SymbolSyncResult = { symbol }

    // Sync candles (skip on non-trading days — no new data)
    if (tradingDay) {
      try {
        result.candles = await syncCandlesIncremental(db, symbol)
      } catch (err) {
        result.error = err instanceof Error ? err.message : 'candle sync failed'
        await db.prepare(
          'INSERT INTO sync_log (symbol, data_type, status, error_message) VALUES (?, ?, ?, ?)'
        ).bind(symbol, 'candles', 'error', result.error).run()
      }
    }

    // Sync options
    if (includeOptions) {
      try {
        result.options = await syncOptionsMultiExpiration(db, symbol)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'options sync failed'
        result.error = result.error ? `${result.error}; ${msg}` : msg
        await db.prepare(
          'INSERT INTO sync_log (symbol, data_type, status, error_message) VALUES (?, ?, ?, ?)'
        ).bind(symbol, 'options', 'error', msg).run()
      }
    }

    report.symbols.push(result)

    // Delay between symbols to avoid Yahoo rate limits
    await new Promise((r) => setTimeout(r, 500))
  }

  report.completedAt = new Date().toISOString()
  return report
}

// --- Helpers ---

async function batchInsertCandles(db: D1Database, symbol: string, candles: StockCandle[]): Promise<void> {
  const stmts = candles.map((c) =>
    db.prepare(
      'INSERT OR REPLACE INTO stock_candles (symbol, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(symbol, c.date, c.open, c.high, c.low, c.close, c.volume)
  )

  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100))
  }
}
