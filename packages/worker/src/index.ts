import type { Env } from './types'
import { corsHeaders, jsonResponse, errorResponse } from './cors'
import { handleStockHistory, handleStockQuote } from './routes/stocks'
import { handleOptionsChain, handleOptionsExpirations } from './routes/options'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env, request),
      })
    }

    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', env, request, 405)
    }

    const url = new URL(request.url)
    const path = url.pathname

    // Route matching
    const stockHistory = path.match(/^\/api\/stocks\/([A-Za-z0-9.^-]+)\/history$/)
    if (stockHistory) {
      return handleStockHistory(request, env, stockHistory[1].toUpperCase())
    }

    const stockQuote = path.match(/^\/api\/stocks\/([A-Za-z0-9.^-]+)\/quote$/)
    if (stockQuote) {
      return handleStockQuote(request, env, stockQuote[1].toUpperCase())
    }

    const optionsChain = path.match(/^\/api\/options\/([A-Za-z0-9.^-]+)\/chain$/)
    if (optionsChain) {
      return handleOptionsChain(request, env, optionsChain[1].toUpperCase())
    }

    const optionsExp = path.match(/^\/api\/options\/([A-Za-z0-9.^-]+)\/expirations$/)
    if (optionsExp) {
      return handleOptionsExpirations(request, env, optionsExp[1].toUpperCase())
    }

    // Health check
    if (path === '/api/health') {
      return jsonResponse({ status: 'ok', version: '0.1.0' }, env, request)
    }

    // API docs
    if (path === '/' || path === '/api') {
      return jsonResponse(
        {
          name: 'Markeus API',
          version: '0.1.0',
          endpoints: {
            'GET /api/stocks/:symbol/history': 'Historical OHLCV candles (?range=1y&interval=1d)',
            'GET /api/stocks/:symbol/quote': 'Current price quote',
            'GET /api/options/:symbol/chain': 'Options chain (?expiration=2025-04-18)',
            'GET /api/options/:symbol/expirations': 'Available option expiration dates',
            'GET /api/health': 'Health check',
          },
        },
        env,
        request
      )
    }

    return errorResponse('Not found', env, request, 404)
  },
}
