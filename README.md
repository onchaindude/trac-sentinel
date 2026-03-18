# TracSentinel

**Local-first, P2P crypto rug pull detector — built on Trac Network.**

TracSentinel scans token contracts across 8 blockchains and returns an instant risk verdict: honeypot detection, deployer history, liquidity checks, holder concentration, and an AI-written summary. Everything runs on your own machine — no central server, no tracking, no subscription.

> **Scan before you ape.**

---

## Why Local-First + P2P?

Most token scanners are centralized web services. That means:
- They can go down, get rate-limited, or shut down
- They log every address you search
- You depend on one company's uptime and honesty

TracSentinel works differently:

| | Centralized Scanner | TracSentinel |
|---|---|---|
| Runs on | Their servers | Your machine |
| Your searches | Logged by them | Stay on your device |
| Offline? | Broken | Cached results still work |
| P2P results | Never | Instant, from other nodes |
| Cost | Subscription / ads | Free forever |

**The P2P advantage:** When another TracSentinel node has already scanned a token, you get the result in milliseconds — no API calls, no waiting. The more people run nodes, the faster and richer the shared knowledge becomes. This is crypto infrastructure that actually matches crypto values: decentralized, self-sovereign, open.

---

## Two Ways to Run

### Peer Mode — Zero setup, just receive
No API keys needed. Your node connects to the Trac P2P Network and receives scan results shared by Full Nodes. Already-scanned tokens load instantly. You can also subscribe to alerts via the shared Telegram bot.

**Good for:** Casual users who want P2P-powered results without running any infrastructure.

### Full Node Mode — Live scan + share
Add your API keys and your node can scan any token live, then automatically shares results back to the network. Every scan you run benefits every other Peer on the network.

**Good for:** Power users, researchers, or anyone who wants the freshest data and wants to contribute to the network.

---

## Features

- **Risk scoring engine** — deterministic 0–100 score with full explanation, no black box
- **Honeypot detection** — via GoPlus Security
- **Tax & trading checks** — buy/sell tax, cooldowns, transfer pause, anti-whale mechanisms
- **Liquidity analysis** — DEX pairs, LP lock %, pool age, volume trends
- **Holder concentration** — top-10 wallets, deployer holdings, whale alerts
- **Deployer history** — wallet age, previous token launches, other deployments
- **Solana-specific** — mint authority, freeze authority, metadata mutability
- **Bitcoin TAP Protocol** — full scanner for Ordinals tokens (via local tap-reader node)
- **Local AI narrative** — Ollama generates a human-readable summary that matches the verdict
- **Real-time UI** — WebSocket streaming, live scan progress, scan history, watchlist
- **Telegram alerts** — subscribe to `/subscribe` on the bot to get RUG/DANGER alerts from the whole P2P network
- **P2P result sharing** — completed scans automatically shared with all connected nodes
- **Trac Network integration** — live connection status, peer count, P2P result feed

---

## Risk Levels

| Score | Level | What It Means |
|-------|-------|---------------|
| 0 – 25 | ✅ SAFE | Low risk signals detected |
| 26 – 50 | ⚠️ CAUTION | Some risk factors present — research further |
| 51 – 75 | 🔴 DANGER | Significant red flags — high caution advised |
| 76 – 100 | ☠️ RUG | Strong rug pull indicators — avoid |

> Results are informational only and not financial advice. Always DYOR.

---

## Supported Chains

| Chain | Sources |
|-------|---------|
| Ethereum | GoPlus · DexScreener · Etherscan · Moralis · CoinGecko |
| BNB Chain | GoPlus · DexScreener · Etherscan · Moralis · CoinGecko |
| Polygon | GoPlus · DexScreener · Etherscan · Moralis · CoinGecko |
| Arbitrum | GoPlus · DexScreener · Etherscan · Moralis · CoinGecko |
| Base | GoPlus · DexScreener · Etherscan · Moralis · CoinGecko |
| Optimism | GoPlus · DexScreener · Etherscan · Moralis · CoinGecko |
| Solana | Helius · DexScreener · CoinGecko |
| Bitcoin (TAP Protocol) | Local tap-reader full node |

---

## Getting Started

### Option A — Peer Mode (no API keys)

```bash
# 1. Clone the repo
git clone https://github.com/onchaindude/trac-sentinel.git
cd trac-sentinel

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Run (no .env needed)
node apps/backend/dist/index.js
```

Open http://localhost:4000 — your node will connect to the Trac P2P Network and start receiving scan results from other nodes automatically.

---

### Option B — Full Node Mode (with API keys)

```bash
# 1. Clone and install
git clone https://github.com/onchaindude/trac-sentinel.git
cd trac-sentinel
npm install

# 2. Set up your environment
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env and add your API keys (see table below)

# 3. Install Ollama for local AI summaries
# Download from https://ollama.ai then:
ollama pull qwen2.5:7b

# 4. Build and run
npm run build
node apps/backend/dist/index.js
```

Open http://localhost:4000. Your node is now live — it scans tokens in real time and shares results with the P2P network.

---

### Development Mode

```bash
npm run dev
# Backend:  http://localhost:4000
# Frontend: http://localhost:5173 (hot reload)
```

---

## API Keys

Full Node mode requires these free API keys. All have generous free tiers.

