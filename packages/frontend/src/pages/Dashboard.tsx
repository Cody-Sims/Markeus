import { useEffect, useMemo, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, BarChart3, DollarSign, RefreshCw, Search } from 'lucide-react'
import CandlestickChart from '../components/charts/CandlestickChart'
import { useMarketData } from '../store/marketData'
import { generateSampleData } from '../utils/sampleData'

const ranges = ['1mo', '3mo', '6mo', '1y', '2y', '5y'] as const

const stats = [
  { label: 'Portfolio Value', value: '$125,430', change: '+12.5%', positive: true, icon: DollarSign },
  { label: 'Total P&L', value: '+$15,430', change: 'Since Jan 2024', positive: true, icon: TrendingUp },
  { label: 'Win Rate', value: '64.2%', change: '128 / 200 trades', positive: true, icon: BarChart3 },
  { label: 'Max Drawdown', value: '-8.3%', change: 'Feb 15 - Mar 2', positive: false, icon: TrendingDown },
]

export default function Dashboard() {
  const { symbol, setSymbol, candles, candlesLoading, candlesError, fetchCandles, quote, fetchQuote } = useMarketData()
  const [range, setRange] = useState<string>('1y')
  const [inputSymbol, setInputSymbol] = useState(symbol)
  const sampleData = useMemo(() => generateSampleData(), [])

  const loadData = useCallback((sym: string, r: string) => {
    fetchCandles(sym, r)
    fetchQuote(sym)
  }, [fetchCandles, fetchQuote])

  useEffect(() => {
    loadData(symbol, range)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const sym = inputSymbol.trim().toUpperCase()
    if (sym) {
      setSymbol(sym)
      loadData(sym, range)
    }
  }

  const handleRangeChange = (r: string) => {
    setRange(r)
    loadData(symbol, r)
  }

  // Use real data if available, otherwise fall back to sample
  const chartData = candles.length > 0
    ? candles.map(c => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close }))
    : sampleData

  const isLive = candles.length > 0

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your backtesting performance</p>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="label">{stat.label}</div>
              <stat.icon size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div className={`value ${stat.positive ? 'positive' : 'negative'}`}>
              {stat.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {stat.change}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={inputSymbol}
                  onChange={e => setInputSymbol(e.target.value.toUpperCase())}
                  placeholder="Symbol"
                  style={{
                    padding: '6px 10px 6px 30px',
                    width: 100,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                />
              </div>
              <button type="submit" className="btn" style={{ padding: '6px 10px' }}>
                <RefreshCw size={14} />
              </button>
            </form>
            {quote && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>${quote.price.toFixed(2)}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: quote.change >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {ranges.map((r) => (
              <button
                key={r}
                className="btn"
                onClick={() => handleRangeChange(r)}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  background: range === r ? 'var(--accent)' : undefined,
                  borderColor: range === r ? 'var(--accent)' : undefined,
                  color: range === r ? 'white' : undefined,
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {candlesError && (
          <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', fontSize: 13 }}>
            {candlesError} — showing sample data
          </div>
        )}

        {candlesLoading && (
          <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading {symbol} data...
          </div>
        )}

        <CandlestickChart data={chartData} height={420} />

        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
          {isLive ? `Live data — ${candles.length} candles` : 'Sample data — configure API to see live data'}
        </div>
      </div>
    </>
  )
}
