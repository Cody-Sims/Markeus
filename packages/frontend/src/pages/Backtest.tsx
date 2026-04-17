import { FlaskConical } from 'lucide-react'

const strategies = [
  { name: 'MA Crossover', type: 'Stock', params: 'SMA 50/200', phase: 4 },
  { name: 'RSI Reversal', type: 'Stock', params: 'RSI < 30 buy, > 70 sell', phase: 4 },
  { name: 'MACD Signal', type: 'Stock', params: '12/26/9 crossover', phase: 4 },
  { name: 'The Wheel', type: 'Options', params: 'CSP → CC cycle', phase: 5 },
  { name: 'Iron Condor', type: 'Options', params: 'OTM spreads both sides', phase: 5 },
  { name: 'Covered Call', type: 'Options', params: '30 delta, 30 DTE', phase: 5 },
]

export default function Backtest() {
  return (
    <>
      <div className="page-header">
        <h2>Backtest</h2>
        <p>Configure and run strategy backtests</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3>Quick Start</h3>
        </div>
        <div className="empty-state">
          <FlaskConical size={48} />
          <h3>Backtesting Engine Coming in Phase 4</h3>
          <p>
            The Web Worker-based backtesting engine will run strategies against historical data
            entirely in your browser. Configure symbols, date ranges, and strategy parameters
            here.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Planned Strategies</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Phases 4 & 5
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Strategy</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parameters</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phase</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((s) => (
              <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{s.name}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    background: s.type === 'Stock' ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.15)',
                    color: s.type === 'Stock' ? 'var(--green)' : 'var(--accent)',
                  }}>
                    {s.type}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{s.params}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>Phase {s.phase}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