| Service | Purpose | Get Yours |
|---------|---------|-----------|
| [Etherscan](https://etherscan.io/apis) | EVM contract + deployer info | Free tier: 5 req/s |
| [GoPlus](https://gopluslabs.io) | Honeypot + contract safety | Free tier available |
| [Helius](https://helius.dev) | Solana token data | Free tier: 100k req/day |
| [Moralis](https://moralis.io) | Token metadata + holder counts | Free tier available |
| [CoinGecko](https://www.coingecko.com/en/api) | Price + market cap | Free tier: 30 req/min |

Copy `apps/backend/.env.example` to `apps/backend/.env` and fill in your keys. Keys are never shared — they stay on your machine.

---

## Telegram Alerts

You don't need to set up your own bot. Just message the shared bot and subscribe to the P2P network alert feed:

1. Open Telegram and find **[@TracSentinelBot](https://t.me/TracSentinelBot)**
2. Send `/subscribe` — you'll receive alerts whenever any node on the network detects a RUG or DANGER token
3. Send `/unsubscribe` to stop at any time

**Or scan on demand:** Paste any contract address or TAP ticker directly into the bot chat.

**Bot commands:**
| Command | Description |
|---------|-------------|
| `/subscribe` | Receive RUG + DANGER alerts from the P2P network |
| `/unsubscribe` | Stop alerts |
| `/stats` | Network activity — total scans, rugs found, subscriber count |
| Paste an address | Scan any token on demand |

---

## Trac P2P Network

TracSentinel is built on top of the [Trac Network](https://tracsystems.io) Intercom SC-Bridge — a decentralized P2P messaging layer.

When your node completes a scan:
1. The result is stored locally in SQLite
2. It's automatically published to the `tracsentinel` P2P channel
3. Any other node subscribed to that channel receives it instantly
4. Peers never re-scan a token that was already scanned within the last hour — they use the cached P2P result instead

To join the P2P network, add these to your `.env`:
```
SC_BRIDGE_URL=ws://127.0.0.1:49222
SC_BRIDGE_TOKEN=your_token_here
```

Get your SC-Bridge credentials from [tracsystems.io](https://tracsystems.io).

---

## Bitcoin TAP Protocol Support

Scanning Bitcoin Ordinals tokens (TAP Protocol) requires a local [tap-reader](https://github.com/Trac-Systems/tap-reader) node. This is optional — EVM and Solana chains work without it.

**Requirements:** ~150GB SSD, 8GB RAM, Node.js 20+

```bash
git clone https://github.com/Trac-Systems/tap-reader
cd tap-reader
npm install
npm start
# Syncs P2P over Bitcoin blocks — initial sync takes hours to days
```

Add to your `.env`:
```
TAP_READER_URL=http://localhost:5099
```

Once synced, you can scan any TAP ticker (e.g. `TRAC`, `NAT`) directly from the TracSentinel UI.

---

## Running as a Background Service

To keep your node running 24/7:

```bash
# Install PM2
npm install -g pm2

# Run the backend
pm2 start node --name trac-sentinel -- apps/backend/dist/index.js
pm2 save
pm2 startup  # auto-start on reboot
```

---

## Pear App (Desktop Launcher)

TracSentinel includes a [Pear Runtime](https://docs.pears.com) launcher for a one-click desktop experience:

```bash
# Install Pear
npm install -g pear

# Run
pear run apps/pear
```

This starts the backend automatically, opens your browser, and handles port conflicts gracefully. If the backend crashes, it restarts it automatically.

---

## Architecture

```
trac-sentinel/
├── apps/
│   ├── backend/               # Node.js · Express · WebSocket · TypeScript
│   │   └── src/
│   │       ├── analyzer.ts    # Orchestrates all data sources
│   │       ├── scoring.ts     # Deterministic risk engine
│   │       ├── db.ts          # SQLite (better-sqlite3)
│   │       ├── telegram.ts    # Shared Telegram alert bot
│   │       ├── peer/
│   │       │   └── tracNetwork.ts  # Trac P2P Network client
│   │       └── services/      # GoPlus · DexScreener · Etherscan · Moralis
│   │                          # Helius · CoinGecko · Ollama · TAP
│   ├── frontend/              # React · Vite · TypeScript (no UI framework)
│   └── pear/                  # Desktop launcher (Pear Runtime)
└── apps/backend/.env.example  # Config template
```

---

## Roadmap

### Coming Soon
- Mobile-responsive UI
- Export results as JSON / PDF
- Risk score chart over time per token
- Deeper Solana analysis (Jupiter, Raydium)

### Planned
- Peer reputation scoring — weight results from high-uptime nodes
- Creator wallet tracker — flag addresses that launched previous rugs
- Cross-chain deployer linking — same deployer on ETH/BSC/Base
- Whale wallet alerts — notify when top holders start selling
- Browser extension — instant risk badge on any DEX page
- Public API for developers

---

## Contributing

```bash
git checkout -b feature/your-feature
# make your changes
git commit -m "feat: description"
git push origin feature/your-feature
# open a Pull Request against main
```

Please open an issue before starting large changes.

---

## Built With

- [Trac Network](https://tracsystems.io) — P2P infrastructure for Bitcoin and beyond
- [TAP Protocol](https://github.com/Trac-Systems/tap-protocol) — Bitcoin Ordinals token standard
- [Ollama](https://ollama.ai) — Local AI inference (qwen2.5:7b)
- [grammy](https://grammy.dev) — Telegram bot framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — Fast local database

---

*Not financial advice. Always do your own research.*
