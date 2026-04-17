# Markeus - Architecture

## Overview

Markeus is a stock and options trading strategy backtester. The frontend is hosted on **GitHub Pages** (free, static). The backend is a lightweight **Cloudflare Worker** (free tier) that proxies market data and caches results. All heavy computation (backtesting) runs **client-side in Web Workers** for zero backend cost and full privacy.

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Pages (Static)                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  UI / Charts  │  │  Strategy    │  │  Results &        │ │
│  │  (React +     │  │  Builder     │  │  Analytics        │ │
│  │  Lightweight  │  │              │  │  Dashboard        │ │
│  │  Charting)    │  │              │  │                   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────────┘ │
│         │                 │                   │             │
│         └────────┬────────┴───────────────────┘             │
│                  │                                          │
│         ┌────────▼────────┐                                 │
│         │  Backtest Engine │ ◄── Runs in Web Workers        │
│         │  (TypeScript)    │     Off main thread             │
│         └────────┬────────┘                                 │
│                  │                                          │
│         ┌────────▼────────┐                                 │
│         │  Data Cache      │ ◄── IndexedDB (browser)        │
│         │  (IndexedDB)     │     Persists across sessions   │
│         └────────┬────────┘                                 │
└──────────────────┼──────────────────────────────────────────┘
                   │ HTTPS
         ┌─────────▼──────────┐
         │  Cloudflare Worker  │ ◄── Free tier: 100K req/day
         │  (API Proxy)        │
         │                     │
         │  - /api/stocks      │     Proxies + caches data
         │  - /api/options     │     Hides API keys
         │  - /api/indicators  │     Rate limit management
         └─────────┬──────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│ Yahoo  │  │ Tradier  │  │ Finnhub  │
│Finance │  │ Sandbox  │  │          │
│(stocks)│  │(options) │  │(realtime)│
└────────┘  └──────────┘  └──────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | React + TypeScript + Vite | Fast builds, strong typing, easy for Copilot to extend |
| **Charting** | Lightweight Charts (TradingView open-source) | Professional candlestick/line charts, tiny bundle |
| **State** | Zustand | Minimal boilerplate, works well with Web Workers |
| **Backtesting** | Custom engine in TypeScript (Web Workers) | Runs off main thread, parallelizable |
| **Browser Storage** | IndexedDB (via idb) | Cache market data locally, survives page reloads |
| **Backend** | Cloudflare Workers + D1 (SQLite) + KV | Free tier is generous, no cold starts, edge-deployed |
| **Deployment** | GitHub Actions → GitHub Pages + Wrangler CLI | Automated deploys on push |
| **Package Manager** | pnpm | Fast, disk-efficient |

---

## Data Sources

### Stock Data
| Source | Use Case | Rate Limit | CORS |
|---|---|---|---|
| **Yahoo Finance** (via CF Worker proxy) | Deep historical daily OHLCV (decades) | ~few hundred/day | No (needs proxy) |
| **Finnhub** | Real-time quotes, intraday candles, fundamentals | 60/min | Yes |
| **Alpha Vantage** | Fallback for daily data + technical indicators | 25/day | Yes |

### Options Data
| Source | Use Case | Rate Limit | CORS |
|---|---|---|---|
| **Tradier Sandbox** | Delayed options chains (calls/puts, all expirations) | Lenient | Yes |
| **Yahoo Finance** (via CF Worker proxy) | Current options chain snapshots | Unofficial | No (needs proxy) |

### Historical Options Limitation
Free historical options data does not exist. Strategy:
1. **Phase 1-3**: Use current chains + simulated historical options pricing (Black-Scholes model from underlying price history + estimated IV)
2. **Phase 4+**: Build a daily options snapshot collector (Cloudflare Cron Trigger → D1) to accumulate real historical data over time
3. **Future**: Integrate paid data source (CBOE DataShop, ORATS) when ready for production

---

## Directory Structure

