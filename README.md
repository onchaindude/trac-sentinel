# TracSentinel

**Local-first, P2P crypto rug pull detector — built on Trac Network.**

Paste a token address. Get an instant, AI-powered risk verdict. Your data never leaves your machine.

---

## Why Local-First + P2P?

Most token scanners are centralized services — they log every address you search, can be rate-limited, and go down when the company does. TracSentinel is different:

| | Centralized Scanner | TracSentinel |
|---|---|---|
| Runs on | Their servers | Your machine |
| Your searches | Logged by them | Stay on your device |
| Goes down? | Yes | No — it's yours |
| P2P results | Never | Instant from other nodes |
| Cost | Subscription / ads | Free forever |

**The P2P advantage:** When another TracSentinel node already scanned a token, you get the result instantly — no API calls, no waiting. Every node that joins makes the network faster and smarter for everyone. This is crypto infrastructure that matches crypto values: decentralized, self-sovereign, open.

---

## Two Modes

### Peer Mode — Zero config, just receive
No API keys needed. Connect to the Trac P2P Network and receive scan results shared by Full Nodes in real time. Subscribe to the shared Telegram bot to get RUG/DANGER alerts from the whole network.

### Full Node Mode — Scan live + share back
Add your API keys and your node scans any token live, then automatically publishes results to the P2P network. Every scan you run benefits everyone else.

---

## What It Does

- **Multi-chain scanning** — Ethereum, BNB Chain, Polygon, Arbitrum, Base, Optimism, Solana, Bitcoin (TAP Protocol)
- **Deterministic risk engine** — rule-based 0–100 score, fully explainable, no black box
- **Honeypot detection** — buy/sell simulation via GoPlus Security
- **Tax analysis** — buy/sell tax, transfer cooldown, anti-whale, trading pause detection
- **Liquidity checks** — DEX pairs, LP lock percentage, pool age, volume trends (DexScreener)
- **Holder concentration** — top-10 wallet analysis, deployer holdings, whale detection
- **Deployer history** — wallet age, previous token deployments, linked contract launches
- **Contract analysis** — source code verification, ownership renouncement, mint authority
- **Solana-specific** — mint authority, freeze authority, metadata mutability (Helius)
- **Bitcoin TAP Protocol** — full scanner: mint progress, holders, token-auth authority, trade count
- **Local AI narrative** — Ollama (qwen2.5:7b) writes a human-readable summary that matches the verdict. Runs entirely on your hardware
- **Real-time streaming** — WebSocket scan progress, step-by-step live updates in the UI
- **Scan history** — searchable, with risk-level change alerts when you rescan
- **Watchlist** — pin tokens, rescan in one click
- **Batch scanning** — paste multiple addresses at once
- **P2P result sharing** — completed scans published to the Trac Network automatically
- **P2P metrics panel** — live view of connected peers, results received, node IDs
- **Telegram alerts** — shared community bot: `/subscribe` once, receive RUG/DANGER alerts from any node on the network. No bot setup required

---

## Risk Levels

| Score | Level | What It Means |
|-------|-------|---------------|
| 0–25 | ✅ SAFE | Low risk signals |
| 26–50 | ⚠️ CAUTION | Some risk factors — research further |
| 51–75 | 🔴 DANGER | Significant red flags — high caution |
| 76–100 | ☠️ RUG | Strong rug pull indicators |

> Not financial advice. Always do your own research.

---

## Supported Chains

| Chain | Data Sources |
|-------|-------------|
| Ethereum | GoPlus · DexScreener · Etherscan V2 · Moralis · CoinGecko |
| BNB Chain | GoPlus · DexScreener · Etherscan V2 · Moralis · CoinGecko |
| Polygon | GoPlus · DexScreener · Etherscan V2 · Moralis · CoinGecko |
| Arbitrum | GoPlus · DexScreener · Etherscan V2 · Moralis · CoinGecko |
| Base | GoPlus · DexScreener · Etherscan V2 · Moralis · CoinGecko |
| Optimism | GoPlus · DexScreener · Etherscan V2 · Moralis · CoinGecko |
| Solana | Helius · DexScreener · CoinGecko |
| Bitcoin (TAP Protocol) | Local tap-reader full node |

---

## Getting Started

### Requirements

