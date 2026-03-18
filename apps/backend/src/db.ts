import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AnalysisResult } from './analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../sentinel.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS results (
    id         TEXT PRIMARY KEY,
    address    TEXT NOT NULL,
    chain      TEXT NOT NULL,
    ts         INTEGER NOT NULL,
    status     TEXT NOT NULL,
    name       TEXT,
    symbol     TEXT,
    risk_level TEXT,
    risk_score INTEGER,
    data       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_results_ts      ON results(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_results_address ON results(address, chain);
`);

// Safe migrations — no-op if columns already exist
try { db.exec(`ALTER TABLE results ADD COLUMN source  TEXT`); } catch {}
try { db.exec(`ALTER TABLE results ADD COLUMN node_id TEXT`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_results_source ON results(source)`); } catch {}

export function saveResult(result: AnalysisResult): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO results (id, address, chain, ts, status, name, symbol, risk_level, risk_score, source, node_id, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    result.id,
    result.address,
    result.chain,
    result.ts,
    result.status,
    result.name ?? null,
    result.symbol ?? null,
    result.verdict?.risk_level ?? null,
    result.verdict?.risk_score ?? null,
    result.source ?? 'live',
    result.node_id ?? null,
    JSON.stringify(result),
  );
}

export function savePeerResult(result: AnalysisResult, nodeId: string): void {
  const peerResult = { ...result, source: 'p2p' as const, node_id: nodeId };
  saveResult(peerResult);
}

export function getFreshPeerResult(
  address: string, chain: string, ttlMs = 3_600_000
): AnalysisResult | null {
  const cutoff = Date.now() - ttlMs;
  const row = db.prepare(`
    SELECT data FROM results
    WHERE address = ? AND chain = ? AND status = 'complete' AND ts > ?
    ORDER BY ts DESC LIMIT 1
  `).get(address, chain, cutoff) as { data: string } | undefined;
  return row ? parseRow(row.data) : null;
}

export function getPeerStats(): { p2p_results: number; unique_nodes: number; last_peer_ts: number | null } {
  const p2p   = (db.prepare(`SELECT COUNT(*) as n FROM results WHERE source = 'p2p'`).get() as { n: number }).n;
  const nodes = (db.prepare(`SELECT COUNT(DISTINCT node_id) as n FROM results WHERE source = 'p2p' AND node_id IS NOT NULL`).get() as { n: number }).n;
  const last  = (db.prepare(`SELECT MAX(ts) as t FROM results WHERE source = 'p2p'`).get() as { t: number | null }).t;
  return { p2p_results: p2p, unique_nodes: nodes, last_peer_ts: last };
}

export function getRecentPeers(limit = 10): { node_id: string; last_seen: number; result_count: number }[] {
  return db.prepare(`
    SELECT node_id, MAX(ts) as last_seen, COUNT(*) as result_count
    FROM results
    WHERE source = 'p2p' AND node_id IS NOT NULL
    GROUP BY node_id
    ORDER BY last_seen DESC
    LIMIT ?
  `).all(limit) as { node_id: string; last_seen: number; result_count: number }[];
}

function parseRow(data: string): AnalysisResult | null {
  try { return JSON.parse(data) as AnalysisResult; } catch { return null; }
}

export function getResult(id: string): AnalysisResult | null {
  const row = db.prepare('SELECT data FROM results WHERE id = ?').get(id) as { data: string } | undefined;
  return row ? parseRow(row.data) : null;
}

export function getAllResults(limit = 50): AnalysisResult[] {
  const rows = db.prepare('SELECT data FROM results ORDER BY ts DESC LIMIT ?').all(limit) as { data: string }[];
  return rows.map(r => parseRow(r.data)).filter((r): r is AnalysisResult => r !== null);
}

export function getStats(): { total: number; rugs: number; dangers: number; safe: number } {
  const q = (level: string) =>
    (db.prepare('SELECT COUNT(*) as n FROM results WHERE risk_level = ?').get(level) as { n: number }).n;
  const total = (db.prepare('SELECT COUNT(*) as n FROM results WHERE status = ?').get('complete') as { n: number }).n;
  return { total, rugs: q('RUG'), dangers: q('DANGER'), safe: q('SAFE') };
}

export function clearResults(): void {
  db.prepare('DELETE FROM results').run();
}

export function getLatestResultForToken(address: string, chain: string): AnalysisResult | null {
  const row = db.prepare(
    'SELECT data FROM results WHERE address = ? AND chain = ? AND status = ? ORDER BY ts DESC LIMIT 1'
  ).get(address, chain, 'complete') as { data: string } | undefined;
  return row ? parseRow(row.data) : null;
}

export function getTokenHistory(
  address: string, chain: string, limit = 10
): { ts: number; risk_level: string; risk_score: number }[] {
  const rows = db.prepare(`
    SELECT ts, risk_level, risk_score FROM results
    WHERE address = ? AND chain = ? AND status = 'complete'
    ORDER BY ts DESC LIMIT ?
  `).all(address, chain, limit) as { ts: number; risk_level: string; risk_score: number }[];
  return rows.reverse(); // oldest first for charting
}

export function getTokensByCreator(creatorAddress: string, limit = 10): {
  address: string; chain: string; name: string | null; symbol: string | null;
  risk_level: string | null; risk_score: number | null; ts: number;
}[] {
  const rows = db.prepare(`
    SELECT address, chain, name, symbol, risk_level, risk_score, ts FROM results
    WHERE json_extract(data, '$.goplus.creator_address') = ? AND status = 'complete'
    GROUP BY address, chain
    ORDER BY ts DESC LIMIT ?
  `).all(creatorAddress, limit) as {
    address: string; chain: string; name: string | null; symbol: string | null;
    risk_level: string | null; risk_score: number | null; ts: number;
  }[];
  return rows;
}
