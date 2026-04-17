import type { StockCandle, StockQuote, OptionsChain, OptionsContract } from '../types'

const YAHOO_BASE = 'https://query1.finance.yahoo.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

// --- Crumb + Cookie Auth (needed for v7 endpoints like options) ---

let cachedCrumb: { crumb: string; cookie: string; expiresAt: number } | null = null

async function getCrumbAndCookie(): Promise<{ crumb: string; cookie: string }> {
  // Return cached if still valid (cache for 30 minutes)
  if (cachedCrumb && cachedCrumb.expiresAt > Date.now()) {
    return { crumb: cachedCrumb.crumb, cookie: cachedCrumb.cookie }
  }

  // Step 1: Hit fc.yahoo.com to get session cookies
  const cookieResp = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
  })

  // Extract Set-Cookie headers
  const setCookies = cookieResp.headers.getAll('Set-Cookie')
  const cookieParts: string[] = []
  for (const sc of setCookies) {
    const name = sc.split(';')[0]
    if (name) cookieParts.push(name)
  }
  const cookieString = cookieParts.join('; ')

  if (!cookieString) {
    throw new Error('Failed to obtain Yahoo session cookies')
  }

  // Step 2: Get crumb using session cookies
  const crumbResp = await fetch(`${YAHOO_BASE}/v1/test/getcrumb`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookieString,
    },
  })

  if (!crumbResp.ok) {
    throw new Error(`Failed to get Yahoo crumb: ${crumbResp.status}`)
  }

  const crumb = await crumbResp.text()

  if (!crumb || crumb.includes('<html')) {
    throw new Error('Invalid Yahoo crumb response')
  }

  cachedCrumb = { crumb, cookie: cookieString, expiresAt: Date.now() + 30 * 60 * 1000 }
  return { crumb, cookie: cookieString }
}

async function yahooFetchWithCrumb(url: string): Promise<Response> {
  const { crumb, cookie } = await getCrumbAndCookie()
  const separator = url.includes('?') ? '&' : '?'
  const fullUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`

  const resp = await fetch(fullUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookie,
    },
  })

  // If 401, invalidate cache and retry once
  if (resp.status === 401) {
    cachedCrumb = null
    const fresh = await getCrumbAndCookie()
    const retryUrl = `${url}${separator}crumb=${encodeURIComponent(fresh.crumb)}`
    return fetch(retryUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': fresh.cookie,
      },
    })
  }

  return resp
}

// --- Stock History (v8/chart - no crumb needed) ---

interface YahooChartResult {
  chart: {
    result: Array<{
      timestamp: number[]
      indicators: {
        quote: Array<{
          open: number[]
          high: number[]
          low: number[]
          close: number[]
          volume: number[]
        }>
        adjclose?: Array<{ adjclose: number[] }>
      }
    }>
    error: null | { code: string; description: string }
  }
}

export async function fetchStockHistory(
  symbol: string,
  range = '1y',
  interval = '1d'
): Promise<StockCandle[]> {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`

  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!resp.ok) {
    throw new Error(`Yahoo Finance returned ${resp.status} for ${symbol}`)
  }

  const data = (await resp.json()) as YahooChartResult

  if (data.chart.error) {
    throw new Error(data.chart.error.description)
  }

  const result = data.chart.result[0]
  if (!result) {
    throw new Error(`No data found for ${symbol}`)
  }

  const { timestamp, indicators } = result
  const quote = indicators.quote[0]
  const adjclose = indicators.adjclose?.[0]?.adjclose

  const candles: StockCandle[] = []

  for (let i = 0; i < timestamp.length; i++) {
    if (quote.open[i] == null || quote.close[i] == null) continue

    const date = new Date(timestamp[i] * 1000)
    candles.push({
      date: date.toISOString().split('T')[0],
      open: round(quote.open[i]),
      high: round(quote.high[i]),
      low: round(quote.low[i]),
      close: round(adjclose ? adjclose[i] : quote.close[i]),
      volume: Math.round(quote.volume[i]),
    })
  }

  return candles
}

