import type { Env } from '../types'
import { jsonResponse, errorResponse } from '../cors'

interface Watchlist {
  id: number
  name: string
  source: string
  yahoo_list_id: string | null
  created_at: string
  updated_at: string
  symbols: string[]
}

// GET /api/watchlists — list all watchlists with their symbols
export async function handleListWatchlists(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const { results: lists } = await env.DB.prepare(
      'SELECT * FROM watchlists ORDER BY created_at ASC'
    ).all<{ id: number; name: string; source: string; yahoo_list_id: string | null; created_at: string; updated_at: string }>()

    const watchlists: Watchlist[] = []

    for (const list of lists) {
      const { results: symbols } = await env.DB.prepare(
        'SELECT symbol FROM watchlist_symbols WHERE watchlist_id = ? ORDER BY added_at ASC'
      ).bind(list.id).all<{ symbol: string }>()

      watchlists.push({
        ...list,
        symbols: symbols.map((s) => s.symbol),
      })
    }

    return jsonResponse({ watchlists }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// POST /api/watchlists — create a new watchlist
// Body: { name: string, symbols?: string[] }
export async function handleCreateWatchlist(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json<{ name: string; symbols?: string[] }>()

    if (!body.name || typeof body.name !== 'string') {
      return errorResponse('name is required', env, request)
    }

    const result = await env.DB.prepare(
      'INSERT INTO watchlists (name) VALUES (?)'
    ).bind(body.name.trim()).run()

    const watchlistId = result.meta.last_row_id

    if (body.symbols && body.symbols.length > 0) {
      const stmts = body.symbols.map((sym) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO watchlist_symbols (watchlist_id, symbol) VALUES (?, ?)'
        ).bind(watchlistId, sym.toUpperCase().trim())
      )
      await env.DB.batch(stmts)
    }

    return jsonResponse({ id: watchlistId, name: body.name, symbols: body.symbols || [] }, env, request, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('UNIQUE')) {
      return errorResponse('A watchlist with that name already exists', env, request, 409)
    }
    return errorResponse(msg, env, request, 500)
  }
}

// PUT /api/watchlists/:id/symbols — add symbols to a watchlist
// Body: { symbols: string[] }
export async function handleAddSymbols(
  request: Request,
  env: Env,
  watchlistId: number
): Promise<Response> {
  try {
    const body = await request.json<{ symbols: string[] }>()

    if (!body.symbols || !Array.isArray(body.symbols)) {
      return errorResponse('symbols array is required', env, request)
    }

    const stmts = body.symbols.map((sym) =>
      env.DB.prepare(
        'INSERT OR IGNORE INTO watchlist_symbols (watchlist_id, symbol) VALUES (?, ?)'
      ).bind(watchlistId, sym.toUpperCase().trim())
    )
    await env.DB.batch(stmts)

    // Update watchlist timestamp
    await env.DB.prepare(
      "UPDATE watchlists SET updated_at = datetime('now') WHERE id = ?"
    ).bind(watchlistId).run()

    return jsonResponse({ added: body.symbols.length }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// DELETE /api/watchlists/:id/symbols/:symbol — remove a symbol from a watchlist
export async function handleRemoveSymbol(
  request: Request,
  env: Env,
  watchlistId: number,
  symbol: string
): Promise<Response> {
  try {
    await env.DB.prepare(
      'DELETE FROM watchlist_symbols WHERE watchlist_id = ? AND symbol = ?'
    ).bind(watchlistId, symbol).run()

    await env.DB.prepare(
      "UPDATE watchlists SET updated_at = datetime('now') WHERE id = ?"
    ).bind(watchlistId).run()

    return jsonResponse({ removed: symbol }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}

// DELETE /api/watchlists/:id — delete a watchlist
export async function handleDeleteWatchlist(
  request: Request,
  env: Env,
  watchlistId: number
): Promise<Response> {
  try {
    await env.DB.prepare('DELETE FROM watchlists WHERE id = ?').bind(watchlistId).run()
    return jsonResponse({ deleted: watchlistId }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 500)
  }
}
