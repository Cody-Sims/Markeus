import type { Env } from '../types'
import { jsonResponse, errorResponse } from '../cors'
import * as yahoo from '../providers/yahoo'
import * as finnhub from '../providers/finnhub'
import { getTradingDays } from '../sync-engine'

const VALID_RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']
const VALID_INTERVALS = ['1d', '1wk', '1mo', '5m', '15m', '30m', '60m']

export async function handleStockHistory(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  const url = new URL(request.url)
  const range = url.searchParams.get('range') || '1y'
  const interval = url.searchParams.get('interval') || '1d'
  const provider = url.searchParams.get('provider') || 'yahoo'
  const fresh = url.searchParams.get('fresh') === 'true'

  if (!VALID_RANGES.includes(range)) {
    return errorResponse(`Invalid range. Use: ${VALID_RANGES.join(', ')}`, env, request)
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return errorResponse(`Invalid interval. Use: ${VALID_INTERVALS.join(', ')}`, env, request)
  }

  // For daily candles, try D1 first (unless fresh=true)
  if (interval === '1d' && !fresh) {
    const dbCandles = await getStoredCandles(env, symbol, range)
    if (dbCandles && dbCandles.length > 0) {
      return jsonResponse({ symbol, range, interval, candles: dbCandles, source: 'db' }, env, request)
    }
  }

  try {
    let candles

    if (provider === 'finnhub' && env.FINNHUB_API_KEY) {
      const to = new Date().toISOString().split('T')[0]
      const from = getFromDate(range)
      candles = await finnhub.fetchStockHistory(symbol, env.FINNHUB_API_KEY, from, to)
    } else {
      candles = await yahoo.fetchStockHistory(symbol, range, interval)
    }

    // Persist daily candles to D1
    if (interval === '1d' && candles.length > 0) {
      await storeCandles(env, symbol, candles, range)
    }

    return jsonResponse({ symbol, range, interval, candles, source: 'yahoo' }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 502)
  }
}

export async function handleStockQuote(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  // Check D1 for recent quote (< 60s)
  const stored = await getStoredQuote(env, symbol)
  if (stored) {
    return jsonResponse({ ...stored, source: 'db' }, env, request)
  }

  try {
    let quote
    if (env.FINNHUB_API_KEY) {
      quote = await finnhub.fetchQuote(symbol, env.FINNHUB_API_KEY)
    } else {
      quote = await yahoo.fetchQuote(symbol)
    }

    await storeQuote(env, symbol, quote)

    return jsonResponse({ ...quote, source: 'yahoo' }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 502)
  }
}

// --- D1 helpers ---

interface StoredCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

async function getStoredCandles(env: Env, symbol: string, range: string): Promise<StoredCandle[] | null> {
  try {
    const fromDate = getFromDate(range)
    const { results } = await env.DB.prepare(
      'SELECT date, open, high, low, close, volume FROM stock_candles WHERE symbol = ? AND date >= ? ORDER BY date ASC'
    ).bind(symbol, fromDate).all<StoredCandle>()

    // Only return if we have a reasonable amount of data
    const expectedMin = getExpectedMinCandles(range)
    return results.length >= expectedMin ? results : null
  } catch {
    return null
  }
}

async function storeCandles(
  env: Env,
  symbol: string,
  candles: StoredCandle[],
  range: string
): Promise<void> {
  try {
    // Batch insert with D1 batch API
    const stmts = candles.map((c) =>
      env.DB.prepare(
        'INSERT OR REPLACE INTO stock_candles (symbol, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(symbol, c.date, c.open, c.high, c.low, c.close, c.volume)
    )

    // D1 batch limit is ~100 statements
    for (let i = 0; i < stmts.length; i += 100) {
      await env.DB.batch(stmts.slice(i, i + 100))
    }

    await env.DB.prepare(
      'INSERT INTO sync_log (symbol, data_type, range, records_count, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(symbol, 'candles', range, candles.length, 'success').run()
  } catch {
    // Non-fatal
  }
}

interface StoredQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  previousClose: number
  timestamp: number
}

async function getStoredQuote(env: Env, symbol: string): Promise<StoredQuote | null> {
  try {
    const row = await env.DB.prepare(
      "SELECT * FROM stock_quotes WHERE symbol = ? AND updated_at > datetime('now', '-60 seconds')"
    ).bind(symbol).first<{
      symbol: string; price: number; change: number; change_percent: number
      high: number; low: number; open: number; previous_close: number; market_timestamp: number
    }>()

    if (!row) return null

    return {
      symbol: row.symbol,
      price: row.price,
      change: row.change,
      changePercent: row.change_percent,
      high: row.high,
      low: row.low,
      open: row.open,
      previousClose: row.previous_close,
      timestamp: row.market_timestamp,
    }
  } catch {
    return null
  }
}

async function storeQuote(env: Env, symbol: string, quote: StoredQuote): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO stock_quotes (symbol, price, change, change_percent, high, low, open, previous_close, market_timestamp, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      symbol, quote.price, quote.change, quote.changePercent,
      quote.high, quote.low, quote.open, quote.previousClose, quote.timestamp
    ).run()
  } catch {
    // Non-fatal
  }
}

function getFromDate(range: string): string {
  const now = new Date()
  const offsets: Record<string, number> = {
    '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180,
    '1y': 365, '2y': 730, '5y': 1825, '10y': 3650, 'max': 7300,
  }
  const days = offsets[range] ?? 365
  now.setDate(now.getDate() - days)
  return now.toISOString().split('T')[0]
}

function getExpectedMinCandles(range: string): number {
  const mins: Record<string, number> = {
    '1d': 1, '5d': 3, '1mo': 15, '3mo': 50, '6mo': 100,
    '1y': 200, '2y': 400, '5y': 1000, '10y': 2000, 'max': 2000,
  }
  return mins[range] ?? 50
}

// GET /api/stocks/:symbol/gaps?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function handleStockGaps(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  const url = new URL(request.url)

  try {
    // Default range: earliest to latest candle for this symbol
    const bounds = await env.DB.prepare(
      'SELECT MIN(date) as first_date, MAX(date) as last_date FROM stock_candles WHERE symbol = ?'
    ).bind(symbol).first<{ first_date: string | null; last_date: string | null }>()

    if (!bounds?.first_date) {
      return errorResponse(`No candle data found for ${symbol}`, env, request, 404)
    }

    const from = url.searchParams.get('from') || bounds.first_date
    const to = url.searchParams.get('to') || bounds.last_date!

    const { results } = await env.DB.prepare(
      'SELECT date FROM stock_candles WHERE symbol = ? AND date >= ? AND date <= ? ORDER BY date ASC'
    ).bind(symbol, from, to).all<{ date: string }>()

    const actualDates = new Set(results.map((r) => r.date))
    const expectedDays = getTradingDays(from, to)
    const gaps = expectedDays.filter((d) => !actualDates.has(d))

    return jsonResponse({
      symbol,
      from,
      to,
      expectedTradingDays: expectedDays.length,
      actualCandles: results.length,
      gapCount: gaps.length,
      gaps,
    }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}
