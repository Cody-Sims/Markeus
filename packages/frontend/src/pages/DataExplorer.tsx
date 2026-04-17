import { useEffect, useMemo, useState, useCallback } from 'react'
import { Database, Search, RefreshCw, Loader } from 'lucide-react'
import CandlestickChart from '../components/charts/CandlestickChart'
import { useMarketData } from '../store/marketData'
import { generateSampleData } from '../utils/sampleData'
import type { OptionsContract } from '../data/types'

const dataSources = [
  { name: 'Yahoo Finance', status: 'Connected', type: 'Stocks + Options', description: 'Daily OHLCV and full options chains via Cloudflare Worker proxy', active: true },
  { name: 'Finnhub', status: 'Optional', type: 'Real-time Quotes', description: 'Real-time quotes (60/min free), set FINNHUB_API_KEY to enable', active: false },
  { name: 'Alpha Vantage', status: 'Planned', type: 'Fallback', description: 'Daily data + technical indicators (25/day limit)', active: false },
]

export default function DataExplorer() {
  const {
    candles, candlesLoading, candlesError, fetchCandles,
    optionsChain, optionsLoading, optionsError, fetchOptions,
  } = useMarketData()

  const [symbol, setSymbol] = useState('AAPL')
  const [inputSymbol, setInputSymbol] = useState('AAPL')
  const [selectedExpiration, setSelectedExpiration] = useState<string | undefined>()
  const [activeTab, setActiveTab] = useState<'chart' | 'options'>('chart')
  const sampleData = useMemo(() => generateSampleData(120), [])

  const loadSymbol = useCallback((sym: string) => {
    fetchCandles(sym, '6mo')
    fetchOptions(sym)
  }, [fetchCandles, fetchOptions])

  useEffect(() => {
    loadSymbol(symbol)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const sym = inputSymbol.trim().toUpperCase()
    if (sym) {
      setSymbol(sym)
      setSelectedExpiration(undefined)
      loadSymbol(sym)
    }
  }

  const handleExpirationChange = (exp: string) => {
    setSelectedExpiration(exp)
    fetchOptions(symbol, exp)
  }

  const chartData = candles.length > 0
    ? candles.map(c => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close }))
    : sampleData

  const currentChain = optionsChain && selectedExpiration
    ? optionsChain.chains[selectedExpiration]
    : optionsChain
      ? Object.values(optionsChain.chains)[0]
      : null

  return (
    <>
      <div className="page-header">
        <h2>Data Explorer</h2>
        <p>Browse historical stock and options data</p>
      </div>

      {/* Symbol search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 6 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={inputSymbol}
              onChange={e => setInputSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol"
              style={{
                padding: '8px 10px 8px 30px',
                width: 120,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 600,
              }}
            />
          </div>
          <button type="submit" className="btn-primary btn">
            <RefreshCw size={14} /> Load
          </button>
        </form>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn"
            onClick={() => setActiveTab('chart')}
            style={{
              background: activeTab === 'chart' ? 'var(--accent)' : undefined,
              borderColor: activeTab === 'chart' ? 'var(--accent)' : undefined,
              color: activeTab === 'chart' ? 'white' : undefined,
            }}
          >
            Chart
          </button>
          <button
            className="btn"
            onClick={() => setActiveTab('options')}
            style={{
              background: activeTab === 'options' ? 'var(--accent)' : undefined,
              borderColor: activeTab === 'options' ? 'var(--accent)' : undefined,
              color: activeTab === 'options' ? 'white' : undefined,
            }}
          >
            Options Chain
          </button>
        </div>
      </div>

      {/* Chart tab */}
      {activeTab === 'chart' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3>{symbol} — {candles.length > 0 ? 'Live Data' : 'Sample Data'}</h3>
            {candlesLoading && <Loader size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />}
          </div>
          {candlesError && (
            <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', fontSize: 13 }}>
              {candlesError}
            </div>
          )}
          <CandlestickChart data={chartData} height={350} />
        </div>
      )}

      {/* Options tab */}
      {activeTab === 'options' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3>{symbol} Options Chain</h3>
            {optionsLoading && <Loader size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />}
          </div>

          {optionsError && (
            <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', fontSize: 13 }}>
              {optionsError}
            </div>
          )}

          {optionsChain && optionsChain.expirations.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {optionsChain.expirations.slice(0, 8).map(exp => (
                <button
                  key={exp}
                  className="btn"
                  onClick={() => handleExpirationChange(exp)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    background: (selectedExpiration || optionsChain.expirations[0]) === exp ? 'var(--accent)' : undefined,
                    borderColor: (selectedExpiration || optionsChain.expirations[0]) === exp ? 'var(--accent)' : undefined,
                    color: (selectedExpiration || optionsChain.expirations[0]) === exp ? 'white' : undefined,
                  }}
                >
                  {exp}
                </button>
              ))}
            </div>
          )}

          {currentChain ? (
            <div className="grid grid-2">
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--green)' }}>Calls</h4>
                <OptionsTable contracts={currentChain.calls} />
              </div>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--red)' }}>Puts</h4>
                <OptionsTable contracts={currentChain.puts} />
              </div>
            </div>
          ) : !optionsLoading && (
            <div className="empty-state">
              <Database size={32} />
              <h3>No options data</h3>
              <p>Search for a symbol above to load its options chain.</p>
            </div>
          )}
        </div>
      )}

      {/* Data sources */}
      <div className="card">
        <div className="card-header">
          <h3>Data Sources</h3>
        </div>
        <div className="grid grid-2">
          {dataSources.map((ds) => (
            <div
              key={ds.name}
              style={{
                padding: 16,
                background: 'var(--bg-tertiary)',
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Database size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{ds.name}</span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: ds.active ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                  color: ds.active ? 'var(--green)' : 'var(--yellow)',
                }}>
                  {ds.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 4 }}>{ds.type}</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{ds.description}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

function OptionsTable({ contracts }: { contracts: OptionsContract[] }) {
  if (contracts.length === 0) return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No contracts</div>

  return (
    <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
            {['Strike', 'Bid', 'Ask', 'Last', 'Vol', 'OI'].map(h => (
              <th key={h} style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.strike} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{c.strike.toFixed(2)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{c.bid.toFixed(2)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{c.ask.toFixed(2)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{c.last.toFixed(2)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{c.volume.toLocaleString()}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{c.openInterest.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
