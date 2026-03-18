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

export function saveResult(result: AnalysisResult): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO results (id, address, chain, ts, status, name, symbol, risk_level, risk_score, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(result),
  );
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
