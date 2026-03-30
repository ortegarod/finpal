# ClawBerg API Reference

**Base URL:** configure via `API_URL` environment variable (default: `http://localhost:4000`)  
Real-time updates: SSE at `GET /events`

---

## Trades

### `POST /trades`
Log a completed trade after Kraken CLI execution.

| Field | Type | Required |
|---|---|---|
| `pair` | string | ✅ |
| `side` | `"buy"` \| `"sell"` | ✅ |
| `size` | number | ✅ |
| `price` | number | ✅ |
| `total_usd` | number | ✅ |
| `strategy` | string | optional |
| `sigma_at_entry` | number | optional — σ position at time of trade |
| `tx_hash` | string | optional — on-chain proof |
| `order_id` | string | optional — Kraken order ID |

### `GET /trades`
Trade history. Query params: `pair`, `side`, `limit` (default 50), `offset`.

---

## Actions

### `POST /actions`
Log agent activity — analysis, decisions, alerts, user interactions.

| Field | Type | Required |
|---|---|---|
| `action_type` | `"analyze"` \| `"trade"` \| `"rebalance"` \| `"alert"` \| `"chat"` | ✅ |
| `summary` | string | ✅ — human-readable description |
| `data` | object | optional — raw signal data |

### `GET /actions`
Recent agent actions. Query param: `limit` (default 20).

---

## Portfolio

### `POST /portfolio`
Post current portfolio state. Call after any trade or rebalance.

| Field | Type | Required |
|---|---|---|
| `total_usd` | number | ✅ |
| `cash_usd` | number | ✅ |
| `positions` | array | ✅ — `[{pair, size, value_usd, entry_price, pnl_pct}]` |
| `pnl_usd` | number | optional |
| `pnl_pct` | number | optional |

### `GET /portfolio`
Latest portfolio snapshot. Returns `{"portfolio": null}` if none exists.

---

## Events (SSE)

### `GET /events`
Server-Sent Events stream. Dashboard connects here for live updates.

Event types: `connected`, `trade`, `action`, `portfolio`

```js
const es = new EventSource('http://localhost:4000/events');
es.addEventListener('trade', e => console.log(JSON.parse(e.data)));
```

---

## Database Schema

```sql
trades (id, created_at, pair, side, size, price, total_usd, strategy,
        sigma_at_entry, tx_hash, order_id, status)

agent_actions (id, created_at, action_type, summary, data jsonb)

portfolio_snapshots (id, created_at, total_usd, cash_usd, positions jsonb,
                     pnl_usd, pnl_pct)
```

---

## Running Locally

```bash
# 1. Set up database
cd api && cp .env.example .env   # add DATABASE_URL
npm install && npm run migrate

# 2. Start API
npm start   # runs on :4000

# 3. Start dashboard
cd ../dashboard && cp .env.example .env
npm install && npm run dev   # runs on :3000
```

---

## Health Check

```bash
curl http://localhost:4000/health
# {"status":"ok","timestamp":"..."}
```

---

## Changelog

| Date | Change |
|---|---|
| 2026-03-30 | Initial API — /trades, /actions, /portfolio, /events, /health |
