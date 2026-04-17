---
description: Project-wide coding guidelines for Markeus
applyTo: '**'
---

# Markeus — Project Instructions

## Work in Parallel to the best of your ability

## Project Overview
A stock and options trading strategy backtester. The frontend is a **React SPA** hosted on **GitHub Pages**. The backend is a **Cloudflare Worker** that proxies market data APIs and caches results in **D1 (SQLite)**. Backtesting runs **client-side in Web Workers** for zero backend cost. See [architecture.md](../../architecture.md) for the full architecture and [plan.md](../../plan.md) for the development plan.

## Tech Stack
- **TypeScript** with strict mode
- **React 19** + **Vite 8** for the frontend SPA
- **Lightweight Charts** (TradingView open-source) for candlestick/line charts
- **Zustand** for state management
- **IndexedDB** (via `idb`) for browser-side caching
- **Cloudflare Workers** + **D1** for the API proxy/cache backend
- **pnpm** workspaces (monorepo with `packages/frontend` and `packages/worker`)
- **GitHub Actions** for CI/CD (GitHub Pages + Wrangler deploy)

## Monorepo Structure
- `packages/frontend/` — React SPA (deployed to GitHub Pages)
- `packages/worker/` — Cloudflare Worker API proxy (deployed via Wrangler)
- `architecture.md` — Architecture docs and diagrams
- `plan.md` — 8-phase implementation plan
- `data/` — Local sample/development data (not committed)

## Code Conventions

### Frontend (`packages/frontend/`)
- Pages go in `src/pages/`.
- Reusable UI components go in `src/components/` organized by domain (`charts/`, `strategy/`, `backtest/`, `common/`).
- Backtesting engine code goes in `src/engine/` (Web Worker entry, runner, portfolio, indicators, strategies).
- Strategy implementations go in `src/engine/strategies/`, one file per strategy implementing the `Strategy` interface.
- Data fetching and API client go in `src/data/` (`api.ts`, `cache.ts`, `types.ts`).
- Zustand stores go in `src/store/`.
- Utility functions go in `src/utils/`.
- Uses `HashRouter` for GitHub Pages compatibility (no server-side routing).
- Styling uses plain CSS with custom properties (dark theme) — no CSS framework.

### Worker (`packages/worker/`)
- Entry point and router in `src/index.ts` (manual regex-based routing, no framework).
- Route handlers go in `src/routes/` (one file per resource: `stocks.ts`, `options.ts`, `watchlists.ts`, `sync.ts`).
- Data provider adapters go in `src/providers/` (`yahoo.ts`, `finnhub.ts`).
- CORS config in `src/cors.ts`.
- Types in `src/types.ts`.
- Database migrations go in `migrations/` (numbered: `0001_*.sql`, `0002_*.sql`, etc.).

### General
- Prefer `const` over `let`; avoid `var`.
- Use TypeScript interfaces/types for all data structures.
- Keep shared types in sync between frontend (`src/data/types.ts`) and worker (`src/types.ts`).

## Build & Dev Commands

### Root (monorepo)
- `pnpm dev` — Start frontend Vite dev server
- `pnpm build` — Build frontend for production
- `pnpm preview` — Preview frontend production build

### Frontend (`packages/frontend/`)
- `pnpm dev` — Vite dev server
- `pnpm build` — Type-check + production build
- `pnpm preview` — Preview production build
- `pnpm lint` — ESLint

### Worker (`packages/worker/`)
- `pnpm dev` — `wrangler dev` (local worker with D1 bindings)
- `pnpm deploy` — `wrangler deploy` to production
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm db:migrate:local` — Apply D1 migrations locally
- `pnpm db:migrate:prod` — Apply D1 migrations to production

## API Routes (Worker)

### Stocks
- `GET /api/stocks/:symbol/history` — Historical OHLCV candles (`range`, `interval`, `provider`, `fresh` params)
- `GET /api/stocks/:symbol/quote` — Current price quote (cached 60s)

### Options
- `GET /api/options/:symbol/chain` — Options chain (`expiration`, `fresh` params)
- `GET /api/options/:symbol/expirations` — Available expiration dates

### Watchlists
- `GET /api/watchlists` — List all watchlists with symbols
- `POST /api/watchlists` — Create watchlist (`{ name, symbols? }`)
- `PUT /api/watchlists/:id/symbols` — Add symbols (`{ symbols: [] }`)
- `DELETE /api/watchlists/:id/symbols/:symbol` — Remove symbol
- `DELETE /api/watchlists/:id` — Delete watchlist

### Sync & Health
- `POST /api/sync` — Sync candles + options (`{ symbols?, range?, includeOptions? }`)
- `GET /api/sync/status` — Sync status overview
- `GET /api/health` — Health check

## Database (D1)
Key tables: `cache`, `watchlists`, `watchlist_symbols`, `stock_candles`, `stock_quotes`, `options_contracts`, `options_expirations`, `sync_log`. See migrations in `packages/worker/migrations/` for full schema.

## Key Patterns
- The worker proxies Yahoo Finance and Finnhub APIs, hiding API keys from the client.
- Yahoo Finance requires crumb/cookie authentication — see `providers/yahoo.ts` for the caching + retry logic.
- Frontend uses a Zustand store (`store/marketData.ts`) with cache-first loading from IndexedDB (4hr TTL).
- Candlestick charts use TradingView Lightweight Charts with dark theme styling.
- The backtesting engine (planned) uses a `Strategy` interface — each strategy is a single file in `engine/strategies/`.

## Git Workflow
After completing a task, **stage only the files you changed** with `git add <file1> <file2> ...` — never use `git add -A` or `git add .` — then commit with a short but detailed commit message. Use imperative mood (e.g., "Add options chain expiration selector"). If a task spans multiple logical changes, use separate commits for each.
