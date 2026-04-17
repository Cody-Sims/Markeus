import type { Env, OptionsContract, OptionsChain } from '../types'
import { jsonResponse, errorResponse } from '../cors'
import * as yahoo from '../providers/yahoo'

export async function handleOptionsChain(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  const url = new URL(request.url)
  const expiration = url.searchParams.get('expiration') || undefined
  const fresh = url.searchParams.get('fresh') === 'true'

  // Try D1 first
  if (!fresh && expiration) {
    const stored = await getStoredChain(env, symbol, expiration)
    if (stored) {
      const expirations = await getStoredExpirations(env, symbol)
      return jsonResponse({ symbol, expirations, chains: { [expiration]: stored }, source: 'db' }, env, request)
    }
  }

  try {
    const chain = await yahoo.fetchOptionsChain(symbol, expiration)

    // Store in D1
    await storeChain(env, symbol, chain)

    return jsonResponse({ ...chain, source: 'yahoo' }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 502)
  }
}

export async function handleOptionsExpirations(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  // Try D1 first
  const stored = await getStoredExpirations(env, symbol)
  if (stored.length > 0) {
    // Refresh from Yahoo in background if data is > 1 day old
    return jsonResponse({ symbol: symbol.toUpperCase(), expirations: stored, source: 'db' }, env, request)
  }

  try {
    const expirations = await yahoo.fetchExpirations(symbol)

    await storeExpirations(env, symbol, expirations)

    return jsonResponse({ symbol: symbol.toUpperCase(), expirations, source: 'yahoo' }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 502)
  }
}

// --- D1 helpers ---

async function getStoredChain(
  env: Env,
  symbol: string,
  expiration: string
): Promise<{ calls: OptionsContract[]; puts: OptionsContract[] } | null> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT contract_symbol, type, strike, expiration, bid, ask, last, volume, open_interest, implied_volatility
       FROM options_contracts
       WHERE symbol = ? AND expiration = ?
       ORDER BY strike ASC`
    ).bind(symbol, expiration).all<{
      contract_symbol: string; type: string; strike: number; expiration: string
      bid: number; ask: number; last: number; volume: number
      open_interest: number; implied_volatility: number
    }>()

    if (results.length === 0) return null

    const calls: OptionsContract[] = []
    const puts: OptionsContract[] = []

    for (const r of results) {
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
      if (r.type === 'call') calls.push(contract)
      else puts.push(contract)
    }

    return { calls, puts }
  } catch {
    return null
  }
}

async function getStoredExpirations(env: Env, symbol: string): Promise<string[]> {
  try {
    const { results } = await env.DB.prepare(
      'SELECT expiration FROM options_expirations WHERE symbol = ? ORDER BY expiration ASC'
    ).bind(symbol).all<{ expiration: string }>()

    return results.map((r) => r.expiration)
  } catch {
    return []
  }
}

async function storeChain(env: Env, symbol: string, chain: OptionsChain): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Store expirations
    await storeExpirations(env, symbol, chain.expirations)

    // Store contracts
    for (const [, data] of Object.entries(chain.chains)) {
      const allContracts = [...data.calls, ...data.puts]
      const stmts = allContracts.map((c) =>
        env.DB.prepare(
          `INSERT OR REPLACE INTO options_contracts
           (symbol, contract_symbol, type, strike, expiration, snapshot_date, bid, ask, last, volume, open_interest, implied_volatility)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          symbol, c.symbol, c.type, c.strike, c.expiration, today,
          c.bid, c.ask, c.last, c.volume, c.openInterest, c.impliedVolatility ?? null
        )
      )

      for (let i = 0; i < stmts.length; i += 100) {
        await env.DB.batch(stmts.slice(i, i + 100))
      }
    }

    await env.DB.prepare(
      'INSERT INTO sync_log (symbol, data_type, records_count, status) VALUES (?, ?, ?, ?)'
    ).bind(symbol, 'options', Object.values(chain.chains).reduce((sum, c) => sum + c.calls.length + c.puts.length, 0), 'success').run()
  } catch {
    // Non-fatal
  }
}

async function storeExpirations(env: Env, symbol: string, expirations: string[]): Promise<void> {
  try {
    const stmts = expirations.map((exp) =>
      env.DB.prepare(
        'INSERT OR REPLACE INTO options_expirations (symbol, expiration) VALUES (?, ?)'
      ).bind(symbol, exp)
    )
    for (let i = 0; i < stmts.length; i += 100) {
      await env.DB.batch(stmts.slice(i, i + 100))
    }
  } catch {
    // Non-fatal
  }
}
