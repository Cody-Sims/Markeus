import { BookOpen } from 'lucide-react'

const strategyCategories = [
  {
    category: 'Stock — Trend Following',
    strategies: [
      { name: 'Moving Average Crossover', description: 'Buy when fast SMA crosses above slow SMA. Classic trend-following signal.' },
      { name: 'MACD Signal', description: 'Enter on MACD line crossing signal line with histogram confirmation.' },
      { name: 'Momentum', description: 'Buy top N% performers over lookback period, rebalance monthly.' },
      { name: 'Breakout (Donchian)', description: 'Buy on new 20-day high, sell on new 10-day low.' },
    ],
  },
  {
    category: 'Stock — Mean Reversion',
    strategies: [
      { name: 'RSI Reversal', description: 'Buy when RSI drops below 30, sell when it rises above 70.' },
      { name: 'Bollinger Band Bounce', description: 'Buy at lower band, sell at mean or upper band.' },
    ],
  },
  {
    category: 'Options — Income',
    strategies: [
      { name: 'The Wheel', description: 'Sell CSPs until assigned, then sell CCs until called away. Repeat.' },
      { name: 'Covered Call', description: 'Own 100 shares + sell OTM call. Collect premium, cap upside.' },
      { name: 'Credit Spread', description: 'Sell bull put or bear call spread. Defined risk, collect premium.' },
      { name: 'Iron Condor', description: 'Sell OTM put spread + call spread. Profit when stock stays in range.' },
    ],
  },
  {
    category: 'Options — Directional / Vol',
    strategies: [
      { name: 'Long Straddle', description: 'Buy ATM call + put. Profit from large moves in either direction.' },
      { name: 'Protective Put', description: 'Buy stock + OTM put. Insurance against downside.' },
    ],
  },
]

export default function Strategies() {
  return (
    <>
      <div className="page-header">
        <h2>Strategies</h2>
        <p>Library of trading strategies available for backtesting</p>
      </div>

      {strategyCategories.map((cat) => (
        <div key={cat.category} className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3>{cat.category}</h3>
          </div>
          <div className="grid grid-2">
            {cat.strategies.map((s) => (
              <div
                key={s.name}
                style={{
                  padding: 16,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <BookOpen size={14} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
