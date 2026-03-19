import 'dotenv/config';
import express          from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors             from 'cors';
import helmet           from 'helmet';
import path             from 'path';
import fs               from 'fs';
import os               from 'os';
import crypto           from 'crypto';
import { execFileSync, spawn as spawnProcess } from 'child_process';
import { fileURLToPath } from 'url';
import rateLimit        from 'express-rate-limit';
import { analyzeToken, type Chain, type AnalysisResult } from './analyzer.js';
import { checkOllamaHealth } from './services/ollama.js';
import { saveResult, getResult, getAllResults, clearResults, getLatestResultForToken, getStats, getTokenHistory, getTokensByCreator, savePeerResult, getPeerStats, getRecentPeers, getSubscriberCount } from './db.js';
import { logger } from './logger.js';
import { startTelegramBot, broadcastHighRisk } from './telegram.js';
import { tracNetwork } from './peer/tracNetwork.js';

// ── Mode detection ────────────────────────────────────────────────────────────
// Full node requires API keys. Peer mode works without them (receives P2P only).
const isPeerMode = !process.env.ETHERSCAN_API_KEY;
if (isPeerMode) {
  console.log('\n[Startup] No API keys found — running in PEER MODE\n  Scan results will be received from the Trac P2P Network.\n  Add API keys to .env to enable live scanning (Full Node mode).\n');
} else {
  const REQUIRED_ENV = ['ETHERSCAN_API_KEY', 'GOPLUS_APP_KEY', 'HELIUS_API_KEY'] as const;
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n[Startup] Missing required environment variables:\n  ${missing.join('\n  ')}\n`);
    process.exit(1);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Auto-detect a free port (4000–4019) ───────────────────────────────────────
function findFreePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(start, '127.0.0.1', () => probe.close(() => resolve(start)));
    probe.on('error', () =>
      start >= 4019
        ? reject(new Error('No free port found in range 4000–4019'))
        : findFreePort(start + 1).then(resolve, reject)
    );
  });
}
const PORT = await findFreePort(parseInt(process.env.PORT ?? '4000', 10));

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

// Trust proxy so rate limiter sees real client IPs (not proxy IP)
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));
app.use(cors({ origin: true, credentials: true })); // localhost-only app — allow all local origins
app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max:      10,           // 10 scans per minute per IP
  message:  { error: 'Too many requests — max 10 scans per minute' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── In-memory map for active (analyzing) results ──────────────────────────────
const activeResults = new Map<string, AnalysisResult>();

// TTL cleanup — remove stale entries after 5 minutes (handles hung API calls)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of activeResults) {
    if (val.ts < cutoff) activeResults.delete(key);
  }
}, 60_000);

// ── WebSocket broadcast ───────────────────────────────────────────────────────
function broadcast(data: unknown) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  logger.info('WS client connected');
  const snapshot = getAllResults(20);
  ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }));
  ws.on('close', () => logger.info('WS client disconnected'));
});

// ── REST: Health ──────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const ollama = await checkOllamaHealth();
  const { p2p_results, unique_nodes } = getPeerStats();
  res.json({
    ok: true,
    ollama,
    uptime: process.uptime(),
    p2p: {
      connected:    tracNetwork.isReady(),
      peer_id:      tracNetwork.getPeerId(),
      channel:      'tracsentinel',
      p2p_results,
      unique_nodes,
      mode:         process.env.ETHERSCAN_API_KEY ? 'full_node' : 'peer',
    },
  });
});

// ── REST: Network stats ───────────────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  res.json({ ...getStats(), nodes_online: wss.clients.size, subscribers: getSubscriberCount() });
});

// ── REST: P2P network metrics ─────────────────────────────────────────────────
app.get('/api/p2p', (_req, res) => {
  const { p2p_results, unique_nodes, last_peer_ts } = getPeerStats();
  res.json({
    connected:      tracNetwork.isReady(),
    peer_id:        tracNetwork.getPeerId(),
    channel:        'tracsentinel',
    mode:           process.env.ETHERSCAN_API_KEY ? 'full_node' : 'peer',
    p2p_results,
    unique_nodes,
    last_peer_ts,
    recent_peers:   getRecentPeers(10),
  });
});

// ── REST: Analyze token ───────────────────────────────────────────────────────
app.post('/api/analyze', analyzeLimiter, async (req, res) => {
  const { address, chain } = req.body as { address?: string; chain?: Chain };

  if (!address || !chain) {
    res.status(400).json({ error: 'address and chain are required' });
    return;
  }

  const validChains: Chain[] = ['eth', 'bsc', 'polygon', 'arbitrum', 'base', 'optimism', 'solana', 'tap'];
  if (!validChains.includes(chain)) {
    res.status(400).json({ error: `chain must be one of: ${validChains.join(', ')}` });
    return;
  }

  const addr = address.trim().toLowerCase();
  const EVM_RE    = /^0x[0-9a-f]{40}$/;
  const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const TAP_RE    = /^[a-z0-9]{3,32}$/i;
  const validAddr = chain === 'solana' ? SOLANA_RE.test(address.trim())
                  : chain === 'tap'    ? TAP_RE.test(address.trim())
                  : EVM_RE.test(addr);
  if (!validAddr) {
    const fmt = chain === 'solana' ? 'base58 string (32–44 chars)'
              : chain === 'tap'    ? 'ticker symbol (3–32 alphanumeric characters, e.g. TRAC)'
              : '0x + 40 hex characters';
    res.status(400).json({ error: `Invalid address format for ${chain} — expected ${fmt}` });
    return;
  }
  const id   = `${chain}:${addr}:${Date.now()}`;
  res.json({ id, status: 'analyzing' });

  logger.info({ chain, address: addr }, 'Analysis started');

  // Track the analyzer's own id (generated inside analyzeToken) to avoid key mismatch
  let trackingId = id;
  try {
    const result = await analyzeToken(addr, chain, (partial) => {
      if (partial.id) trackingId = partial.id;
      const existing = activeResults.get(trackingId) ?? {} as AnalysisResult;
      const merged   = { ...existing, ...partial } as AnalysisResult;
      activeResults.set(trackingId, merged);
      broadcast({ type: 'progress', data: merged });
    });

    activeResults.delete(result.id);
    saveResult(result);
    broadcast({ type: 'complete', data: result });
    broadcastHighRisk(result).catch(() => {});
    if (result.status === 'error') {
      logger.info({ chain, address: addr }, 'Peer mode — no live scan, awaiting P2P result');
    } else {
      logger.info({ chain, address: addr, risk_level: result.verdict?.risk_level, score: result.verdict?.risk_score }, 'Analysis complete');
    }
  } catch (err) {
    activeResults.delete(trackingId);
    logger.error({ chain, address: addr, err }, 'Analysis error');
    broadcast({ type: 'error', data: { id, error: String(err) } });
  }
});

// ── REST: Get single result by ID ─────────────────────────────────────────────
app.get('/api/results/:id', (req, res) => {
  const result = getResult(decodeURIComponent(req.params.id!));
  if (!result) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(result);
});

// ── Shared param validators ───────────────────────────────────────────────────
const VALID_CHAINS_SET = new Set(['eth','bsc','polygon','arbitrum','base','optimism','solana','tap']);
const EVM_RE_STRICT    = /^0x[0-9a-f]{40}$/i;
const SOLANA_RE_STRICT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TAP_RE_STRICT    = /^[a-zA-Z0-9]{3,32}$/;

function validateChainAddress(chain: string, address: string): string | null {
  if (!VALID_CHAINS_SET.has(chain)) return 'Invalid chain';
  const clean = address.trim();
  if (chain === 'solana' && !SOLANA_RE_STRICT.test(clean)) return 'Invalid Solana address';
  if (chain === 'tap'    && !TAP_RE_STRICT.test(clean))    return 'Invalid TAP ticker';
  if (!['solana','tap'].includes(chain) && !EVM_RE_STRICT.test(clean)) return 'Invalid EVM address';
  return null;
}

// ── REST: Risk score history for a token ──────────────────────────────────────
app.get('/api/results/:chain/:address/history', (req, res) => {
  const { chain, address } = req.params as { chain: string; address: string };
  const err = validateChainAddress(chain, address);
  if (err) { res.status(400).json({ error: err }); return; }
  res.json(getTokenHistory(address.toLowerCase(), chain));
});

// ── REST: Tokens by creator address ───────────────────────────────────────────
app.get('/api/creator/:address', (req, res) => {
  const addr = req.params.address!.trim();
  if (!EVM_RE_STRICT.test(addr)) { res.status(400).json({ error: 'Invalid EVM address' }); return; }
  res.json(getTokensByCreator(addr.toLowerCase()));
});

// ── REST: Get latest result for a token (used by P2P peers) ──────────────────
app.get('/api/results/:chain/:address', (req, res) => {
  const { chain, address } = req.params as { chain: string; address: string };
  const err = validateChainAddress(chain, address);
  if (err) { res.status(400).json({ error: err }); return; }
  const result = getLatestResultForToken(address.toLowerCase(), chain);
  if (!result) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(result);
});

// ── REST: All results ─────────────────────────────────────────────────────────
app.get('/api/results', (_req, res) => {
  res.json(getAllResults(50));
});

// ── REST: Clear all results ───────────────────────────────────────────────────
app.delete('/api/results', (_req, res) => {
  clearResults();
  broadcast({ type: 'snapshot', data: [] });
  logger.info('All results cleared');
  res.json({ ok: true });
});

// ── Serve frontend in production ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ── Auto-setup Trac Intercom for P2P (runs on every startup) ────────────────
async function autoSetupIntercom(): Promise<void> {
  // Find pear binary
  const pearCandidates = process.platform === 'darwin'
    ? [
        path.join(os.homedir(), 'Library', 'Application Support', 'pear', 'bin', 'pear'),
        path.join(os.homedir(), '.config', 'pear', 'bin', 'pear'),
      ]
    : [
        path.join(os.homedir(), '.config', 'pear', 'bin', 'pear'),
        '/usr/local/bin/pear',
      ];

  let pearBin: string | null = null;
  for (const p of pearCandidates) {
    if (fs.existsSync(p)) { pearBin = p; break; }
  }
  if (!pearBin) {
    try { execFileSync('pear', ['--version'], { stdio: 'ignore' }); pearBin = 'pear'; }
    catch {}
  }
  if (!pearBin) {
    logger.info('Pear Runtime not found — P2P disabled. Install from https://pears.com to enable.');
    return;
  }

  // Clone Intercom if not already present
  const intercomDir = path.join(os.homedir(), '.config', 'trac-sentinel', 'intercom');
  if (!fs.existsSync(path.join(intercomDir, 'package.json'))) {
    logger.info('Setting up Trac Intercom for P2P (one time)…');
    try {
      fs.mkdirSync(path.join(os.homedir(), '.config', 'trac-sentinel'), { recursive: true });
      execFileSync('git', ['clone', '--depth=1', 'https://github.com/Trac-Systems/intercom.git', intercomDir], { stdio: 'pipe' });
    } catch (err) {
      logger.warn({ err }, 'Could not clone Intercom — P2P disabled');
      return;
    }
  }

  // Reuse existing token if already configured, otherwise generate a new one
  const envFile = path.join(__dirname, '../.env');
  let token = process.env.SC_BRIDGE_TOKEN ?? '';
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    process.env.SC_BRIDGE_TOKEN = token;
    try {
      let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
      const upsert = (key: string, val: string) => {
        const re = new RegExp(`^${key}=.*$`, 'm');
        text = re.test(text) ? text.replace(re, `${key}=${val}`) : text.trimEnd() + `\n${key}=${val}\n`;
      };
      upsert('SC_BRIDGE_URL', 'ws://127.0.0.1:49222');
      upsert('SC_BRIDGE_TOKEN', token);
      fs.writeFileSync(envFile, text);
    } catch { /* non-fatal */ }
  }

  process.env.SC_BRIDGE_URL = 'ws://127.0.0.1:49222';

  // Start Intercom (always — it needs to run on every startup)
  try {
    const proc = spawnProcess(pearBin, [
      'run', intercomDir,
      '--peer-store-name',       'trac-sentinel-peer',
      '--sc-bridge',
      '--sc-bridge-token',       token,
      '--sc-bridge-port',        '49222',
      '--sidechannel',           'tracsentinel',
      '--sidechannel-auto-join', '1',
    ], { stdio: 'ignore', detached: false });
    proc.on('error', () => {});
    logger.info('Trac Intercom started — P2P connecting…');
  } catch (err) {
    logger.warn({ err }, 'Failed to start Intercom — P2P disabled');
  }
}

await autoSetupIntercom();

server.listen(PORT, () => {
  logger.info({ port: PORT }, `TracSentinel backend running — http://localhost:${PORT}`);
  startTelegramBot();
  if (process.env.SC_BRIDGE_URL && process.env.SC_BRIDGE_TOKEN) {
    tracNetwork.connect();

    // Save incoming P2P scan results and broadcast to connected frontend clients
    tracNetwork.onScan((payload, nodeId) => {
      const result = { ...payload.result, source: 'p2p' as const, node_id: nodeId };
      savePeerResult(result, nodeId);
      broadcast({ type: 'p2p', data: result });
      broadcastHighRisk(result).catch(() => {});
      logger.info(
        { address: payload.address, chain: payload.chain, score: payload.score, from: nodeId.slice(0, 16) },
        'P2P result saved from peer',
      );
    });
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, 'TracSentinel shutting down…');
  tracNetwork.disconnect();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  // Force-exit if graceful close takes too long
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
