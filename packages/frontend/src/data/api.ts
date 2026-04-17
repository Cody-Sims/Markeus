import type { StockCandle, StockQuote, OptionsChain } from './types'

// In production, this should be your deployed Cloudflare Worker URL.
// For local dev, the worker runs on localhost:8787.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8787'

async function apiFetch<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`)
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error((body as { error?: string }).error || `API error ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

// Stock data
export async function fetchStockHistory(
  symbol: string,
  range = '1y',
  interval = '1d'
): Promise<StockCandle[]> {
  const data = await apiFetch<{ candles: StockCandle[] }>(
    `/api/stocks/${encodeURIComponent(symbol)}/history?range=${range}&interval=${interval}`
  )
  return data.candles
}

export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  return apiFetch<StockQuote>(`/api/stocks/${encodeURIComponent(symbol)}/quote`)
}

// Options data
export async function fetchOptionsChain(
  symbol: string,
  expiration?: string
): Promise<OptionsChain> {
  const params = expiration ? `?expiration=${expiration}` : ''
  return apiFetch<OptionsChain>(`/api/options/${encodeURIComponent(symbol)}/chain${params}`)
}

export async function fetchOptionsExpirations(symbol: string): Promise<string[]> {
  const data = await apiFetch<{ expirations: string[] }>(
    `/api/options/${encodeURIComponent(symbol)}/expirations`
  )
  return data.expirations
}
