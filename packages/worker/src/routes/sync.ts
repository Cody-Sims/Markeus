import type { Env } from '../types'
import { jsonResponse, errorResponse } from '../cors'
import { runDailySync, syncCandlesIncremental, syncOptionsMultiExpiration } from '../sync-engine'

// POST /api/sync — sync data for watchlist symbols or specific symbols
// Body: { symbols?, range?, includeOptions?, incremental?, optionsExpirations? }
export async function handleSync(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json<{
      symbols?: string[]
      range?: string
      includeOptions?: boolean
      incremental?: boolean
      optionsExpirations?: number
    }>()

    const includeOptions = body.includeOptions !== false
    const incremental = body.incremental !== false
    const maxExp = body.optionsExpirations ?? 6

    // Get symbols to sync
    let symbols = body.symbols?.map((s) => s.toUpperCase().trim()) || []

    if (symbols.length === 0) {
      const { results } = await env.DB.prepare(
        'SELECT DISTINCT symbol FROM watchlist_symbols ORDER BY symbol'
      ).all<{ symbol: string }>()
      symbols = results.map((r) => r.symbol)
    }

    if (symbols.length === 0) {
      return errorResponse('No symbols to sync. Add symbols to a watchlist first.', env, request)
    }

    interface SyncResult { symbol: string; candles?: { new: number; total: number; lastDate: string }; options?: { expirations: number; contracts: number }; error?: string }
    const results: SyncResult[] = []

    for (const symbol of symbols) {
      const result: SyncResult = { symbol }

      // Sync candles
      try {
        if (incremental) {
          result.candles = await syncCandlesIncremental(env.DB, symbol)
        } else {
          // Legacy: full range fetch
          const range = body.range || '1y'
          const candles = await (await import('../providers/yahoo')).fetchStockHistory(symbol, range)
          if (candles.length > 0) {
            const stmts = candles.map((c) =>
              env.DB.prepare(
                'INSERT OR REPLACE INTO stock_candles (symbol, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)'
              ).bind(symbol, c.date, c.open, c.high, c.low, c.close, c.volume)
            )
            for (let i = 0; i < stmts.length; i += 100) {
              await env.DB.batch(stmts.slice(i, i + 100))
            }
            result.candles = { new: candles.length, total: candles.length, lastDate: candles[candles.length - 1].date }
          }
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : 'candle sync failed'
      }

      // Sync options
      if (includeOptions) {
        try {
          result.options = await syncOptionsMultiExpiration(env.DB, symbol, maxExp)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'options sync failed'
          result.error = result.error ? `${result.error}; ${msg}` : msg
        }
      }

      results.push(result)

      // Delay between symbols
      await new Promise((r) => setTimeout(r, 500))
    }

    return jsonResponse({ synced: results.length, results }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// GET /api/sync/status
export async function handleSyncStatus(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const { results: logs } = await env.DB.prepare(`
      SELECT symbol, data_type, synced_at, range, records_count, status, error_message
      FROM sync_log
      WHERE id IN (
        SELECT MAX(id) FROM sync_log GROUP BY symbol, data_type
      )
      ORDER BY symbol, data_type
    `).all<{
      symbol: string; data_type: string; synced_at: string; range: string
      records_count: number; status: string; error_message: string | null
    }>()

    const candleCount = await env.DB.prepare('SELECT COUNT(*) as count FROM stock_candles').first<{ count: number }>()
    const optionCount = await env.DB.prepare('SELECT COUNT(*) as count FROM options_contracts').first<{ count: number }>()
    const symbolCount = await env.DB.prepare('SELECT COUNT(DISTINCT symbol) as count FROM stock_candles').first<{ count: number }>()

    return jsonResponse({
      totals: {
        symbols: symbolCount?.count ?? 0,
        candles: candleCount?.count ?? 0,
        options_contracts: optionCount?.count ?? 0,
      },
      latest_syncs: logs,
    }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// POST /api/sync/daily — manually trigger the same logic the cron runs
export async function handleDailySync(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const report = await runDailySync(env.DB)
    return jsonResponse(report, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}
