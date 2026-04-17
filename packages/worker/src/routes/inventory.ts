import type { Env } from '../types'
import { jsonResponse, errorResponse } from '../cors'
import { getTradingDays } from '../sync-engine'

// GET /api/inventory — per-symbol data coverage overview
export async function handleInventory(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const { results: candleStats } = await env.DB.prepare(`
      SELECT symbol, MIN(date) as first_date, MAX(date) as last_date, COUNT(*) as candle_count
      FROM stock_candles GROUP BY symbol ORDER BY symbol
    `).all<{ symbol: string; first_date: string; last_date: string; candle_count: number }>()

    const { results: optionStats } = await env.DB.prepare(`
      SELECT symbol, COUNT(DISTINCT snapshot_date) as snapshot_days, COUNT(*) as total_contracts,
             MIN(snapshot_date) as first_snapshot, MAX(snapshot_date) as last_snapshot
      FROM options_contracts GROUP BY symbol
    `).all<{ symbol: string; snapshot_days: number; total_contracts: number; first_snapshot: string; last_snapshot: string }>()

    const { results: syncStats } = await env.DB.prepare(`
      SELECT symbol, data_type, MAX(synced_at) as last_sync
      FROM sync_log WHERE status = 'success' GROUP BY symbol, data_type
    `).all<{ symbol: string; data_type: string; last_sync: string }>()

    // Merge into a unified view
    const optionMap = new Map(optionStats.map((o) => [o.symbol, o]))
    const syncMap = new Map<string, string>()
    for (const s of syncStats) {
      const key = s.symbol
      const existing = syncMap.get(key)
      if (!existing || s.last_sync > existing) {
        syncMap.set(key, s.last_sync)
      }
    }

    const symbols = candleStats.map((c) => {
      const opt = optionMap.get(c.symbol)
      const tradingDays = getTradingDays(c.first_date, c.last_date)
      const gaps = tradingDays.length - c.candle_count

      return {
        symbol: c.symbol,
        candles: {
          firstDate: c.first_date,
          lastDate: c.last_date,
          count: c.candle_count,
          expectedTradingDays: tradingDays.length,
          gaps: Math.max(0, gaps),
        },
        options: opt ? {
          firstSnapshot: opt.first_snapshot,
          lastSnapshot: opt.last_snapshot,
          snapshotDays: opt.snapshot_days,
          totalContracts: opt.total_contracts,
        } : null,
        lastSyncAt: syncMap.get(c.symbol) ?? null,
      }
    })

    return jsonResponse({ symbols }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// GET /api/inventory/:symbol — detailed view for one symbol
export async function handleInventorySymbol(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  try {
    // Candle stats
    const candleStat = await env.DB.prepare(
      'SELECT MIN(date) as first_date, MAX(date) as last_date, COUNT(*) as count FROM stock_candles WHERE symbol = ?'
    ).bind(symbol).first<{ first_date: string | null; last_date: string | null; count: number }>()

    if (!candleStat?.first_date) {
      return errorResponse(`No data found for ${symbol}`, env, request, 404)
    }

    // Get actual dates for gap detection
    const { results: dateDates } = await env.DB.prepare(
      'SELECT date FROM stock_candles WHERE symbol = ? ORDER BY date ASC'
    ).bind(symbol).all<{ date: string }>()

    const actualDates = new Set(dateDates.map((d) => d.date))
    const expectedDays = getTradingDays(candleStat.first_date, candleStat.last_date!)
    const gaps = expectedDays.filter((d) => !actualDates.has(d))

    // Options stats per expiration
    const { results: expStats } = await env.DB.prepare(`
      SELECT expiration, COUNT(*) as contracts, COUNT(DISTINCT snapshot_date) as snapshots
      FROM options_contracts WHERE symbol = ? GROUP BY expiration ORDER BY expiration
    `).bind(symbol).all<{ expiration: string; contracts: number; snapshots: number }>()

    // Options snapshot dates
    const { results: snapshotDates } = await env.DB.prepare(
      'SELECT DISTINCT snapshot_date FROM options_contracts WHERE symbol = ? ORDER BY snapshot_date'
    ).bind(symbol).all<{ snapshot_date: string }>()

    // Recent sync log
    const { results: recentSyncs } = await env.DB.prepare(
      'SELECT data_type, synced_at, range, records_count, status, error_message FROM sync_log WHERE symbol = ? ORDER BY synced_at DESC LIMIT 10'
    ).bind(symbol).all<{ data_type: string; synced_at: string; range: string; records_count: number; status: string; error_message: string | null }>()

    return jsonResponse({
      symbol,
      candles: {
        firstDate: candleStat.first_date,
        lastDate: candleStat.last_date,
        count: candleStat.count,
        expectedTradingDays: expectedDays.length,
        gapCount: gaps.length,
        gaps,
      },
      options: {
        snapshotDates: snapshotDates.map((s) => s.snapshot_date),
        expirations: expStats,
      },
      recentSyncs,
    }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}
