import type { Env } from '../types'
import { jsonResponse, errorResponse } from '../cors'
import * as yahoo from '../providers/yahoo'

export async function handleOptionsChain(
  request: Request,
  env: Env,
  symbol: string
): Promise<Response> {
  const url = new URL(request.url)
  const expiration = url.searchParams.get('expiration') || undefined

  try {
    const chain = await yahoo.fetchOptionsChain(symbol, expiration)
    return jsonResponse(chain, env, request)
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
  try {
    const expirations = await yahoo.fetchExpirations(symbol)
    return jsonResponse({ symbol: symbol.toUpperCase(), expirations }, env, request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorResponse(msg, env, request, 502)
  }
}
