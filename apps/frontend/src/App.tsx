import { useState, useMemo, useEffect, useRef } from 'react';
import { useSentinel }         from './hooks/useSentinel.js';
import type { AnalysisResult } from './hooks/useSentinel.js';
import { useWatchlist }        from './hooks/useWatchlist.js';
import type { Chain }          from './hooks/useSentinel.js';
import { AnalyzeForm }         from './components/AnalyzeForm.js';
import { ResultCard }           from './components/ResultCard.js';
import { ResultPage }           from './components/ResultPage.js';
import { RiskBadge }            from './components/RiskBadge.js';

// Minimal client-side router — no dependencies needed
function useRoute(): { page: 'home' | 'result'; id?: string } {
  const path = window.location.pathname;
  const m    = path.match(/^\/result\/(.+)$/);
  if (m) return { page: 'result', id: decodeURIComponent(m[1]!) };
  return { page: 'home' };
}

const CHAIN_LABEL: Record<string, string> = {
  eth: 'ETH', bsc: 'BNB', polygon: 'MATIC',
  arbitrum: 'ARB', base: 'BASE', optimism: 'OP', solana: 'SOL', tap: '₿ TAP',
};

function timeAgo(ts: number): string {
  const age = Date.now() - ts;
  if (age < 60_000)     return 'just now';
  if (age < 3_600_000)  return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return `${Math.floor(age / 86_400_000)}d ago`;
}

