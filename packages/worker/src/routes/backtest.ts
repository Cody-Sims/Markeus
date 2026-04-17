import type { Env, OptionsContract } from '../types'
import { jsonResponse, errorResponse } from '../cors'

// GET /api/backtest/candles?symbols=GLD,AAPL&from=2025-01-01&to=2026-01-01
export async function handleBacktestCandles(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url)
  const symbolsParam = url.searchParams.get('symbols')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!symbolsParam) return errorResponse('symbols query param is required (comma-separated)', env, request)
  if (!from || !to) return errorResponse('from and to date params are required (YYYY-MM-DD)', env, request)

  const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (symbols.length > 10) return errorResponse('Maximum 10 symbols per request', env, request)

  try {
    const data: Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>> = {}

    for (const symbol of symbols) {
      const { results } = await env.DB.prepare(
        'SELECT date, open, high, low, close, volume FROM stock_candles WHERE symbol = ? AND date >= ? AND date <= ? ORDER BY date ASC'
      ).bind(symbol, from, to).all<{ date: string; open: number; high: number; low: number; close: number; volume: number }>()
      data[symbol] = results
    }

    return jsonResponse({ from, to, symbols, data }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// GET /api/backtest/options/:symbol/snapshot?date=2026-04-17
export async function handleBacktestOptionsSnapshot(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  const url = new URL(request.url)
  const date = url.searchParams.get('date')

  if (!date) return errorResponse('date query param is required (YYYY-MM-DD)', env, request)

  try {
    const { results } = await env.DB.prepare(
      `SELECT contract_symbol, type, strike, expiration, bid, ask, last, volume, open_interest, implied_volatility
       FROM options_contracts
       WHERE symbol = ? AND snapshot_date = ?
       ORDER BY expiration, type DESC, strike ASC`
    ).bind(symbol, date).all<{
      contract_symbol: string; type: string; strike: number; expiration: string
      bid: number; ask: number; last: number; volume: number
      open_interest: number; implied_volatility: number
    }>()

    if (results.length === 0) {
      return errorResponse(`No options snapshot found for ${symbol} on ${date}`, env, request, 404)
    }

    // Group by expiration
    const chains: Record<string, { calls: OptionsContract[]; puts: OptionsContract[] }> = {}
    const expirations = new Set<string>()

    for (const r of results) {
      expirations.add(r.expiration)
      if (!chains[r.expiration]) chains[r.expiration] = { calls: [], puts: [] }

      const contract: OptionsContract = {
        symbol: r.contract_symbol,
        type: r.type as 'call' | 'put',
        strike: r.strike,
        expiration: r.expiration,
        bid: r.bid ?? 0,
        ask: r.ask ?? 0,
        last: r.last ?? 0,
        volume: r.volume ?? 0,
        openInterest: r.open_interest ?? 0,
        impliedVolatility: r.implied_volatility,
      }

      if (r.type === 'call') chains[r.expiration].calls.push(contract)
      else chains[r.expiration].puts.push(contract)
    }

    return jsonResponse({
      symbol,
      snapshotDate: date,
      expirations: [...expirations].sort(),
      totalContracts: results.length,
      chains,
    }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// GET /api/backtest/options/:symbol/snapshots?from=2026-04-01&to=2026-04-17
export async function handleBacktestOptionsSnapshots(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!from || !to) return errorResponse('from and to date params are required', env, request)

  try {
    const { results } = await env.DB.prepare(
      `SELECT snapshot_date, COUNT(*) as contracts
       FROM options_contracts
       WHERE symbol = ? AND snapshot_date >= ? AND snapshot_date <= ?
       GROUP BY snapshot_date
       ORDER BY snapshot_date`
    ).bind(symbol, from, to).all<{ snapshot_date: string; contracts: number }>()

    return jsonResponse({
      symbol,
      from,
      to,
      snapshotDates: results,
    }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}
