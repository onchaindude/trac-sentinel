import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import type { AnalysisResult } from '../analyzer.js';

const SC_BRIDGE_URL   = process.env.SC_BRIDGE_URL   ?? 'ws://127.0.0.1:49222';
const SC_BRIDGE_TOKEN = process.env.SC_BRIDGE_TOKEN ?? '';
const CHANNEL         = 'tracsentinel';
const VALID_CHAINS    = new Set(['eth', 'bsc', 'polygon', 'arbitrum', 'base', 'optimism', 'solana', 'tap']);
const MAX_PAYLOAD_AGE = 10 * 60 * 1000; // reject results older than 10 minutes

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

function isValidPayload(p: unknown): p is P2PPayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  if (o.app !== 'trac-sentinel') return false;
  if (o.version !== 1) return false;
  if (typeof o.address !== 'string' || !o.address) return false;
  if (!VALID_CHAINS.has(o.chain as string)) return false;
  if (typeof o.score !== 'number' || o.score < 0 || o.score > 100) return false;
  if (typeof o.ts !== 'number' || Date.now() - o.ts > MAX_PAYLOAD_AGE) return false;
  if (!o.result || typeof o.result !== 'object') return false;
  return true;
}

class TracNetwork extends EventEmitter {
  private ws:             WebSocket | null = null;
  private ready           = false;
  private localPeerId:    string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
        const msg = JSON.parse(raw.toString()) as BridgeMsg;
        this._handle(msg);
      } catch { /* ignore parse errors */ }
    });

    ws.on('close', () => {
      logger.warn('TracNetwork: SC-Bridge disconnected — reconnecting in 10s');
      this.ws    = null;
      this.ready = false;
      this.reconnectTimer = setTimeout(() => this._connect(), 10_000);
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

  private _handle(msg: BridgeMsg) {
    switch (msg.type) {

      case 'hello':
        // Store our peer identity then authenticate
        this.localPeerId = (msg.peer as string) ?? null;
        this._send({ type: 'auth', token: SC_BRIDGE_TOKEN });
        break;

      case 'auth_ok':
        // Join + subscribe to TracSentinel channel
        this._send({ type: 'join',      channel: CHANNEL });
        this._send({ type: 'subscribe', channels: [CHANNEL] });
        break;

      case 'joined':
        if (msg.channel === CHANNEL) {
          this.ready = true;
          logger.info({ channel: CHANNEL }, 'TracNetwork: joined Intercom channel — P2P ready');
          this.emit('ready');
        }
        break;

      case 'sidechannel_message':
        if (msg.channel === CHANNEL) {
          const payload = msg.message as unknown;
          if (isValidPayload(payload)) {
            const nodeId = (msg.from as string) ?? 'unknown';
            logger.debug({ address: payload.address, chain: payload.chain, from: nodeId },
              'TracNetwork: received P2P scan result');
            this.emit('scan', payload, nodeId);
          } else {
            logger.warn({ msg }, 'TracNetwork: dropped invalid P2P payload');
          }
        }
        break;

      case 'error':
        logger.warn({ msg }, 'TracNetwork: SC-Bridge error message');
        break;
    }
  }

  publish(result: AnalysisResult): boolean {
    if (!this.ready) return false;

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
