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
- **Local AI narrative** — any Ollama model writes a human-readable summary matching the verdict. Runs entirely on your hardware. Default: `qwen2.5:7b`
- **Real-time streaming** — WebSocket scan progress, step-by-step live updates in the UI
- **Scan history** — searchable, with risk-level change alerts when you rescan
- **Watchlist** — pin tokens, rescan in one click
- **Batch scanning** — paste multiple addresses at once
- **P2P result sharing** — completed scans published to the Trac Network automatically
- **P2P metrics panel** — live view of connected peers, results received, node IDs
- **Telegram alerts** — shared community bot: `/subscribe` once, get RUG/DANGER alerts from any node on the network. No bot setup required

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
| Ethereum | GoPlus · DexScreener · Etherscan V2 · Ankr · CoinPaprika |
| BNB Chain | GoPlus · DexScreener · Etherscan V2 · Ankr · CoinPaprika |
| Polygon | GoPlus · DexScreener · Etherscan V2 · Ankr · CoinPaprika |
| Arbitrum | GoPlus · DexScreener · Etherscan V2 · Ankr · CoinPaprika |
| Base | GoPlus · DexScreener · Etherscan V2 · Ankr · CoinPaprika |
| Optimism | GoPlus · DexScreener · Etherscan V2 · Ankr · CoinPaprika |
| Solana | Helius · DexScreener · CoinPaprika |
| Bitcoin (TAP Protocol) | Local tap-reader full node |

---

## Getting Started

### Quickest way — Pear App

