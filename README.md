# ClawBerg

Everyone has an opinion on your money. Your agent has one instruction: manage yours. No agenda, no commissions, no talking heads — just your portfolio, your context, and a framework built to execute.

Built for the [AI Trading Agents Hackathon](https://lablab.ai) — lablab.ai × Kraken × Surge, March 30 – April 12, 2026.

---

## What It Does

Your AI agent brings the context. We provide the terminal.

- **Market analysis** — VWAP + σ band positioning, Fear & Greed index, cross-venue funding rates. Your agent calls our API and gets a synthesized read on any asset — not raw data, an actual signal.
- **Trade execution** — Your agent calls one endpoint. We handle the Kraken CLI plumbing across crypto, tokenized stocks (xStocks), forex, and futures.
- **On-chain logging** — Every trade intent is signed and recorded via ERC-8004 on Base. Immutable proof of what your agent did and when.
- **Portfolio dashboard** — What your agent did, displayed as a statement. Positions, entries, on-chain proof links.

---

## Repo Structure

```
/
├── index.html          Landing page
├── vwap.sh             VWAP + σ analysis from live Kraken OHLC
├── market-intel.sh     VWAP + Fear & Greed + cross-venue funding rates
├── SKILL.md            How your AI agent uses this app
│
├── api/                Express backend (Postgres, SSE, trade logging)
├── dashboard/          Next.js frontend (portfolio, trade history)
└── docs/
    └── API.md          Full API reference
```

---

## Quick Start

```bash
# Install Kraken CLI
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/krakenfx/kraken-cli/releases/latest/download/kraken-cli-installer.sh | sh

# Analyze the market
chmod +x vwap.sh market-intel.sh
./vwap.sh BTCUSD 60 24
./market-intel.sh BTC

# Paper trade — no API keys needed
kraken paper init --balance 15000
kraken paper buy BTCUSD 0.1
```

---

## Running the Full Stack

See [docs/API.md](docs/API.md) for full setup and API reference.

Requirements: Node.js 18+, PostgreSQL, [OpenClaw](https://openclaw.ai) agent

```bash
# API (port 4000)
cd api && cp .env.example .env && npm install && npm run migrate && npm start

# Dashboard (port 3000)
cd dashboard && cp .env.example .env && npm install && npm run dev
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Execution | [Kraken CLI](https://github.com/krakenfx/kraken-cli) |
| Market Data | [Strykr PRISM API](https://prism.strykr.ai) |
| Agent Identity | [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) on Base |
| Trade Signing | EIP-712 + EIP-155 |
| Runtime | [OpenClaw](https://openclaw.ai) |

---

## Team

- **Kyro** — AI agent (OpenClaw runtime)
- **Rodrigo** — Human co-founder

---

## Resources

- [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) — Agent identity, reputation, and validation standard
- [Kraken CLI](https://github.com/krakenfx/kraken-cli) — *"Terminal-native agent environments like OpenClaw"*
- [Kraken CLI Announcement](https://blog.kraken.com/news/industry-news/announcing-the-kraken-cli) — Official announcement + agent ecosystem context
- [Strykr PRISM API](https://prism.strykr.ai) — Canonical data layer for financial agents
- [TradeMaster](https://github.com/TradeMaster-NTU/TradeMaster) — Open-source RL trading platform (NTU). Our reasoning pipeline is adapted from their LLM agent architecture.
- [OpenClaw](https://openclaw.ai) — Agent runtime
