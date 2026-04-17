# Markeus - Implementation Plan

## Phase 1: Foundation & GitHub Pages Deployment
**Goal**: Get a working React app deployed to GitHub Pages with basic routing and layout.

- [ ] Initialize pnpm monorepo with `packages/frontend` and `packages/worker`
- [ ] Scaffold React + TypeScript + Vite app in `packages/frontend`
- [ ] Set up basic layout: sidebar navigation + main content area
- [ ] Create placeholder pages: Dashboard, Backtest, Strategies, Data Explorer
- [ ] Set up GitHub Actions workflow to build and deploy frontend to GitHub Pages
- [ ] Verify the app is live at `https://<username>.github.io/Markeus`
- [ ] Add Lightweight Charts (TradingView) with a placeholder candlestick chart

**Deliverable**: Live GitHub Pages site with navigation and a sample chart.

---

## Phase 2: Cloudflare Worker API Proxy
**Goal**: Set up the backend to proxy market data requests, hiding API keys and caching responses.

- [ ] Scaffold Cloudflare Worker project in `packages/worker` using Wrangler
- [ ] Set up D1 database for caching stock price history
- [ ] Implement Yahoo Finance proxy route (`/api/stocks/:symbol/history`)
  - Fetch daily OHLCV data for any symbol and date range
  - Cache responses in D1 (keyed by symbol + date range)
  - Return normalized JSON format
- [ ] Implement Finnhub proxy route (`/api/stocks/:symbol/quote`) for real-time quotes
- [ ] Implement Tradier Sandbox proxy route (`/api/options/:symbol/chain`) for options chains
- [ ] Add CORS headers allowing the GitHub Pages origin
- [ ] Set up GitHub Actions workflow to deploy worker with Wrangler
- [ ] Add rate limiting / request deduplication logic

**Deliverable**: Working API at `https://markeus-api.<account>.workers.dev` returning stock and options data.

---

## Phase 3: Data Layer & Stock Charts
**Goal**: Connect the frontend to the API and display real market data with IndexedDB caching.

- [ ] Build API client module (`data/api.ts`) to call Cloudflare Worker endpoints
- [ ] Implement IndexedDB caching layer (`data/cache.ts`)
  - Check cache first, fetch from API only if missing or stale
  - Store OHLCV data, options chains, and quotes
- [ ] Build stock symbol search / autocomplete
- [ ] Build interactive candlestick chart with volume bars
  - Zoomable time range (1W, 1M, 3M, 6M, 1Y, 5Y, Max)
  - Hover tooltip with OHLCV values
- [ ] Build technical indicator overlays on the chart
  - SMA (configurable period)
  - EMA (configurable period)
  - Bollinger Bands
  - RSI (separate pane)
  - MACD (separate pane)
- [ ] Build options chain viewer
  - Display calls and puts for selected expiration
  - Show strike, bid, ask, last, volume, OI
  - Expiration date selector

**Deliverable**: Fully interactive stock chart with indicators and options chain viewer.

---

## Phase 4: Backtesting Engine (Stocks)
**Goal**: Build the core backtesting engine running in Web Workers with stock-only strategies.

- [ ] Implement Web Worker infrastructure
  - Worker entry point (`engine/worker.ts`)
  - Message protocol between main thread and worker
  - Progress reporting (% complete) back to UI
- [ ] Implement backtest runner (`engine/runner.ts`)
  - Iterate through historical data bar-by-bar
  - Pass each bar to strategy's `analyze()` function
  - Track portfolio state (cash, positions, equity)
  - Apply configurable transaction costs (commission + slippage)
- [ ] Implement portfolio tracker (`engine/portfolio.ts`)
  - Position management (open, close, partial close)
  - P&L calculation (realized + unrealized)
  - Equity curve generation
- [ ] Implement technical indicators library (`engine/indicators.ts`)
  - SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic
- [ ] Implement metrics calculator
  - Total return, CAGR, Sharpe, Sortino, Calmar
  - Max drawdown, win rate, profit factor, expectancy
- [ ] Build first stock strategies
  - **Moving Average Crossover** (SMA 50/200)
  - **RSI Mean Reversion** (buy < 30, sell > 70)
  - **MACD Signal** (crossover + histogram divergence)
  - **Momentum** (buy top N% performers over lookback period)
  - **Breakout** (Donchian channel breakout)
- [ ] Build backtest configuration UI
  - Symbol selector
  - Date range picker
  - Strategy selector with parameter controls
  - Initial capital input
  - Commission/slippage settings
- [ ] Build results dashboard
  - Equity curve chart
  - Trade list table (entry, exit, P&L, duration)
  - Metrics summary cards
  - Monthly returns heatmap
  - Drawdown chart
- [ ] Implement walk-forward analysis
  - Split data into in-sample / out-of-sample
  - Display both results for overfitting detection

**Deliverable**: Fully working stock strategy backtester with 5 built-in strategies and comprehensive results.

---

## Phase 5: Options Backtesting
**Goal**: Extend the backtesting engine to handle options strategies.

- [ ] Implement Black-Scholes pricing model (`engine/options.ts`)
  - Call/put pricing from underlying price, strike, DTE, IV, risk-free rate
  - Greeks calculation (delta, gamma, theta, vega)
  - Implied volatility estimation from historical volatility
- [ ] Implement options position tracking in portfolio
  - Track options contracts alongside stock positions
  - Handle assignment and exercise
  - Calculate options P&L (mark-to-model when no market data)
- [ ] Build options-specific strategies
  - **The Wheel**: Sell cash-secured puts → get assigned → sell covered calls → repeat
  - **Covered Call**: Buy stock + sell OTM call, roll on expiration
  - **Iron Condor**: Sell OTM put spread + OTM call spread, manage at % of max profit
  - **Credit Spread** (Bull Put / Bear Call): Sell spread at X delta, close at % profit or DTE threshold
  - **Protective Put**: Buy stock + buy OTM put for downside protection