// Incremental fetch: only get candles from a specific date forward
export async function fetchStockHistorySince(
  symbol: string,
  fromDate: string,
  toDate?: string
): Promise<StockCandle[]> {
  // period1 = day after fromDate to avoid re-fetching the last known day
  const from = new Date(fromDate)
  from.setDate(from.getDate() + 1)
  const period1 = Math.floor(from.getTime() / 1000)

  const to = toDate ? new Date(toDate) : new Date()
  to.setHours(23, 59, 59)
  const period2 = Math.floor(to.getTime() / 1000)

  if (period1 >= period2) return [] // already up to date

  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=false`

  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!resp.ok) {
    throw new Error(`Yahoo Finance returned ${resp.status} for ${symbol}`)
  }

  const data = (await resp.json()) as YahooChartResult

  if (data.chart.error) {
    throw new Error(data.chart.error.description)
  }

  const result = data.chart.result[0]
  if (!result || !result.timestamp || result.timestamp.length === 0) {
    return [] // no new data
  }

  const { timestamp, indicators } = result
  const quote = indicators.quote[0]
  const adjclose = indicators.adjclose?.[0]?.adjclose

  const candles: StockCandle[] = []

  for (let i = 0; i < timestamp.length; i++) {
    if (quote.open[i] == null || quote.close[i] == null) continue

    const date = new Date(timestamp[i] * 1000)
    const dateStr = date.toISOString().split('T')[0]

    // Extra guard: skip if somehow <= fromDate
    if (dateStr <= fromDate) continue

    candles.push({
      date: dateStr,
      open: round(quote.open[i]),
      high: round(quote.high[i]),
      low: round(quote.low[i]),
      close: round(adjclose ? adjclose[i] : quote.close[i]),
      volume: Math.round(quote.volume[i]),
    })
  }

  return candles
}

export async function fetchQuote(symbol: string): Promise<StockQuote> {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`

  const resp = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  })

  if (!resp.ok) {
    throw new Error(`Yahoo Finance returned ${resp.status} for ${symbol}`)
  }

  const data = (await resp.json()) as YahooChartResult
  const result = data.chart.result[0]
  if (!result) throw new Error(`No data found for ${symbol}`)

  const quote = result.indicators.quote[0]
  const lastIdx = quote.close.length - 1
  const prevClose = quote.open[0]

  const price = quote.close[lastIdx] ?? quote.open[lastIdx]
  const change = price - prevClose

  return {
    symbol: symbol.toUpperCase(),
    price: round(price),
    change: round(change),
    changePercent: round((change / prevClose) * 100),
    high: round(quote.high[lastIdx]),
    low: round(quote.low[lastIdx]),
    open: round(quote.open[0]),
    previousClose: round(prevClose),
    timestamp: result.timestamp[lastIdx] * 1000,
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// --- Options Chain (v7 - needs crumb auth) ---

interface YahooOption {
  contractSymbol: string
  strike: number
  expiration: number
  bid: number
  ask: number
  lastPrice: number
  volume: number
  openInterest: number
  impliedVolatility: number
  inTheMoney: boolean
}

interface YahooOptionsResult {
  optionChain: {
    result: Array<{
      expirationDates: number[]
      strikes: number[]
      options: Array<{
        expirationDate: number
        calls: YahooOption[]
        puts: YahooOption[]
      }>
    }>
    error: null | { code: string; description: string }
  }
}

export async function fetchOptionsChain(
  symbol: string,
  expiration?: string
): Promise<OptionsChain> {
  let url = `${YAHOO_BASE}/v7/finance/options/${encodeURIComponent(symbol)}`
  if (expiration) {
    const epoch = Math.floor(new Date(expiration).getTime() / 1000)
    url += `?date=${epoch}`
  }

  const resp = await yahooFetchWithCrumb(url)

  if (!resp.ok) {
    throw new Error(`Yahoo Finance options returned ${resp.status} for ${symbol}`)
  }

  const data = (await resp.json()) as YahooOptionsResult

  if (data.optionChain.error) {
    throw new Error(data.optionChain.error.description)
  }

  const result = data.optionChain.result[0]
  if (!result) throw new Error(`No options data for ${symbol}`)

  const expirations = result.expirationDates.map(
    (epoch) => new Date(epoch * 1000).toISOString().split('T')[0]
  )

  const chains: OptionsChain['chains'] = {}

  for (const option of result.options) {
    const expDate = new Date(option.expirationDate * 1000).toISOString().split('T')[0]

    chains[expDate] = {
      calls: option.calls.map(convertYahooOption),
      puts: option.puts.map(convertYahooOption),
    }
  }

  return {
    symbol: symbol.toUpperCase(),
    expirations,
    chains,
  }
}

export async function fetchExpirations(symbol: string): Promise<string[]> {
  const url = `${YAHOO_BASE}/v7/finance/options/${encodeURIComponent(symbol)}`

  const resp = await yahooFetchWithCrumb(url)

  if (!resp.ok) throw new Error(`Yahoo Finance options returned ${resp.status}`)

  const data = (await resp.json()) as YahooOptionsResult
  const result = data.optionChain.result[0]
  if (!result) return []

  return result.expirationDates.map(
    (epoch) => new Date(epoch * 1000).toISOString().split('T')[0]
  )
}

function convertYahooOption(opt: YahooOption): OptionsContract {
  return {
    symbol: opt.contractSymbol,
    type: opt.contractSymbol.includes('C') ? 'call' : 'put',
    strike: opt.strike,
    expiration: new Date(opt.expiration * 1000).toISOString().split('T')[0],
    bid: opt.bid ?? 0,
    ask: opt.ask ?? 0,
    last: opt.lastPrice ?? 0,
    volume: opt.volume ?? 0,
    openInterest: opt.openInterest ?? 0,
    impliedVolatility: opt.impliedVolatility,
  }
}
