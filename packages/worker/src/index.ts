import type { Env } from './types'
import { corsHeaders, jsonResponse, errorResponse } from './cors'
import { handleStockHistory, handleStockQuote, handleStockGaps } from './routes/stocks'
import { handleOptionsChain, handleOptionsExpirations } from './routes/options'
import {
  handleListWatchlists, handleCreateWatchlist,
  handleAddSymbols, handleRemoveSymbol, handleDeleteWatchlist,
} from './routes/watchlists'
import { handleSync, handleSyncStatus, handleDailySync } from './routes/sync'
import { handleInventory, handleInventorySymbol } from './routes/inventory'
import { handleBacktestCandles, handleBacktestOptionsSnapshot, handleBacktestOptionsSnapshots } from './routes/backtest'
import { runDailySync } from './sync-engine'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env, request),
      })
    }

    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // --- GET routes ---

    if (method === 'GET') {
      // Stock routes
      const stockHistory = path.match(/^\/api\/stocks\/([A-Za-z0-9.^-]+)\/history$/)
      if (stockHistory) return handleStockHistory(request, env, stockHistory[1].toUpperCase())

      const stockQuote = path.match(/^\/api\/stocks\/([A-Za-z0-9.^-]+)\/quote$/)
      if (stockQuote) return handleStockQuote(request, env, stockQuote[1].toUpperCase())

      const stockGaps = path.match(/^\/api\/stocks\/([A-Za-z0-9.^-]+)\/gaps$/)
      if (stockGaps) return handleStockGaps(request, env, stockGaps[1].toUpperCase())

      // Options routes
      const optionsChain = path.match(/^\/api\/options\/([A-Za-z0-9.^-]+)\/chain$/)
      if (optionsChain) return handleOptionsChain(request, env, optionsChain[1].toUpperCase())

      const optionsExp = path.match(/^\/api\/options\/([A-Za-z0-9.^-]+)\/expirations$/)
      if (optionsExp) return handleOptionsExpirations(request, env, optionsExp[1].toUpperCase())

      // Watchlists
      if (path === '/api/watchlists') return handleListWatchlists(request, env)

      // Sync
      if (path === '/api/sync/status') return handleSyncStatus(request, env)

      // Inventory
      if (path === '/api/inventory') return handleInventory(request, env)

      const inventorySymbol = path.match(/^\/api\/inventory\/([A-Za-z0-9.^-]+)$/)
      if (inventorySymbol) return handleInventorySymbol(request, env, inventorySymbol[1].toUpperCase())

      // Backtest
      if (path === '/api/backtest/candles') return handleBacktestCandles(request, env)

      const btOptSnapshot = path.match(/^\/api\/backtest\/options\/([A-Za-z0-9.^-]+)\/snapshot$/)
      if (btOptSnapshot) return handleBacktestOptionsSnapshot(request, env, btOptSnapshot[1].toUpperCase())

      const btOptSnapshots = path.match(/^\/api\/backtest\/options\/([A-Za-z0-9.^-]+)\/snapshots$/)
      if (btOptSnapshots) return handleBacktestOptionsSnapshots(request, env, btOptSnapshots[1].toUpperCase())

      // Health & API info
      if (path === '/api/health') return jsonResponse({ status: 'ok', version: '0.3.0' }, env, request)

      if (path === '/' || path === '/api') {
        return jsonResponse({
          name: 'Markeus API',
          version: '0.3.0',
          endpoints: {
            stocks: {
              'GET  /api/stocks/:symbol/history': 'Historical OHLCV (?range=1y&interval=1d&fresh=true)',
              'GET  /api/stocks/:symbol/quote': 'Current price quote',
              'GET  /api/stocks/:symbol/gaps': 'Detect missing trading days (?from=&to=)',
            },
            options: {
              'GET  /api/options/:symbol/chain': 'Options chain (?expiration=YYYY-MM-DD)',
              'GET  /api/options/:symbol/expirations': 'Available expiration dates',
            },
            watchlists: {
              'GET  /api/watchlists': 'List all watchlists',
              'POST /api/watchlists': 'Create watchlist { name, symbols? }',
              'PUT  /api/watchlists/:id/symbols': 'Add symbols { symbols: [] }',
              'DEL  /api/watchlists/:id/symbols/:symbol': 'Remove symbol',
              'DEL  /api/watchlists/:id': 'Delete watchlist',
            },
            sync: {
              'POST /api/sync': 'Sync data { symbols?, incremental?, optionsExpirations? }',
              'POST /api/sync/daily': 'Trigger daily cron sync manually',
              'GET  /api/sync/status': 'View sync status & data totals',
            },
            inventory: {
              'GET  /api/inventory': 'Data coverage overview (all symbols)',
              'GET  /api/inventory/:symbol': 'Detailed coverage for one symbol',
            },
            backtest: {
              'GET  /api/backtest/candles': 'Multi-symbol candles (?symbols=GLD,AAPL&from=&to=)',
              'GET  /api/backtest/options/:symbol/snapshot': 'Full chain on a date (?date=)',
              'GET  /api/backtest/options/:symbol/snapshots': 'Available snapshot dates (?from=&to=)',
            },
          },
        }, env, request)
      }
    }

    // --- POST routes ---

    if (method === 'POST') {
      if (path === '/api/watchlists') return handleCreateWatchlist(request, env)
      if (path === '/api/sync') return handleSync(request, env)
      if (path === '/api/sync/daily') return handleDailySync(request, env)
    }

    // --- PUT routes ---

    if (method === 'PUT') {
      const addSymbols = path.match(/^\/api\/watchlists\/(\d+)\/symbols$/)
      if (addSymbols) return handleAddSymbols(request, env, parseInt(addSymbols[1]))
    }

    // --- DELETE routes ---

    if (method === 'DELETE') {
      const removeSymbol = path.match(/^\/api\/watchlists\/(\d+)\/symbols\/([A-Za-z0-9.^-]+)$/)
      if (removeSymbol) return handleRemoveSymbol(request, env, parseInt(removeSymbol[1]), removeSymbol[2].toUpperCase())

      const deleteWatchlist = path.match(/^\/api\/watchlists\/(\d+)$/)
      if (deleteWatchlist) return handleDeleteWatchlist(request, env, parseInt(deleteWatchlist[1]))
    }

    return errorResponse('Not found', env, request, 404)
  },

  // Cron trigger: runs daily after market close (see wrangler.toml)
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    ctx.waitUntil(runDailySync(env.DB))
  },
}