- [ ] Add options-specific metrics
  - Average days in trade
  - Assignment rate
  - Premium collected vs realized P&L
  - Win rate by strategy leg
- [ ] Build options strategy configuration UI
  - Delta targeting for strike selection
  - DTE selection
  - Profit target / stop loss as % of premium
  - Roll rules (when, how)
- [ ] Historical options data simulation
  - Use historical underlying price + estimated IV to generate synthetic options chains
  - Document accuracy limitations vs real historical data

**Deliverable**: Working options backtester with 5 strategies, synthetic options pricing, and options-specific analytics.

---

## Phase 6: Strategy Builder & Comparison
**Goal**: Let users create custom strategies without writing code and compare multiple strategies.

- [ ] Build visual strategy builder
  - Drag-and-drop condition blocks (e.g., "IF RSI < 30 AND price > SMA(200)")
  - Rule-based entry and exit conditions
  - Position sizing rules (fixed, percent of portfolio, Kelly criterion)
- [ ] Implement strategy comparison mode
  - Run multiple strategies on the same data
  - Side-by-side metrics table
  - Overlaid equity curves
  - Statistical significance testing (bootstrap)
- [ ] Build strategy template library
  - Save/load custom strategies as JSON
  - Share strategies via URL (encoded in query params or hash)
- [ ] Add parameter optimization
  - Grid search over parameter ranges
  - Display performance heatmap by parameter combination
  - Highlight overfitting risk when optimal region is narrow

**Deliverable**: No-code strategy builder with comparison tools and parameter optimization.

---

## Phase 7: Live Data & Paper Trading
**Goal**: Wire up real-time data feeds and simulate live trading.

- [ ] Integrate real-time stock quotes via Finnhub WebSocket
  - Live price updates on charts
  - Real-time portfolio valuation
- [ ] Build paper trading mode
  - Virtual account with configurable starting balance
  - Place orders (market, limit, stop) against live prices
  - Track open positions and P&L in real time
  - Order history and trade journal
- [ ] Add alerting system
  - Strategy signal alerts (e.g., "RSI crossed below 30 on AAPL")
  - Price alerts
  - Browser notifications
- [ ] Add Cloudflare Cron Trigger for daily options chain snapshots
  - Store in D1 to build real historical options database over time
  - Improve backtest accuracy as data accumulates

**Deliverable**: Real-time data display, paper trading with virtual money, and alerts.

---

## Phase 8: Broker Integration (Live Trading)
**Goal**: Execute real trades through a broker API.

- [ ] Integrate Alpaca API (commission-free, paper + live modes)
  - OAuth authentication flow
  - Place stock and options orders
  - Sync positions and account balance
- [ ] Add Tradier brokerage integration (same API as sandbox)
- [ ] Build order management UI
  - Order entry form
  - Open orders list with cancel/modify
  - Position management (close, roll options)
- [ ] Add risk controls
  - Max position size limits
  - Daily loss limits
  - Confirmation dialogs for large orders
- [ ] Strategy auto-execution mode
  - Run a strategy against live data
  - Generate orders automatically (with approval step)

**Deliverable**: Live trading capability with risk controls and auto-execution.

---

## Backtesting Strategies Reference

### Stock Strategies (Phase 4)
| Strategy | Logic | Key Parameters |
|---|---|---|
| **MA Crossover** | Buy when fast MA crosses above slow MA, sell on cross below | Fast period (e.g., 50), slow period (e.g., 200) |
| **RSI Reversal** | Buy when RSI < oversold, sell when RSI > overbought | Period (14), oversold (30), overbought (70) |
| **MACD Signal** | Buy on MACD line crossing above signal line, sell on cross below | Fast (12), slow (26), signal (9) |
| **Momentum** | Buy top N performers over lookback, rebalance periodically | Lookback (126 days), top N (10), rebalance (monthly) |
| **Breakout** | Buy on new 20-day high, sell on new 10-day low (Donchian) | Entry channel (20), exit channel (10) |

### Options Strategies (Phase 5)
| Strategy | Logic | Key Parameters |
|---|---|---|
| **The Wheel** | Sell puts → assigned → sell calls → called away → repeat | Delta (0.30), DTE (30-45), profit target (50%) |
| **Covered Call** | Own shares + sell OTM call, roll near expiration | Delta (0.30), DTE (30), roll trigger (7 DTE) |
| **Iron Condor** | Sell OTM put spread + call spread, close at profit target | Wing width (5), delta (0.16), DTE (45), profit target (50%) |
| **Credit Spread** | Sell bull put or bear call spread based on trend | Width (5), delta (0.30), DTE (45), profit target (50%) |
| **Protective Put** | Buy stock + buy OTM put, roll put monthly | Put delta (0.30), DTE (30) |

---

## Key Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Frontend hosting | GitHub Pages | Free, reliable, auto-deploy from GitHub |
| Backend hosting | Cloudflare Workers | Most generous free tier (100K req/day), no cold starts, edge-deployed |
| Backtesting compute | Client-side (Web Workers) | Zero backend cost, user privacy, leverages user's CPU |
| Frontend framework | React + TypeScript | Widely supported, Copilot excels at React, strong ecosystem |
| Charting | Lightweight Charts | TradingView quality, open-source, tiny bundle |
| Options pricing | Black-Scholes (synthetic) | Free historical options data doesn't exist; simulate from underlying |
| Data caching | IndexedDB (browser) + D1 (server) | Two-layer cache minimizes API calls |
| Monorepo | pnpm workspaces | Simple, fast, keeps frontend + worker in one repo |