Install [Pear Runtime](https://pears.com) from pears.com, then run:

```bash
pear run pear://cx8ohu8zmgg6cijjfkzinu4o1b4jpnhjsgfmmsyhotjn1x8zbego
```

First launch sets everything up automatically. See the [Pear Terminal App](#pear-terminal-app) section for full details.

---

### Manual — Peer Mode (no API keys required)

```bash
git clone https://github.com/onchaindude/trac-sentinel.git
cd trac-sentinel
npm install && npm run build
NODE_ENV=production node apps/backend/dist/index.js
```

Your terminal will print the URL (auto-detects a free port starting at 4000). Open it in your browser — your node connects to the Trac P2P Network automatically.

---

### Manual — Full Node Mode (live scanning)

```bash
git clone https://github.com/onchaindude/trac-sentinel.git
cd trac-sentinel
npm install

# Copy the config template and fill in your API keys
cp apps/backend/.env.example apps/backend/.env
# edit apps/backend/.env — see API Keys section below

# Optional: install Ollama for AI summaries
# Download from https://ollama.ai, then:
ollama pull qwen2.5:7b

npm run build
NODE_ENV=production node apps/backend/dist/index.js
```

Your terminal will print the URL. Open it — your node scans live and shares results with the P2P network.

---

### Development

```bash
npm run dev
# Backend + API: http://localhost:4000
# Frontend (hot reload): http://localhost:5173
```

---

## API Keys

Only 3 keys are needed for Full Node mode. All are free. Ankr and CoinPaprika require no keys at all.

| Service | Purpose | Free? | Sign Up |
|---------|---------|-------|---------|
| [Etherscan](https://etherscan.io/apis) | EVM contract + deployer data | Free tier | Required |
| [GoPlus](https://gopluslabs.io) | Honeypot + contract safety | Free tier | Required |
| [Helius](https://helius.dev) | Solana token + holder data | Free · 100k req/day | For Solana |
| Ankr | Token metadata + holder counts | Completely free, no key | — |
| CoinPaprika | Price + market cap | Completely free, no key | — |

Keys stay on your machine and are never shared with anyone.

---

## Local AI (Ollama)

TracSentinel uses [Ollama](https://ollama.ai) to generate human-readable summaries for each scan. It runs entirely on your hardware — no data leaves your machine.

**Ollama is optional.** The scanner works fully without it — AI summaries will just be omitted.

**Default model:** `qwen2.5:7b` (~4.7 GB) — reliable, accurate JSON output.

**Use your own model** by setting `OLLAMA_MODEL` in your `.env`:

```env
OLLAMA_MODEL=llama3.2:3b    # lighter, faster
OLLAMA_MODEL=mistral:7b     # solid alternative
OLLAMA_MODEL=qwen2.5:3b     # smaller qwen
```

Any model in your `ollama list` will work. TracSentinel respects whatever you have configured.

---

## Telegram Bot

No setup required. The community bot is already running.

1. Open **[@TracSentinelBot](https://t.me/TracSentinelBot)** on Telegram
2. Send `/subscribe` — receive RUG and DANGER alerts from any node on the P2P network
3. Or paste any contract address / TAP ticker for an on-demand scan

| Command | Description |
|---------|-------------|
| `/subscribe` | Get alerts when RUG/DANGER tokens are detected by any network node |
| `/unsubscribe` | Stop alerts |
| `/stats` | Network stats — total scans, rugs found, subscriber count |

**Scanning on demand — send the address with the chain:**

```
# Ethereum (default if no chain specified)
0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 eth

# Other EVM chains — add the chain name
0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 bsc
0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 base

# Solana — auto-detected by address format, no chain needed
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Bitcoin TAP Protocol — ticker + "tap"
TRAC tap
NAT tap
```

---

## Trac P2P Network

TracSentinel connects to the [Trac Network](https://tracsystems.io) via the Intercom SC-Bridge — a local WebSocket gateway that bridges your node to the Trac P2P network.

**Without SC-Bridge:** TracSentinel runs as a local-only scanner. All features still work — scanning, AI summaries, Telegram bot, history, watchlist — just no P2P sharing with other nodes.

**With SC-Bridge:** Your node joins the `tracsentinel` P2P channel. Completed scans are published to the network automatically, and results from other nodes load instantly without API calls.

P2P integration requires the [Trac Intercom](https://tracsystems.io) SC-Bridge running locally alongside TracSentinel. Intercom is a Pear-based P2P framework from Trac Systems. Once running, you configure TracSentinel to connect to it:

```env
SC_BRIDGE_URL=ws://127.0.0.1:49222
SC_BRIDGE_TOKEN=your_sc_bridge_token
```

See [tracsystems.io](https://tracsystems.io) for Intercom setup instructions.

---

## Pear Terminal App

TracSentinel is published on the Pear Network. If you have [Pear Runtime](https://pears.com) installed, this is the simplest way to run it — no cloning, no building, nothing else needed.

**Step 1 — Install Pear Runtime** (one time only)

Go to [pears.com](https://pears.com) and follow the install guide for your OS.

**Step 2 — Run**

```bash
pear run pear://cx8ohu8zmgg6cijjfkzinu4o1b4jpnhjsgfmmsyhotjn1x8zbego
```

**What happens on first launch** (~5–10 min, one time only):
1. Downloads TracSentinel source from GitHub
2. Installs dependencies and builds
3. Installs Ollama if not already on your system (skipped if you have it)
4. Downloads `qwen2.5:7b` — only if you don't already have an Ollama model configured
5. Shows you where to add API keys, then starts

Every launch after that is instant. Your browser opens automatically. The terminal shows your port.

**Already have Ollama?** TracSentinel uses whatever model is set in your `.env`. Set `OLLAMA_MODEL=your-preferred-model` and it won't download anything.

**Adding API keys** (optional — enables live scanning)

Your config file lives at:
```
~/.config/trac-sentinel/repo/apps/backend/.env
```
Edit it to add your API keys. Without them, the node runs in Peer Mode and still receives P2P results from the network.

**Updates** — re-run the same `pear run` command. Pear downloads the latest version automatically.

---

## Bitcoin TAP Protocol

Scanning TAP Protocol tokens (Bitcoin Ordinals) requires a local [tap-reader](https://github.com/Trac-Systems/tap-reader) node. This is optional — all other chains work without it.

**Requirements:** ~150 GB SSD, 8 GB RAM, Node.js 20+

```bash
git clone https://github.com/Trac-Systems/tap-reader
cd tap-reader && npm install && npm start
```

Add to `.env`:
```env
TAP_READER_URL=http://localhost:5099
```

Once synced, scan any TAP ticker (e.g. `TRAC`, `NAT`) directly from the UI. Initial sync takes hours to days.

---

## Run 24/7 in the Background

```bash
npm install -g pm2
pm2 start node --name trac-sentinel -- apps/backend/dist/index.js
pm2 save && pm2 startup
```

---

## Docker

```bash
docker compose up
```

The backend auto-detects a free port and prints the URL to the terminal.

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
│   │           ├── ankr.ts        # Token metadata + holders (free, no key)
│   │           ├── helius.ts      # Solana token + holder data
│   │           ├── coinpaprika.ts # Price + market cap (free, no key)
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
│   └── pear/                      # Pear Runtime terminal launcher
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
