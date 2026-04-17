import type { Env } from '../types'
import { jsonResponse, errorResponse } from '../cors'
import * as yahoo from '../providers/yahoo'
import * as finnhub from '../providers/finnhub'

// Valid ranges for Yahoo Finance
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

  if (!VALID_RANGES.includes(range)) {
    return errorResponse(`Invalid range. Use: ${VALID_RANGES.join(', ')}`, env, request)
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return errorResponse(`Invalid interval. Use: ${VALID_INTERVALS.join(', ')}`, env, request)
  }

  // Check D1 cache
  const cacheKey = `history:${symbol}:${range}:${interval}`
  const cached = await getCachedData(env, cacheKey)
  if (cached) {
    return jsonResponse({ symbol, range, interval, candles: cached, cached: true }, env, request)
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

    // Cache in D1 (daily data for 4 hours, intraday for 5 minutes)
    const ttl = interval === '1d' ? 14400 : 300
    await setCachedData(env, cacheKey, candles, ttl)

    return jsonResponse({ symbol, range, interval, candles, cached: false }, env, request)
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
  const cacheKey = `quote:${symbol}`
  const cached = await getCachedData(env, cacheKey)
  if (cached) {
    return jsonResponse({ ...cached, cached: true }, env, request)
  }

  try {
    let quote

    if (env.FINNHUB_API_KEY) {
      quote = await finnhub.fetchQuote(symbol, env.FINNHUB_API_KEY)
    } else {
      quote = await yahoo.fetchQuote(symbol)
    }

    // Cache quotes for 60 seconds
    await setCachedData(env, cacheKey, quote, 60)

    return jsonResponse({ ...quote, cached: false }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 502)
  }
}

// D1 caching helpers
async function getCachedData(env: Env, key: string): Promise<unknown | null> {
  try {
    const result = await env.DB.prepare(
      'SELECT data FROM cache WHERE key = ? AND expires_at > ?'
    )
      .bind(key, Date.now())
      .first<{ data: string }>()

    return result ? JSON.parse(result.data) : null
  } catch {
    return null // Cache miss on DB errors
  }
}

async function setCachedData(env: Env, key: string, data: unknown, ttlSeconds: number): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO cache (key, data, expires_at) VALUES (?, ?, ?)'
    )
      .bind(key, JSON.stringify(data), Date.now() + ttlSeconds * 1000)
      .run()
  } catch {
    // Non-fatal: caching failure shouldn't break the response
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
