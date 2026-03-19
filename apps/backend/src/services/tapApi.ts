/**
 * Trac TAP Protocol Public API — https://tap.trac.network
 *
 * Free, no API key. Uses Socket.io (WebSocket). This is the official
 * public endpoint run by Trac Systems. Falls back to a local tap-reader
 * node (TAP_READER_URL in .env) if the public API is unreachable.
 */
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { logger } from '../logger.js';

const TAP_API_URL    = 'https://tap.trac.network';
const TIMEOUT_MS     = 12_000;
const LOCAL_READER   = process.env.TAP_READER_URL ?? '';

// ── Socket.io singleton ───────────────────────────────────────────────────────
let _socket: Socket | null = null;
let _callId = 0;

interface PendingCall {
  resolve: (v: unknown) => void;
  timer:   ReturnType<typeof setTimeout>;
}
const _pending = new Map<string, PendingCall>();

function getSocket(): Socket {
  if (_socket) return _socket;

  _socket = io(TAP_API_URL, {
    transports:        ['websocket'],
    reconnection:      true,
    reconnectionDelay: 2_000,
    timeout:           10_000,
  });

  _socket.on('response', (data: { call_id?: string; result?: unknown }) => {
    if (!data?.call_id) return;
    const p = _pending.get(data.call_id);
    if (!p) return;
    clearTimeout(p.timer);
    _pending.delete(data.call_id);
    p.resolve(data.result ?? null);
  });

  _socket.on('connect',       () => logger.debug('TAP API connected'));
  _socket.on('disconnect',    () => logger.debug('TAP API disconnected'));
  _socket.on('connect_error', (e: Error) => logger.debug({ msg: e.message }, 'TAP API connect error'));

  return _socket;
}

async function apiCall<T>(func: string, args: unknown[]): Promise<T | null> {
  return new Promise(resolve => {
    const call_id = `ts_${++_callId}`;
    const socket  = getSocket();

    const timer = setTimeout(() => {
      _pending.delete(call_id);
      resolve(null);
    }, TIMEOUT_MS);

    _pending.set(call_id, { resolve: v => resolve(v as T), timer });
    socket.emit('get', { func, args, call_id });
  });
}

// ── Local tap-reader fallback (REST) ─────────────────────────────────────────
async function localGet<T>(path: string): Promise<T | null> {
  if (!LOCAL_READER) return null;
  try {
    const res  = await axios.get(`${LOCAL_READER}${path}`, { timeout: 8_000 });
    const body = res.data;
    if (body && 'result' in body) return body.result as T;
    if (body && 'data'   in body) return body.data   as T;
    return null;
  } catch {
    return null;
  }
}

async function withFallback<T>(
  apiFn: () => Promise<T | null>,
  localPath: string,
): Promise<T | null> {
  const v = await apiFn();
  if (v !== null && v !== undefined) return v;
  return localGet<T>(localPath);
}

// ── Public helpers ────────────────────────────────────────────────────────────

export async function getDeployment(ticker: string): Promise<Record<string, unknown> | null> {
  const t = ticker.toLowerCase();
  return withFallback(
    () => apiCall('deployment', [t]),
    `/getDeployment/${encodeURIComponent(t)}`,
  );
}

export async function getMintTokensLeft(ticker: string): Promise<string | null> {
  const t = ticker.toLowerCase();
  const raw = await withFallback<unknown>(
    () => apiCall('mintTokensLeft', [t]),
    `/getMintTokensLeft/${encodeURIComponent(t)}`,
  );
  return raw !== null ? String(raw) : null;
}

export async function getHoldersLength(ticker: string): Promise<number> {
  const t = ticker.toLowerCase();
  const raw = await withFallback<unknown>(
    () => apiCall('holdersLength', [t]),
    `/getHoldersLength/${encodeURIComponent(t)}`,
  );
  return raw !== null ? Number(raw) : 0;
}

export async function getHolders(
  ticker: string, offset = 0, max = 10,
): Promise<{ address: string; balance: string; transferable?: string }[]> {
  const t = ticker.toLowerCase();
  const raw = await withFallback<unknown[]>(
    () => apiCall('holders', [t, offset, max]),
    `/getHolders/${encodeURIComponent(t)}?offset=${offset}&max=${max}`,
  );
  return Array.isArray(raw) ? raw as { address: string; balance: string; transferable?: string }[] : [];
}

export async function getBalance(address: string, ticker: string): Promise<string> {
  const t = ticker.toLowerCase();
  const raw = await withFallback<unknown>(
    () => apiCall('balance', [address, t]),
    `/getBalance/${address}/${encodeURIComponent(t)}`,
  );
  return raw !== null ? String(raw) : '0';
}

export async function getAccountAuthList(
  address: string, offset = 0, max = 20,
): Promise<{ auth?: string[] }[]> {
  const raw = await withFallback<unknown[]>(
    () => apiCall('accountAuthList', [address, offset, max]),
    `/getAccountAuthList/${address}?offset=${offset}&max=${max}`,
  );
  return Array.isArray(raw) ? raw as { auth?: string[] }[] : [];
}

export async function getTickerTradesLength(ticker: string): Promise<number> {
  const t = ticker.toLowerCase();
  const raw = await withFallback<unknown>(
    () => apiCall('tickerTradesListLength', [t]),
    `/getTickerTradesListLength/${encodeURIComponent(t)}`,
  );
  return raw !== null ? Number(raw) : 0;
}

export function disconnectTapApi(): void {
  _socket?.disconnect();
  _socket = null;
}
