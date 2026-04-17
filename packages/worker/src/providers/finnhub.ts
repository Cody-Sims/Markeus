import type { StockCandle, StockQuote } from '../types'

const FINNHUB_BASE = 'https://finnhub.io/api/v1'

interface FinnhubCandleResponse {
  s: string // 'ok' or 'no_data'
  t: number[]
  o: number[]
  h: number[]
  l: number[]
  c: number[]
  v: number[]
}

interface FinnhubQuoteResponse {
  c: number  // current
  d: number  // change
  dp: number // change percent
  h: number  // high
  l: number  // low
  o: number  // open
  pc: number // prev close
  t: number  // timestamp
}

export async function fetchStockHistory(
  symbol: string,
  apiKey: string,
  fromDate: string,
  toDate: string,
  resolution = 'D'
): Promise<StockCandle[]> {
  const from = Math.floor(new Date(fromDate).getTime() / 1000)
  const to = Math.floor(new Date(toDate).getTime() / 1000)

  const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Finnhub returned ${resp.status}`)

  const data = (await resp.json()) as FinnhubCandleResponse

  if (data.s !== 'ok' || !data.t) {
    throw new Error(`No candle data for ${symbol}`)
  }

  return data.t.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().split('T')[0],
    open: round(data.o[i]),
    high: round(data.h[i]),
    low: round(data.l[i]),
    close: round(data.c[i]),
    volume: Math.round(data.v[i]),
  }))
}

export async function fetchQuote(symbol: string, apiKey: string): Promise<StockQuote> {
  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Finnhub returned ${resp.status}`)

  const data = (await resp.json()) as FinnhubQuoteResponse

  return {
    symbol: symbol.toUpperCase(),
    price: round(data.c),
    change: round(data.d),
    changePercent: round(data.dp),
    high: round(data.h),
    low: round(data.l),
    open: round(data.o),
    previousClose: round(data.pc),
    timestamp: data.t * 1000,
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
