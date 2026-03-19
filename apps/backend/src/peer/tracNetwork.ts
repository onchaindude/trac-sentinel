import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import type { AnalysisResult } from '../analyzer.js';

const SC_BRIDGE_URL = process.env.SC_BRIDGE_URL ?? 'ws://127.0.0.1:49222';
// Token is read lazily at auth time so it works even when process.env is
// populated after module initialization (e.g. autoSetupIntercom)
const getToken = () => process.env.SC_BRIDGE_TOKEN ?? '';
const CHANNEL         = 'tracsentinel';
const VALID_CHAINS    = new Set(['eth', 'bsc', 'polygon', 'arbitrum', 'base', 'optimism', 'solana', 'tap']);
const MAX_PAYLOAD_AGE  = 10 * 60 * 1000; // reject results older than 10 minutes
const MAX_FUTURE_SKEW  = 30 * 1000;       // reject timestamps more than 30s in future
const MAX_PAYLOAD_BYTES = 50 * 1024;      // 50 KB hard limit
const PEER_DEDUP_MS    = 5 * 60 * 1000;  // ignore same peer+token within 5 min
const PUBLISH_DEDUP_MS = 60 * 60 * 1000; // don't re-publish same token within 1 hr

// score ranges per risk level
const RISK_SCORE_RANGES: Record<string, [number, number]> = {
  RUG:     [76, 100],
  DANGER:  [51, 75],
  CAUTION: [26, 50],
  SAFE:    [0,  25],
};

export interface P2PPayload {
  app:        'trac-sentinel';
  version:    1;
  address:    string;
  chain:      string;
  ts:         number;
  score:      number;
  risk_level: string;
  confidence: number;
  result:     AnalysisResult;
}

type BridgeMsg = { type: string; [key: string]: unknown };

function isValidPayload(p: unknown, rawSize: number): p is P2PPayload {
  if (rawSize > MAX_PAYLOAD_BYTES) return false;
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  if (o.app !== 'trac-sentinel') return false;
  if (o.version !== 1) return false;
  if (typeof o.address !== 'string' || !o.address) return false;
  if (!VALID_CHAINS.has(o.chain as string)) return false;
  if (typeof o.score !== 'number' || o.score < 0 || o.score > 100) return false;
  if (typeof o.ts !== 'number') return false;
  const now = Date.now();
  if (now - o.ts > MAX_PAYLOAD_AGE) return false;         // too old
  if (o.ts - now > MAX_FUTURE_SKEW) return false;         // too far in future
  // risk_level / score consistency
  if (typeof o.risk_level === 'string' && o.risk_level in RISK_SCORE_RANGES) {
    const [lo, hi] = RISK_SCORE_RANGES[o.risk_level]!;
    if (o.score < lo || o.score > hi) return false;
  }
  if (!o.result || typeof o.result !== 'object') return false;
  return true;
}

class TracNetwork extends EventEmitter {
  private ws:             WebSocket | null = null;
  private ready           = false;
  private localPeerId:    string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay  = 1_000; // exponential backoff: 1s → 2s → … → 60s
  // key: `${nodeId}:${chain}:${address}` → last accepted timestamp
  private peerDedup  = new Map<string, number>();
  // key: `${chain}:${address}` → last publish timestamp
  private publishDedup = new Map<string, number>();

  connect() {
    if (this.ws) return;
    this._connect();
  }