- Node.js 20+
- For Full Node mode: API keys (see below)
- For local AI summaries: [Ollama](https://ollama.ai) (optional but recommended)

---

### Peer Mode (no API keys)

```bash
git clone https://github.com/onchaindude/trac-sentinel.git
cd trac-sentinel
npm install
npm run build
node apps/backend/dist/index.js
```

Open **http://localhost:4000** — your node connects to the Trac P2P Network and starts receiving results from other nodes automatically.

---

### Full Node Mode (with API keys)

```bash
git clone https://github.com/onchaindude/trac-sentinel.git
cd trac-sentinel
npm install

# Set up your environment
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env and add your API keys

# (Optional) Install Ollama for local AI summaries
# https://ollama.ai — then:
ollama pull qwen2.5:7b

npm run build
node apps/backend/dist/index.js
```

Open **http://localhost:4000**. Your node now scans live and shares results with the network.

---

### Development

```bash
npm run dev
# Backend:  http://localhost:4000
# Frontend: http://localhost:5173 (hot reload)
```

---

## API Keys

All services have a free tier. Keys stay on your machine and are never shared.

| Service | Purpose | Sign Up |
|---------|---------|---------|
| [Etherscan](https://etherscan.io/apis) | EVM contract + deployer data | Free |
| [GoPlus](https://gopluslabs.io) | Honeypot + contract safety | Free |
| [Helius](https://helius.dev) | Solana token + holder data | Free · 100k req/day |
| [Moralis](https://moralis.io) | Token metadata + holder counts | Free |
| [CoinGecko](https://www.coingecko.com/en/api) | Price + market cap | Free · 30 req/min |

---

## Telegram Bot

No setup required. The community bot is already running.

1. Open **[@TracSentinelBot](https://t.me/TracSentinelBot)** on Telegram
2. Send `/subscribe` to receive RUG and DANGER alerts from the P2P network
3. Or paste any contract address / TAP ticker for an on-demand scan

| Command | Description |
|---------|-------------|
| `/subscribe` | Get alerts when RUG/DANGER tokens are detected by any network node |
| `/unsubscribe` | Stop alerts |
| `/stats` | Network stats — total scans, rugs found, subscriber count |
| Paste address | Scan any token on demand |

---

## Trac P2P Network

TracSentinel is built on the [Trac Network](https://tracsystems.io) Intercom SC-Bridge. When your node completes a scan, the result is automatically published to the `tracsentinel` P2P channel. Other nodes receive it instantly and serve it from cache — no duplicate API calls.

To join the P2P network, add to your `.env`:

```env
SC_BRIDGE_URL=ws://127.0.0.1:49222
SC_BRIDGE_TOKEN=your_token_here
```

Get your SC-Bridge credentials at [tracsystems.io](https://tracsystems.io).

---

## Bitcoin TAP Protocol

Scanning TAP Protocol tokens (Bitcoin Ordinals) requires a local [tap-reader](https://github.com/Trac-Systems/tap-reader) node.

**Requirements:** ~150GB SSD, 8GB RAM

```bash
git clone https://github.com/Trac-Systems/tap-reader
cd tap-reader && npm install && npm start
```

Add to `.env`:
```env
TAP_READER_URL=http://localhost:5099
```

Once synced, scan any TAP ticker (e.g. `TRAC`, `NAT`) directly from the UI. Initial sync takes hours to days depending on your connection.

---

## Run in the Background (24/7)

```bash
npm install -g pm2
pm2 start node --name trac-sentinel -- apps/backend/dist/index.js
pm2 save && pm2 startup
```

---

## Pear Desktop App

TracSentinel includes a [Pear Runtime](https://docs.pears.com) launcher — start everything with one command, no terminal management needed:

```bash
npm install -g pear
pear run apps/pear
```

Automatically finds a free port, opens your browser, and restarts the backend if it crashes.

---

## Docker

```bash
docker compose up
# Backend + frontend on http://localhost:4000
```

---

## Architecture

```
trac-sentinel/
├── apps/
│   ├── backend/                   # Node.js · Express · WebSocket · TypeScript
│   │   └── src/
│   │       ├── analyzer.ts        # Orchestrates all data sources + P2P cache
│   │       ├── scoring.ts         # Deterministic risk scoring engine
│   │       ├── db.ts              # SQLite persistence (results + subscribers)
│   │       ├── telegram.ts        # Shared Telegram alert bot (grammy)
│   │       ├── peer/
│   │       │   └── tracNetwork.ts # Trac P2P Network client
│   │       └── services/
│   │           ├── goplus.ts      # Honeypot + contract safety
│   │           ├── dexscreener.ts # Liquidity + trading pairs
│   │           ├── etherscan.ts   # EVM contract + deployer info
│   │           ├── moralis.ts     # Token metadata + holders
│   │           ├── helius.ts      # Solana token + holder data
│   │           ├── coingecko.ts   # Price + market cap
│   │           ├── ollama.ts      # Local AI narrative generation
│   │           └── tapScanner.ts  # Bitcoin TAP Protocol scanner
│   ├── frontend/                  # React · Vite · TypeScript (no UI framework)
│   │   └── src/
│   │       ├── App.tsx            # Main dashboard + P2P metrics panel
│   │       ├── components/
│   │       │   ├── ResultCard.tsx # Full scan result display
│   │       │   ├── ResultPage.tsx # Shareable result page
│   │       │   ├── AnalyzeForm.tsx
│   │       │   ├── RiskBadge.tsx
│   │       │   └── StepTracker.tsx
│   │       └── hooks/
│   │           ├── useSentinel.ts  # WebSocket + API state
│   │           └── useWatchlist.ts
│   └── pear/                      # Pear Runtime desktop launcher
├── Dockerfile
└── docker-compose.yml
```

---

## Contributing

```bash
git checkout -b feature/your-feature
git commit -m "feat: description"
git push origin feature/your-feature
# Open a Pull Request — never commit directly to main
```

---

## Built With

| | |
|---|---|
| [Trac Network](https://tracsystems.io) | P2P infrastructure |
| [TAP Protocol](https://github.com/Trac-Systems/tap-protocol) | Bitcoin Ordinals token standard |
| [Ollama](https://ollama.ai) | Local AI inference |
| [grammy](https://grammy.dev) | Telegram bot framework |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Local database |
| Express · React · Vite · TypeScript | Core stack |

---

*Not financial advice. Always do your own research.*