function HistoryRow({ result, expanded, onToggle, isLast, isPinned, onPin, onUnpin }: {
  result:    AnalysisResult;
  expanded:  boolean;
  onToggle:  () => void;
  isLast:    boolean;
  isPinned:  boolean;
  onPin:     () => void;
  onUnpin:   () => void;
}) {
  const { verdict } = result;
  return (
    <div style={isLast ? undefined : { borderBottom: '1px solid #1f2937' }}>
      <button onClick={onToggle} style={histStyles.row}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <span style={histStyles.chain}>{CHAIN_LABEL[result.chain] ?? result.chain}</span>
          <span style={histStyles.name}>
            {result.name || '?'}
            {result.symbol
              ? <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: '4px' }}>{result.symbol}</span>
              : null}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {verdict && <RiskBadge level={verdict.risk_level} score={verdict.risk_score} />}
          <span style={{ color: '#4b5563', fontSize: '11px' }}>{timeAgo(result.ts)}</span>
          <span style={{ color: '#4b5563', fontSize: '10px' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 0 12px' }}>
          <ResultCard result={result} isPinned={isPinned} onPin={onPin} onUnpin={onUnpin} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const route = useRoute();
  if (route.page === 'result') return <ResultPage id={route.id!} />;
  return <HomePage />;
}

interface NetStats { total: number; rugs: number; dangers: number; safe: number; nodes_online: number; }

function HomePage() {
  const { results, connected, analyzing, analyze, analyzeBatch, batchProgress, clearHistory, riskAlert, clearRiskAlert } = useSentinel();
  const { watchlist, pin, unpin, isPinned } = useWatchlist();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [histSearch, setHistSearch] = useState('');
  const [netStats, setNetStats]     = useState<NetStats | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Deduplicate: one entry per chain:address, keeping most recent
  const deduped = useMemo(() => {
    const seen = new Map<string, AnalysisResult>();
    for (const r of results) {
      const key = `${r.chain}:${r.address}`;
      if (!seen.has(key) || r.ts > seen.get(key)!.ts) seen.set(key, r);
    }
    return [...seen.values()].sort((a, b) => b.ts - a.ts);
  }, [results]);

  const current = deduped[0] ?? null;
  const allHistory = deduped.slice(1);
  const history = histSearch.trim()
    ? allHistory.filter(r => {
        const q = histSearch.toLowerCase();
        return r.name?.toLowerCase().includes(q) ||
               r.symbol?.toLowerCase().includes(q) ||
               r.address.toLowerCase().includes(q);
      })
    : allHistory;

  // Step progress for the scan button
  const stepLabel = useMemo(() => {
    if (!analyzing || !current?.steps) return undefined;
    const idx = current.steps.findIndex(s => s.status === 'running');
    if (idx === -1) return '⟳ Starting…';
    const name = current.steps[idx]!.name.replace(/\s*\(.*?\)/g, '').trim();
    return `${idx + 1}/${current.steps.length} · ${name}`;
  }, [analyzing, current?.steps]);

  // Network stats
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setNetStats).catch(() => {});
    const t = setInterval(() =>
      fetch('/api/stats').then(r => r.json()).then(setNetStats).catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, []);

  const toggle = (id: string) =>
    setExpandedId(prev => (prev === id ? null : id));

  const scanAnother = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
    formRef.current?.querySelector('input')?.focus();
  };

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🛡</span>
          <div>
            <div style={styles.logoText}>TracSentinel</div>
            <div style={styles.logoSub}>
              P2P Crypto Rug Pull Detector ·{' '}
              <a
                href="https://tracsystems.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#34d399', textDecoration: 'none', fontWeight: 600 }}
              >
                Powered by Trac Network
              </a>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Network stats pill */}
          {netStats && (
            <div style={styles.walletWidget} className="wallet-widget">
              <span style={{ color: '#4b5563', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em' }}>NETWORK</span>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{netStats.total}</span> scanned
              </span>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>·</span>
              <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700 }}>{netStats.rugs}</span>
              <span style={{ color: '#4b5563', fontSize: '10px' }}>rugs</span>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>·</span>
              <span style={{ color: '#34d399', fontSize: '11px', fontWeight: 700 }}>{netStats.nodes_online}</span>
              <span style={{ color: '#4b5563', fontSize: '10px' }}>nodes</span>
            </div>
          )}
          {/* Trac P2P badge */}
          <a
            href="https://tracsystems.io"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.tracBadge}
            title="Built on Trac P2P Network"
          >
            🌐 Trac Network
          </a>
          {/* WS status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', color: connected ? '#4ade80' : '#f87171' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%',
              background: connected ? '#4ade80' : '#f87171', display: 'inline-block' }} />
            {connected ? 'Live' : 'Reconnecting…'}
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={styles.main}>
        {/* Risk change alert */}
        {riskAlert && (
          <div style={styles.riskAlert}>
            <span>⚠️ Risk level changed for <strong>{riskAlert.token}</strong>: </span>
            <span style={{ color: riskColors[riskAlert.from] }}>{riskAlert.from}</span>
            <span style={{ color: '#6b7280', margin: '0 6px' }}>→</span>
            <span style={{ color: riskColors[riskAlert.to] }}>{riskAlert.to}</span>
            <button onClick={clearRiskAlert} style={styles.alertClose}>×</button>
          </div>
        )}

        {/* Scan form */}
        <div style={styles.section} ref={formRef}>
          <AnalyzeForm
            onAnalyze={analyze}
            onBatch={analyzeBatch}
            analyzing={analyzing}
            stepLabel={stepLabel}
            batchProgress={batchProgress}
          />
        </div>

        {/* Network stats bar */}
        {netStats && (
          <div style={styles.statsBar}>
            <span style={styles.statItem}>🔍 <strong>{netStats.total}</strong> scanned</span>
            <span style={styles.statDot}>·</span>
            <span style={styles.statItem}>☠️ <strong style={{ color: '#ef4444' }}>{netStats.rugs}</strong> rugs</span>
            <span style={styles.statDot}>·</span>
            <span style={styles.statItem}>⚠️ <strong style={{ color: '#f97316' }}>{netStats.dangers}</strong> danger</span>
            <span style={styles.statDot}>·</span>
            <span style={styles.statItem}>✅ <strong style={{ color: '#4ade80' }}>{netStats.safe}</strong> safe</span>
            <span style={styles.statDot}>·</span>
            <span style={styles.statItem}>🌐 <strong style={{ color: '#34d399' }}>{netStats.nodes_online}</strong> nodes</span>
          </div>
        )}

        {/* P2P network info bar */}
        <div style={styles.p2pBar}>
          <span style={{ color: '#34d399', fontWeight: 700, fontSize: '12px' }}>🌐 Trac P2P Network</span>
          <span style={{ color: '#4b5563', fontSize: '11px', margin: '0 8px' }}>·</span>
          <span className="p2p-bar-text" style={{ color: '#6b7280', fontSize: '11px' }}>
            Results cached locally and shared across the P2P layer — launching with Trac Network mainnet.
          </span>
          <span style={{ color: '#4b5563', fontSize: '11px', margin: '0 8px' }}>·</span>
          <a
            href="https://tracsystems.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#34d399', fontSize: '11px', textDecoration: 'none' }}
          >
            Learn about Trac →
          </a>
        </div>

        {/* Recently scanned ticker */}
        {history.length > 0 && (
          <div style={styles.ticker}>
            <span style={styles.tickerLabel}>Recent:</span>
            <div style={styles.tickerScroll}>
              {history.slice(0, 8).map(r => (
                <button key={r.id} onClick={() => toggle(r.id)} style={styles.tickerChip}>
                  <span style={styles.tickerChain}>{CHAIN_LABEL[r.chain] ?? r.chain}</span>
                  <span style={{ fontSize: '12px', color: '#e2e8f0' }}>{r.symbol || r.name || '?'}</span>
                  {r.verdict && <RiskBadge level={r.verdict.risk_level} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Watchlist */}
        {watchlist.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={styles.historyHeader}>
              <span>📌 Watchlist</span>
              <span style={{ color: '#4b5563', fontSize: '11px', fontWeight: 400 }}>
                {watchlist.length} pinned
              </span>
            </div>
            <div style={styles.historyList}>
              {watchlist.map((w, i) => {
                const scanned = deduped.find(r => r.address === w.address && r.chain === w.chain);
                const isLast  = i === watchlist.length - 1;
                return (
                  <div key={`${w.chain}:${w.address}`}
                    style={isLast ? undefined : { borderBottom: '1px solid #1f2937' }}>
                    <div style={{ ...histStyles.row, display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '8px' }}>
                      <span style={histStyles.chain}>{CHAIN_LABEL[w.chain] ?? w.chain}</span>
                      <span style={{ ...histStyles.name, flex: 1 }}>
                        {w.name || '?'}
                        {w.symbol && <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: '4px' }}>{w.symbol}</span>}
                      </span>
                      {scanned?.verdict
                        ? <RiskBadge level={scanned.verdict.risk_level} score={scanned.verdict.risk_score} />
                        : <span style={{ color: '#4b5563', fontSize: '11px' }}>Not scanned</span>}
                      <button
                        onClick={() => analyze(w.address, w.chain as Chain)}
                        style={styles.clearBtn}
                        disabled={analyzing}
                      >
                        {analyzing ? '…' : 'Rescan'}
                      </button>
                      <button
                        onClick={() => unpin(w.address, w.chain as Chain)}
                        style={{ ...styles.clearBtn, color: '#ef4444', borderColor: '#7f1d1d' }}
                        title="Remove from watchlist"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current / latest scan */}
        {current ? (
          <div style={{ marginBottom: '32px' }}>
            <ResultCard
              result={current}
              isPinned={isPinned(current.address, current.chain)}
              onPin={() => pin(current)}
              onUnpin={() => unpin(current.address, current.chain)}
              onScanAnother={scanAnother}
            />
          </div>
        ) : (
          <div style={styles.empty}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <div style={{ color: '#6b7280', fontSize: '14px' }}>
              Enter a token contract address above to start a security scan.
            </div>
            <div style={{ color: '#4b5563', fontSize: '12px', marginTop: '8px' }}>
              Works on Ethereum, BNB Chain, Polygon, Arbitrum, Base, Optimism, and Solana.
            </div>
            <div style={{ marginTop: '24px', padding: '12px 16px', background: '#0d1117',
              border: '1px solid #1f2937', borderRadius: '8px', display: 'inline-block',
              textAlign: 'left' }}>
              <div style={{ color: '#34d399', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>
                🌐 HOW TRAC P2P WORKS
              </div>
              <div style={{ color: '#6b7280', fontSize: '11px', lineHeight: 1.7 }}>
                ✓ Your node shares scan results with the Trac Network<br />
                ✓ Other nodes' results load instantly — no API calls needed<br />
                ✓ Fully local · self-sovereign · no central server<br />
                ✓ Built on{' '}
                <a href="https://tracsystems.io" target="_blank" rel="noopener noreferrer"
                  style={{ color: '#34d399', textDecoration: 'none' }}>Trac Systems infrastructure</a>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {allHistory.length > 0 && (
          <div>
            <div style={styles.historyHeader}>
              <span>History</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  placeholder="Search…"
                  value={histSearch}
                  onChange={e => setHistSearch(e.target.value)}
                  style={styles.searchInput}
                />
                <span style={{ color: '#4b5563', fontSize: '11px', fontWeight: 400 }}>
                  {allHistory.length} scan{allHistory.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => { if (confirm('Clear all scan history?')) clearHistory(); }}
                  style={styles.clearBtn}
                >
                  Clear
                </button>
              </div>
            </div>
            {history.length === 0 ? (
              <div style={{ color: '#4b5563', fontSize: '13px', padding: '16px', textAlign: 'center' }}>
                No results match "{histSearch}"
              </div>
            ) : (
              <div style={styles.historyList}>
                {history.map((r, i) => (
                  <HistoryRow
                    key={r.id}
                    result={r}
                    expanded={expandedId === r.id}
                    onToggle={() => toggle(r.id)}
                    isLast={i === history.length - 1}
                    isPinned={isPinned(r.address, r.chain)}
                    onPin={() => pin(r)}
                    onUnpin={() => unpin(r.address, r.chain)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <span style={{ color: '#374151' }}>TracSentinel</span>
        <span style={{ color: '#1f2937', margin: '0 8px' }}>·</span>
        <span style={{ color: '#374151', fontSize: '11px' }}>
          Built on{' '}
          <a
            href="https://tracsystems.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#34d399', textDecoration: 'none', fontWeight: 600 }}
          >
            Trac P2P Network
          </a>
          {' '}·{' '}
          <a
            href="https://github.com/Trac-Systems"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#6b7280', textDecoration: 'none' }}
          >
            GitHub
          </a>
          {' '}·{' '}
          <a
            href="https://x.com/TracNetwork"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#6b7280', textDecoration: 'none' }}
          >
            @TracNetwork
          </a>
        </span>
      </footer>
    </div>
  );
}

const riskColors: Record<string, string> = {
  SAFE: '#4ade80', CAUTION: '#fbbf24', DANGER: '#f97316', RUG: '#ef4444',
};

const histStyles: Record<string, React.CSSProperties> = {
  row: {
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
    padding: '10px 14px', textAlign: 'left', fontFamily: 'inherit',
  },
  chain: {
    background: '#1f2937', color: '#60a5fa',
    padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
    flexShrink: 0,
  },
  name: {
    fontSize: '13px', fontWeight: 600, color: '#e2e8f0',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
};

const styles: Record<string, React.CSSProperties> = {
  root:    { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header:  {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 24px', borderBottom: '1px solid #1f2937', background: '#0d1117',
  },
  logo:    { display: 'flex', gap: '12px', alignItems: 'center' },
  logoIcon: { fontSize: '28px' },
  logoText: { fontSize: '18px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.02em' },
  logoSub:  { fontSize: '11px', color: '#6b7280', marginTop: '2px' },
  main:    { flex: 1, padding: '24px', maxWidth: '860px', margin: '0 auto', width: '100%' },
  section: { marginBottom: '24px' },
  empty:   { textAlign: 'center', padding: '60px 24px' },
  historyHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    color: '#6b7280', fontSize: '11px', fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: '8px', paddingBottom: '8px',
    borderBottom: '1px solid #1f2937',
  },
  historyList: {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  clearBtn: {
    background: 'transparent', border: '1px solid #374151',
    borderRadius: '6px', color: '#6b7280', fontSize: '11px',
    padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit',
  },
  walletWidget: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '5px 10px', background: '#0d1117',
    border: '1px solid #1f2937', borderRadius: '8px',
  },
  ticker: {
    display: 'flex', alignItems: 'center', gap: '8px',
    marginBottom: '16px', overflow: 'hidden',
  },
  tickerLabel: {
    color: '#4b5563', fontSize: '11px', fontWeight: 600,
    flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  tickerScroll: {
    display: 'flex', gap: '6px', overflowX: 'auto',
    paddingBottom: '2px',
    scrollbarWidth: 'none' as const,
  },
  tickerChip: {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '4px 8px', background: '#111827',
    border: '1px solid #1f2937', borderRadius: '999px',
    cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  tickerChain: {
    background: '#1f2937', color: '#60a5fa',
    padding: '1px 5px', borderRadius: '3px',
    fontSize: '9px', fontWeight: 700,
  },
  tracBadge: {
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 10px',
    background: '#022c22', border: '1px solid #065f46',
    borderRadius: '999px', color: '#34d399',
    fontSize: '11px', fontWeight: 700, textDecoration: 'none',
    letterSpacing: '0.03em',
  },
  p2pBar: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px',
    padding: '8px 12px', marginBottom: '20px',
    background: '#022c22', border: '1px solid #065f46',
    borderRadius: '8px',
  },
  footer: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '16px 24px', borderTop: '1px solid #1f2937',
    fontSize: '12px', color: '#374151',
  },
  statsBar: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: '6px',
    padding: '8px 12px', marginBottom: '16px',
    background: '#0d1117', border: '1px solid #1f2937',
    borderRadius: '8px', fontSize: '12px', color: '#6b7280',
  },
  statItem: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
  statDot:  { color: '#1f2937' },
  riskAlert: {
    display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const,
    padding: '10px 14px', marginBottom: '16px',
    background: '#1c1007', border: '1px solid #78350f',
    borderRadius: '8px', fontSize: '13px', color: '#fbbf24',
    position: 'relative' as const,
  },
  alertClose: {
    marginLeft: 'auto', background: 'transparent', border: 'none',
    color: '#6b7280', fontSize: '16px', cursor: 'pointer',
    padding: '0 4px', lineHeight: 1,
  },
  searchInput: {
    background: '#0d1117', border: '1px solid #374151',
    borderRadius: '6px', color: '#e2e8f0', fontSize: '11px',
    padding: '3px 8px', outline: 'none', fontFamily: 'inherit', width: '120px',
  },
};