  private _connect() {
    logger.info({ url: SC_BRIDGE_URL }, 'TracNetwork: connecting to SC-Bridge');
    const ws = new WebSocket(SC_BRIDGE_URL);
    this.ws  = ws;

    ws.on('open', () => logger.debug('TracNetwork: WS open'));

    ws.on('message', (raw: Buffer) => {
      try {
        const str = raw.toString();
        const msg = JSON.parse(str) as BridgeMsg;
        this._handle(msg, str.length);
      } catch { /* ignore parse errors */ }
    });

    ws.on('close', () => {
      this.ws    = null;
      this.ready = false;
      logger.warn({ delay: this.reconnectDelay }, 'TracNetwork: SC-Bridge disconnected — reconnecting');
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000);
        this._connect();
      }, this.reconnectDelay);
    });

    ws.on('error', (err) => {
      logger.debug({ err }, 'TracNetwork: WS error');
    });
  }

  private _send(obj: BridgeMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private _handle(msg: BridgeMsg, rawSize = 0) {
    // Log all unhandled message types for debugging
    const KNOWN = new Set(['hello','auth_ok','joined','sidechannel_message','error']);
    if (!KNOWN.has(msg.type)) {
      logger.debug({ type: msg.type, msg }, 'TracNetwork: SC-Bridge message (unhandled type)');
    }

    switch (msg.type) {

      case 'hello':
        // Store our peer identity then authenticate
        this.localPeerId = (msg.peer as string) ?? null;
        this._send({ type: 'auth', token: getToken() });
        break;

      case 'auth_ok':
        // Join + subscribe to TracSentinel channel
        this._send({ type: 'join',      channel: CHANNEL });
        this._send({ type: 'subscribe', channels: [CHANNEL] });
        break;

      case 'joined':
        if (msg.channel === CHANNEL) {
          this.ready = true;
          this.reconnectDelay = 1_000; // reset backoff on successful connect
          logger.info({ channel: CHANNEL }, 'TracNetwork: joined Intercom channel — P2P ready');
          this.emit('ready');
        }
        break;

      case 'sidechannel_message':
        logger.info({ channel: msg.channel, from: msg.from }, 'TracNetwork: sidechannel_message received');
        if (msg.channel === CHANNEL) {
          const payload = msg.message as unknown;
          if (isValidPayload(payload, rawSize)) {
            const nodeId = (msg.from as string) ?? 'unknown';
            const dedupKey = `${nodeId}:${payload.chain}:${payload.address}`;
            const lastSeen = this.peerDedup.get(dedupKey) ?? 0;
            if (Date.now() - lastSeen < PEER_DEDUP_MS) {
              logger.info({ address: payload.address, from: nodeId }, 'TracNetwork: dedup — dropped repeated peer result');
              break;
            }
            this.peerDedup.set(dedupKey, Date.now());
            logger.info({ address: payload.address, chain: payload.chain, from: nodeId },
              'TracNetwork: received P2P scan result');
            this.emit('scan', payload, nodeId);
          } else {
            logger.warn({ msg }, 'TracNetwork: dropped invalid P2P payload');
          }
        }
        break;

      case 'error':
        logger.warn({ bridge_msg: JSON.stringify(msg) }, 'TracNetwork: SC-Bridge error — closing and reconnecting');
        this.ws?.close(); // trigger reconnect with fresh handshake
        break;
    }
  }

  publish(result: AnalysisResult): boolean {
    if (!this.ready) return false;

    const pubKey = `${result.chain}:${result.address}`;
    const lastPub = this.publishDedup.get(pubKey) ?? 0;
    if (Date.now() - lastPub < PUBLISH_DEDUP_MS) {
      logger.debug({ address: result.address, chain: result.chain }, 'TracNetwork: skipped re-publish (dedup)');
      return false;
    }
    this.publishDedup.set(pubKey, Date.now());

    const payload: P2PPayload = {
      app:        'trac-sentinel',
      version:    1,
      address:    result.address,
      chain:      result.chain,
      ts:         Date.now(),
      score:      result.verdict?.risk_score    ?? 0,
      risk_level: result.verdict?.risk_level    ?? 'SAFE',
      confidence: result.verdict?.confidence    ?? 0,
      result,
    };

    this._send({ type: 'send', channel: CHANNEL, message: payload });
    logger.info({ address: result.address, chain: result.chain, score: payload.score },
      'TracNetwork: published scan result to Intercom');
    return true;
  }

  isReady()    { return this.ready; }
  getPeerId()  { return this.localPeerId; }

  /** Convenience: register a typed callback for incoming peer scan results */
  onScan(cb: (payload: P2PPayload, nodeId: string) => void) {
    this.on('scan', cb);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws    = null;
    this.ready = false;
  }
}

// Singleton — one connection shared across the app
export const tracNetwork = new TracNetwork();
