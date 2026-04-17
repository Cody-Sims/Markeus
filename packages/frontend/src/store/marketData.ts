import { create } from 'zustand'
import * as api from '../data/api'
import { getCached, setCache } from '../data/cache'
import type { StockCandle, StockQuote, OptionsChain } from '../data/types'

interface MarketDataState {
  // Current symbol
  symbol: string
  setSymbol: (symbol: string) => void

  // Stock history
  candles: StockCandle[]
  candlesLoading: boolean
  candlesError: string | null
  fetchCandles: (symbol: string, range?: string, interval?: string) => Promise<void>

  // Stock quote
  quote: StockQuote | null
  quoteLoading: boolean
  fetchQuote: (symbol: string) => Promise<void>

  // Options
  optionsChain: OptionsChain | null
  optionsLoading: boolean
  optionsError: string | null
  fetchOptions: (symbol: string, expiration?: string) => Promise<void>
}

export const useMarketData = create<MarketDataState>((set) => ({
  symbol: 'SPY',
  setSymbol: (symbol) => set({ symbol }),

  candles: [],
  candlesLoading: false,
  candlesError: null,
  fetchCandles: async (symbol, range = '1y', interval = '1d') => {
    set({ candlesLoading: true, candlesError: null })

    const cacheKey = `candles:${symbol}:${range}:${interval}`
    const cached = await getCached<StockCandle[]>(cacheKey)
    if (cached) {
      set({ candles: cached, candlesLoading: false })
      return
    }

    try {
      const candles = await api.fetchStockHistory(symbol, range, interval)
      await setCache(cacheKey, candles, 14400) // 4 hour TTL
      set({ candles, candlesLoading: false })
    } catch (err) {
      set({
        candlesError: err instanceof Error ? err.message : 'Failed to fetch candles',
        candlesLoading: false,
      })
    }
  },

  quote: null,
  quoteLoading: false,
  fetchQuote: async (symbol) => {
    set({ quoteLoading: true })
    try {
      const quote = await api.fetchStockQuote(symbol)
      set({ quote, quoteLoading: false })
    } catch {
      set({ quoteLoading: false })
    }
  },

  optionsChain: null,
  optionsLoading: false,
  optionsError: null,
  fetchOptions: async (symbol, expiration) => {
    set({ optionsLoading: true, optionsError: null })
    try {
      const optionsChain = await api.fetchOptionsChain(symbol, expiration)
      set({ optionsChain, optionsLoading: false })
    } catch (err) {
      set({
        optionsError: err instanceof Error ? err.message : 'Failed to fetch options',
        optionsLoading: false,
      })
    }
  },
}))