```
markeus/
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml    # Build + deploy to GitHub Pages
│       └── deploy-worker.yml      # Deploy Cloudflare Worker
├── packages/
│   ├── frontend/                  # React app (GitHub Pages)
│   │   ├── src/
│   │   │   ├── components/        # UI components
│   │   │   │   ├── charts/        # Candlestick, equity curve, etc.
│   │   │   │   ├── strategy/      # Strategy builder/config UI
│   │   │   │   ├── backtest/      # Backtest controls + results
│   │   │   │   └── common/        # Shared UI (buttons, inputs, etc.)
│   │   │   ├── engine/            # Backtesting engine
│   │   │   │   ├── worker.ts      # Web Worker entry point
│   │   │   │   ├── runner.ts      # Backtest execution loop
│   │   │   │   ├── portfolio.ts   # Position tracking, P&L
│   │   │   │   ├── indicators.ts  # SMA, EMA, RSI, MACD, etc.
│   │   │   │   ├── options.ts     # Options pricing (Black-Scholes, Greeks)
│   │   │   │   └── strategies/    # Strategy implementations
│   │   │   │       ├── types.ts           # Strategy interface
│   │   │   │       ├── ma-crossover.ts    # Moving average crossover
│   │   │   │       ├── rsi-reversal.ts    # RSI mean reversion
│   │   │   │       ├── the-wheel.ts       # The Wheel (options)
│   │   │   │       ├── iron-condor.ts     # Iron Condor
│   │   │   │       ├── covered-call.ts    # Covered Call
│   │   │   │       └── credit-spread.ts   # Credit Spreads
│   │   │   ├── data/              # Data fetching + caching
│   │   │   │   ├── api.ts         # API client (talks to CF Worker)
│   │   │   │   ├── cache.ts       # IndexedDB caching layer
│   │   │   │   └── types.ts       # OHLCV, OptionsChain, etc.
│   │   │   ├── store/             # Zustand stores
│   │   │   ├── utils/             # Formatting, date math, etc.
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── worker/                    # Cloudflare Worker (API proxy)
│       ├── src/
│       │   ├── index.ts           # Router / entry point
│       │   ├── routes/
│       │   │   ├── stocks.ts      # /api/stocks/:symbol
│       │   │   ├── options.ts     # /api/options/:symbol
│       │   │   └── indicators.ts  # /api/indicators/:symbol
│       │   ├── providers/         # Data provider adapters
│       │   │   ├── yahoo.ts
│       │   │   ├── tradier.ts
│       │   │   └── finnhub.ts
│       │   └── cache.ts           # D1/KV caching logic
│       ├── wrangler.toml
│       ├── tsconfig.json
│       └── package.json
├── pnpm-workspace.yaml
├── package.json
├── architecture.md
└── plan.md
```

---

## Backtesting Engine Design

### Architecture Pattern: Vectorized-First, Event-Driven Ready

Start with a **vectorized** approach for speed and simplicity. The data is loaded as typed arrays and strategies operate on full price series. This is ideal for Phase 1-3 and GitHub Copilot can easily generate new strategies against the interface.

```typescript
// Core strategy interface - every strategy implements this
interface Strategy {
  name: string;
  description: string;
  params: StrategyParam[];                          // Configurable parameters
  analyze(data: MarketData, params: Record<string, number>): Signal[];
}

// A signal is a buy/sell/hold decision at a point in time
interface Signal {
  date: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  type: 'STOCK' | 'OPTION';
  details?: OptionOrder;                            // For options strategies
  size: number;                                     // Position size (shares or contracts)
  reason: string;                                   // Human-readable explanation
}

// Options-specific order details
interface OptionOrder {
  optionType: 'CALL' | 'PUT';
  strike: number;
  expiration: string;
  action: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
  premium: number;
}

// Backtest result with full analytics
interface BacktestResult {
  trades: Trade[];
  equityCurve: { date: string; value: number }[];
  metrics: {
    totalReturn: number;
    cagr: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    totalTrades: number;
    avgWin: number;
    avgLoss: number;
    calmarRatio: number;
  };
}
```

### Adding a New Strategy (Copilot-Friendly Pattern)

Every strategy is a single file in `strategies/` that exports a `Strategy` object. To add a new one:

1. Create `strategies/my-strategy.ts`
2. Implement the `Strategy` interface
3. Register it in `strategies/index.ts`

The interface is simple enough that saying "backtest the wheel strategy" to Copilot gives it everything it needs to generate a working implementation.

---

## Key Metrics Computed

| Category | Metrics |
|---|---|
| **Returns** | Total return, CAGR, monthly returns heatmap |
| **Risk** | Max drawdown, annualized volatility, beta vs SPY |
| **Risk-Adjusted** | Sharpe ratio, Sortino ratio, Calmar ratio |
| **Trade Analysis** | Win rate, profit factor, avg win/loss, expectancy |
| **Options-Specific** | Avg days in trade, theta capture, assignment rate |

---

## Bias Prevention

| Bias | Mitigation |
|---|---|
| **Look-ahead** | Web Worker receives data bar-by-bar; strategies only see past data |
| **Survivorship** | Document limitation; use SPY/QQQ + large-caps for initial testing |
| **Overfitting** | Walk-forward analysis built into the backtest runner; out-of-sample split |
| **Transaction costs** | Configurable commission + slippage model applied to every trade |

---

## Future: Live Trading Integration (Phase 5+)

The architecture is designed so that the same `Strategy` interface can drive both backtesting and live trading:

```
Backtest Mode:  Historical Data → Strategy.analyze() → Simulated Trades
Live Mode:      Real-time Data  → Strategy.analyze() → Broker API Orders
```

Planned broker integrations:
- **Alpaca** (commission-free stocks + options API, paper trading mode)
- **Tradier** (brokerage API, same API as sandbox but with real execution)
- **Interactive Brokers** (via Client Portal API)

The Cloudflare Worker gains new routes (`/api/orders`, `/api/positions`) that proxy to the broker API with authentication.
