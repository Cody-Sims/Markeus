import { Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FlaskConical,
  BookOpen,
  Database,
  TrendingUp,
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Backtest from './pages/Backtest'
import Strategies from './pages/Strategies'
import DataExplorer from './pages/DataExplorer'
import './App.css'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/backtest', icon: FlaskConical, label: 'Backtest' },
  { to: '/strategies', icon: BookOpen, label: 'Strategies' },
  { to: '/data', icon: Database, label: 'Data Explorer' },
]

function App() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>
            <span>M</span>arkeus
          </h1>
          <p>Strategy Backtester</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <TrendingUp size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Phase 1 — Foundation
        </div>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/data" element={<DataExplorer />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
