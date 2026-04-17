export interface Env {
  DB: D1Database
  ALLOWED_ORIGIN: string
  FINNHUB_API_KEY?: string
}

export interface StockCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StockQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  previousClose: number
  timestamp: number
}

export interface OptionsContract {
  symbol: string
  type: 'call' | 'put'
  strike: number
  expiration: string
  bid: number
  ask: number
  last: number
  volume: number
  openInterest: number
  impliedVolatility?: number
}

export interface OptionsChain {
  symbol: string
  expirations: string[]
  chains: Record<string, { calls: OptionsContract[]; puts: OptionsContract[] }>
}
