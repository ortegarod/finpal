# ClawBerg — Agent Skill

This file tells your AI agent how to use ClawBerg. Read it once and your agent knows everything it needs.

---

## What This App Does

ClawBerg gives your agent three tools:

1. **Kraken CLI** — executes trades across crypto, tokenized stocks (xStocks), and forex
2. **PRISM API** — resolves asset names, provides sentiment and cross-venue market data
3. **ClawBerg API** — logs what your agent does so the dashboard can display it

Your agent brings the context. ClawBerg provides the terminal.

---

## Reasoning Pipeline

*Adapted from [TradeMaster](https://github.com/TradeMaster-NTU/TradeMaster) (NTU, Apache 2.0) — an open-source RL platform for quantitative trading. We borrowed their LLM reasoning architecture; we did not use their RL runtime or dependencies.*

Before making any financial recommendation, follow this 4-stage reasoning chain. Do not skip stages.

### Stage 1 — Market Intelligence
Gather and summarize what's happening right now:
- Pull OHLC from Kraken (`./vwap.sh`, `kraken ohlc`)
- Pull Fear & Greed + funding rates (`./market-intel.sh`)
- Note VWAP σ position
- Summarize in plain English: *"BTC is 1.2σ above VWAP with neutral sentiment and positive funding — slightly extended."*

### Stage 2 — Low-Level Reflection (Price Movement)
State price movement across three timeframes:
- **Short-term (1d):** "an increase of 2.3%"
- **Medium-term (7d):** "a decrease of 4.1%"
- **Long-term (14d):** "an increase of 11.2%"
This forces explicit acknowledgment of trend direction before deciding.

### Stage 3 — High-Level Reflection (Past Decisions)
Look back at the last 14 days of your own trade log:
- What did you recommend? What happened after?
- What worked? What didn't?
- Produce one `improvement` sentence: *"I entered too early on BTC twice when σ was -0.8. I should wait for σ ≤ -1 before recommending entry."*
Skip this stage only if there is no trade history yet.

### Stage 4 — Decision
Combine Stage 1-3 with what you know about this user:
- Their risk tolerance, current positions, available capital
- Your improvement note from Stage 3
- Produce a clear recommendation with size and rationale

```
Recommendation: [BUY / SELL / HOLD / WAIT]
Asset: [pair]
Size: [$X or X units]
Rationale: [2-3 sentences combining market intel, price movement, and reflection]
Confidence: [LOW / MEDIUM / HIGH]
```

---

## Tool 1: Kraken CLI

Market data and trade execution. No API key needed for market data and paper trading.

```bash
# Market data
kraken ticker BTCUSD -o json
kraken ohlc BTCUSD --interval 60 -o json      # 1h candles

# VWAP + σ analysis (built-in script)
./vwap.sh BTCUSD 60 24                         # 24h lookback, 1h candles
./market-intel.sh BTC                          # VWAP + Fear&Greed + funding

# Paper trading
kraken paper buy BTCUSD 0.1 -o json
kraken paper status -o json

# Live trading (requires API keys)
kraken order buy TSLAx/USD 12.4 --type market --asset-class tokenized_asset -o json
```

Full CLI reference: `~/kraken-cli/CONTEXT.md`

---

## Tool 2: PRISM API

Resolves asset names to canonical tickers and provides market-wide data.

```bash
BASE="https://strykr-prism.up.railway.app"

# Resolve "Tesla" → TSLAx/USD
curl "$BASE/asset/resolve?query=Tesla"

# Fear & Greed index
curl "$BASE/market/fear-greed"

# Cross-venue price
curl "$BASE/crypto/price/BTC"
```

---

## Tool 3: ClawBerg API

Log everything your agent does. This is what powers the dashboard and on-chain reputation.

```bash
BASE="http://localhost:4000"

# Log analysis step
curl -X POST $BASE/actions -H "Content-Type: application/json" \
  -d '{"action_type":"analyze","summary":"TSLAx at -0.8σ. Recommending $3k entry.","data":{"sigma":-0.8}}'

# Log completed trade
curl -X POST $BASE/trades -H "Content-Type: application/json" \
  -d '{"pair":"TSLAx/USD","side":"buy","size":12.4,"price":241.80,"total_usd":3000,"order_id":"XXXX"}'

# Update portfolio state
curl -X POST $BASE/portfolio -H "Content-Type: application/json" \
  -d '{"total_usd":15000,"cash_usd":12000,"positions":[{"pair":"TSLAx/USD","size":12.4,"value_usd":3000,"entry_price":241.80,"pnl_pct":0}]}'
```

Full API reference: [docs/API.md](docs/API.md)

---

## Your Workflow

Follow this sequence every time you act on behalf of the user. Do not skip steps.

```
1. Analyze    → Stages 1-2 above → POST /actions (action_type: "analyze")
2. Reflect    → Stage 3 above (check trade history)
3. Decide     → Stage 4 above → form recommendation for user
4. Execute    → kraken order ... (after user confirms)
5. Log trade  → POST /trades (with order_id from Kraken)
6. Update     → POST /portfolio (current state after trade)
7. Log action → POST /actions (action_type: "trade", what was done + why + improvement note)
```

---

## σ Signal Reference

| σ Position | Signal |
|---|---|
| > +2 | Overextended — avoid |
| +1 to +2 | Slightly rich — wait |
| -1 to +1 | Fair value — neutral |
| -1 to -2 | Discount — potential entry |
| < -2 | Deep discount — high conviction |

---

## Performance Metrics (ERC-8004 Reputation Tags)

These five metrics are recorded on-chain as your agent's reputation score:

| Metric | Tag | Description |
|---|---|---|
| Sharpe Ratio | `sharpeRatio` | Risk-adjusted return |
| Max Drawdown | `maxDrawdown` | Worst peak-to-trough loss |
| Win Rate | `winRate` | % of trades that were profitable |
| Excess Return | `excessReturn` | Return above benchmark |
| Annualized Return | `annualizedReturn` | Yearly return normalized |

Every trade logged via POST /trades feeds these metrics. The dashboard displays them. The on-chain reputation registry stores them.
