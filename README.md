# TracSentinel

**Multi-chain crypto rug pull detector powered by local AI and the Trac P2P Network.**

TracSentinel scans token contracts across 8 blockchains and gives you an instant risk verdict — honeypot detection, deployer analysis, liquidity checks, holder concentration, and an AI-written summary — all running on your own hardware with no central server.

---

## What We Are Building

TracSentinel is a self-sovereign, privacy-first token security scanner that will eventually run fully peer-to-peer on the [Trac Network](https://tracsystems.io). The vision:

- **You run a node.** Your node scans tokens, caches results locally, and shares them with the P2P network.
- **Other nodes share back.** When someone else already scanned a token, you get the result instantly — no API calls needed.
- **No central server.** No tracking. No rate limits. No single point of failure.
- **Bitcoin-native.** Deep integration with TAP Protocol (Bitcoin Ordinals tokens) via a local full-node indexer.

---

## Current Implementation

### Supported Chains
| Chain | Data Sources |
|-------|-------------|
| Ethereum | GoPlus, DexScreener, Etherscan V2, Moralis, CoinGecko |
| BNB Chain | GoPlus, DexScreener, Etherscan V2, Moralis, CoinGecko |
| Polygon | GoPlus, DexScreener, Etherscan V2, Moralis, CoinGecko |
| Arbitrum | GoPlus, DexScreener, Etherscan V2, Moralis, CoinGecko |
| Base | GoPlus, DexScreener, Etherscan V2, Moralis, CoinGecko |
| Optimism | GoPlus, DexScreener, Etherscan V2, Moralis, CoinGecko |
| Solana | Helius, GoPlus, DexScreener, CoinGecko |
| Bitcoin (TAP Protocol) | Local tap-reader full node |

### Features
- **Rule-based risk scoring engine** — deterministic, fully explainable 0–100 score
- **Honeypot detection** — via GoPlus Security API
- **Tax analysis** — buy/sell tax, trading cooldown, transfer pause detection
- **Liquidity & age checks** — DexScreener pairs, LP lock percentage, token age
- **Holder concentration** — top-10 wallet analysis, deployer holdings, owner percent
- **Contract analysis** — source verification, deployer wallet age and history
- **Solana-specific** — mint authority, freeze authority, metadata mutability
- **TAP Protocol scanner** — full holder analysis, token-auth authority, mint progress, trading activity on Bitcoin
- **Local AI narrative** — Ollama (qwen2.5:7b) generates a human-readable summary matching the risk verdict
- **Real-time WebSocket streaming** — scan progress updates live in the UI
- **Telegram bot** — paste any address into [@TracSentinelBot](https://t.me/TracSentinelBot) for instant scan results
- **Shareable result links** — send a `/result/:id` URL to share any scan
- **Scan history** — searchable, with risk-level change alerts on rescan
- **Watchlist** — pin tokens and rescan them with one click
- **P2P source labelling** — results tagged as Live / Cached / Trac P2P

### Architecture
```
trac-sentinel/
├── apps/
│   ├── backend/          # Node.js + Express + WebSocket API
│   │   └── src/
│   │       ├── analyzer.ts        # Orchestrates all data sources
│   │       ├── scoring.ts         # Deterministic risk scoring engine
│   │       ├── db.ts              # SQLite result store (better-sqlite3)
│   │       ├── telegram.ts        # Telegram bot (grammy)
│   │       └── services/
│   │           ├── goplus.ts      # Honeypot + contract safety
│   │           ├── dexscreener.ts # Liquidity + trading pairs
│   │           ├── etherscan.ts   # Contract + deployer info (EVM)
│   │           ├── moralis.ts     # Token metadata + holders
│   │           ├── helius.ts      # Solana token + holder data
│   │           ├── coingecko.ts   # Price + market cap
│   │           ├── ollama.ts      # Local AI narrative generation
│   │           ├── tapScanner.ts  # Bitcoin TAP Protocol full scanner
│   │           └── tap.ts         # TAP Protocol cross-chain detection
│   └── frontend/         # React + Vite (TypeScript, no UI framework)
│       └── src/
│           ├── App.tsx            # Main dashboard
│           ├── components/
│           │   ├── ResultCard.tsx # Full scan result display
│           │   ├── AnalyzeForm.tsx
│           │   └── ResultPage.tsx # Shareable result page
│           └── hooks/
│               ├── useSentinel.ts # WebSocket + API state
│               └── useWatchlist.ts
└── docker-compose.yml
```

### Risk Levels
| Score | Level | Meaning |
|-------|-------|---------|
| 0–25 | ✅ SAFE | Low risk signals |
| 26–50 | ⚠️ CAUTION | Some risk factors present |
| 51–75 | 🔴 DANGER | High risk — significant red flags |
| 76–100 | ☠️ RUG | Likely rug pull |

---

## Future Plans

### Phase 1 — Polish & Reliability (In Progress)
- [ ] Mobile-responsive UI
- [ ] Export scan results as PDF / JSON
- [ ] Batch scan from CSV (wallet portfolio analysis)
- [ ] Historical risk score chart per token
- [ ] Deeper Solana token analysis (Jupiter liquidity, Raydium pools)

### Phase 2 — Trac P2P Network Integration
- [ ] Connect to Trac Network mainnet when live
- [ ] Broadcast completed scan results to P2P peers automatically
- [ ] Fetch cached results from peers before hitting APIs (save quota + time)
- [ ] Peer reputation system — weight results from high-uptime nodes higher
- [ ] Node discovery and health monitoring dashboard

### Phase 3 — Advanced Intelligence
- [ ] Creator wallet tracking — flag wallets that deployed previous rugs
- [ ] Cross-chain deployer linking — same deployer across ETH/BSC/Base
- [ ] Whale wallet monitoring — alert when top holders start selling
- [ ] Smart money tracker — follow known safe wallets' positions
- [ ] Token launch prediction — detect suspicious activity before launch
- [ ] Community flags — let users submit evidence that upgrades/downgrades a verdict

### Phase 4 — Ecosystem
- [ ] Public API for developers
- [ ] Browser extension (paste address anywhere, get instant badge)
- [ ] Discord bot
- [ ] Token project dashboard — let projects verify themselves and display a badge
- [ ] Trac Network incentives — earn rewards for running a node and sharing results

---

## Getting Started

### Prerequisites
- Node.js 20+
- [Ollama](https://ollama.ai) running locally (`ollama pull qwen2.5:7b`)
- API keys (see `.env.example`)

### Install
```bash
git clone https://github.com/onchaindude/trac-sentinel.git
cd trac-sentinel
npm install

# Copy and fill in your API keys
cp apps/backend/.env.example apps/backend/.env
```

### Run (development)
```bash
npm run dev
# Backend: http://localhost:4000
# Frontend: http://localhost:5173
```

### Run (production)
```bash
npm run build
NODE_ENV=production node apps/backend/dist/index.js
# Serves frontend + API on http://localhost:4000
```

### TAP Protocol (Bitcoin) Support
TAP Protocol scanning requires a local [tap-reader](https://github.com/Trac-Systems/tap-reader) node (~150GB SSD, 8GB RAM):
```bash
git clone https://github.com/Trac-Systems/tap-reader
cd tap-reader && npm install && npm start
# Set TAP_READER_URL=http://localhost:5099 in .env
```

### Telegram Bot
1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Set `TELEGRAM_BOT_TOKEN=your_token` in `.env`
3. Set `SENTINEL_URL=http://your-server:4000` in `.env`
4. Restart the backend — the bot starts automatically

---

## API Keys Required

| Service | Purpose | Get Yours |
|---------|---------|-----------|
| Etherscan | EVM contract + deployer info | [etherscan.io/apis](https://etherscan.io/apis) |
| Moralis | Token metadata + holders | [moralis.io](https://moralis.io) |
| GoPlus | Honeypot + contract safety | [gopluslabs.io](https://gopluslabs.io) |
| Helius | Solana token data | [helius.dev](https://helius.dev) |
| CoinGecko | Price + market data | [coingecko.com/api](https://www.coingecko.com/en/api) |

---

## Built On

- **[Trac Network](https://tracsystems.io)** — P2P infrastructure for Bitcoin and beyond
- **[TAP Protocol](https://github.com/Trac-Systems/tap-protocol)** — Bitcoin Ordinals token standard
- **[Ollama](https://ollama.ai)** — Local AI inference
- **[grammy](https://grammy.dev)** — Telegram bot framework

---

## Contributing

This project follows a feature-branch workflow:

```bash
git checkout -b feature/your-feature
# make changes
git commit -m "feat: description"
git push origin feature/your-feature
# open a Pull Request
```

Never commit directly to `main`.

---

*TracSentinel — Scan before you ape.*
