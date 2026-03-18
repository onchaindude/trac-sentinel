import 'dotenv/config';
import express          from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors             from 'cors';
import helmet           from 'helmet';
import path             from 'path';
import { fileURLToPath } from 'url';
import rateLimit        from 'express-rate-limit';
import { analyzeToken, type Chain, type AnalysisResult } from './analyzer.js';
import { checkOllamaHealth } from './services/ollama.js';
import { saveResult, getResult, getAllResults, clearResults, getLatestResultForToken, getStats, getTokenHistory, getTokensByCreator, savePeerResult, getPeerStats } from './db.js';
import { logger } from './logger.js';
import { startTelegramBot } from './telegram.js';
import { tracNetwork } from './peer/tracNetwork.js';

// ── Env validation — fail fast with a clear message ───────────────────────────
const REQUIRED_ENV = [
  'ETHERSCAN_API_KEY',
  'GOPLUS_APP_KEY',
  'HELIUS_API_KEY',
] as const;

const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\n[Startup] Missing required environment variables:\n  ${missing.join('\n  ')}\n`);
  console.error('Copy .env.example to .env and fill in your API keys.\n');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '4000', 10);

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

app.use(helmet({
  // Allow WebSocket upgrade and frontend assets
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false, // handled by frontend build in prod
}));
app.use(cors());
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
  res.json({ ...getStats(), nodes_online: wss.clients.size });
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
    logger.info({ chain, address: addr, risk_level: result.verdict?.risk_level, score: result.verdict?.risk_score }, 'Analysis complete');
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

// ── REST: Risk score history for a token ──────────────────────────────────────
app.get('/api/results/:chain/:address/history', (req, res) => {
  const { chain, address } = req.params as { chain: string; address: string };
  res.json(getTokenHistory(address.toLowerCase(), chain));
});

// ── REST: Tokens by creator address ───────────────────────────────────────────
app.get('/api/creator/:address', (req, res) => {
  const creatorAddress = req.params.address!.toLowerCase();
  res.json(getTokensByCreator(creatorAddress));
});

// ── REST: Get latest result for a token (used by P2P peers) ──────────────────
app.get('/api/results/:chain/:address', (req, res) => {
  const { chain, address } = req.params as { chain: string; address: string };
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
      logger.info(
        { address: payload.address, chain: payload.chain, score: payload.score, from: nodeId.slice(0, 16) },
        'P2P result saved from peer',
      );
    });
  }
});
