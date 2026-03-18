import { useState, useMemo, useEffect, useRef } from 'react';
import tracLogo                from './assets/trac-logo.svg';
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

interface P2PStats {
  connected:    boolean;
  peer_id:      string | null;
  channel:      string;
  mode:         'full_node' | 'peer';
  p2p_results:  number;
  unique_nodes: number;
  last_peer_ts: number | null;
  recent_peers: { node_id: string; last_seen: number; result_count: number }[];
}

function timeAgo(ts: number): string {
  const age = Date.now() - ts;
  if (age < 60_000)     return 'just now';
  if (age < 3_600_000)  return `${Math.floor(age / 60_000)}m ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h ago`;
  return `${Math.floor(age / 86_400_000)}d ago`;
}

const DISCLAIMER_KEY = 'trac_sentinel_disclaimer_v1';

function HomePage() {
  const { results, connected, analyzing, analyze, analyzeBatch, batchProgress, clearHistory, riskAlert, clearRiskAlert } = useSentinel();
  const { watchlist, pin, unpin, isPinned } = useWatchlist();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [histSearch, setHistSearch] = useState('');
  const [netStats, setNetStats]     = useState<NetStats | null>(null);
  const [p2pStats, setP2pStats]     = useState<P2PStats | null>(null);
  const [p2pOpen, setP2pOpen]       = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(() => !localStorage.getItem(DISCLAIMER_KEY));
  const formRef = useRef<HTMLDivElement>(null);

  function acceptDisclaimer() {
    localStorage.setItem(DISCLAIMER_KEY, '1');
    setShowDisclaimer(false);
  }

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

  // P2P metrics
  useEffect(() => {
    fetch('/api/p2p').then(r => r.json()).then(setP2pStats).catch(() => {});
    const t = setInterval(() =>
      fetch('/api/p2p').then(r => r.json()).then(setP2pStats).catch(() => {}), 15_000);
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
      {/* DYOR Disclaimer modal */}
      {showDisclaimer && (
        <div style={disclaimerStyles.overlay}>
          <div style={disclaimerStyles.modal}>
            <div style={disclaimerStyles.icon}>🛡</div>
            <div style={disclaimerStyles.title}>TracSentinel</div>
            <div style={disclaimerStyles.subtitle}>P2P Crypto Risk Scanner</div>
            <div style={disclaimerStyles.body}>
              TracSentinel is a community-run analysis tool. Scan results are{' '}
              <strong>not financial advice</strong> and do not guarantee safety.
              Rug pulls and scams can evade automated detection.
            </div>
            <div style={disclaimerStyles.dyor}>
              Always DYOR — Do Your Own Research.
            </div>
            <button style={disclaimerStyles.btn} onClick={acceptDisclaimer}>
              I understand — Let's go
            </button>
          </div>
        </div>
      )}

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
                style={{ color: '#34d399', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                <img src={tracLogo} alt="Trac" style={{ width: '11px', height: '11px' }} />
                Trac Network
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
            <img src={tracLogo} alt="Trac" style={{ width: '14px', height: '14px', marginRight: '5px' }} />
            Trac Network
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

        {/* P2P network panel */}
        {p2pStats && (
          <div style={styles.p2pBar}>
            {/* Header row — always visible */}
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ color: '#34d399', fontWeight: 700, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <img src={tracLogo} alt="Trac" style={{ width: '13px', height: '13px' }} />
                Trac P2P Network
              </span>
              {/* live dot */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px',
                color: p2pStats.connected ? '#4ade80' : '#f87171' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%',
                  background: p2pStats.connected ? '#4ade80' : '#f87171', display: 'inline-block',
                  boxShadow: p2pStats.connected ? '0 0 4px #4ade80' : 'none' }} />
                {p2pStats.connected ? 'Connected' : 'Disconnected'}
              </span>
              <span style={{ color: '#4b5563', fontSize: '11px' }}>·</span>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{p2pStats.unique_nodes}</span> peers seen
              </span>
              <span style={{ color: '#4b5563', fontSize: '11px' }}>·</span>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>
                <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{p2pStats.p2p_results}</span> P2P results
              </span>
              {p2pStats.last_peer_ts && (
                <>
                  <span style={{ color: '#4b5563', fontSize: '11px' }}>·</span>
                  <span style={{ color: '#6b7280', fontSize: '11px' }}>
                    last activity: <span style={{ color: '#a78bfa' }}>{timeAgo(p2pStats.last_peer_ts)}</span>
                  </span>
                </>
              )}
              <span style={{ color: '#4b5563', fontSize: '11px' }}>·</span>
              <span style={{ color: '#6b7280', fontSize: '11px' }}>
                mode: <span style={{ color: p2pStats.mode === 'full_node' ? '#34d399' : '#60a5fa', fontWeight: 600 }}>
                  {p2pStats.mode === 'full_node' ? 'Full Node' : 'Peer'}
                </span>
              </span>
              <button
                onClick={() => setP2pOpen(o => !o)}
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none',
                  color: '#4b5563', fontSize: '11px', cursor: 'pointer', padding: '0 4px' }}
              >
                {p2pOpen ? '▲ hide' : '▼ details'}
              </button>
            </div>

            {/* Expanded details */}
            {p2pOpen && (
              <div style={{ width: '100%', marginTop: '10px', borderTop: '1px solid #065f46', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Our node ID */}
                {p2pStats.peer_id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#4b5563', fontSize: '11px', minWidth: '80px' }}>Your node</span>
                    <code style={{ color: '#34d399', fontSize: '11px', background: '#011a12',
                      padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                      {p2pStats.peer_id.slice(0, 20)}…{p2pStats.peer_id.slice(-8)}
                    </code>
                    <span style={{ color: '#374151', fontSize: '10px' }}>channel: {p2pStats.channel}</span>
                  </div>
                )}

                {/* Peer list */}
                {p2pStats.recent_peers.length > 0 ? (
                  <div>
                    <div style={{ color: '#4b5563', fontSize: '10px', fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Peers seen
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {p2pStats.recent_peers.map(peer => (
                        <div key={peer.node_id} style={{ display: 'flex', alignItems: 'center',
                          gap: '10px', fontSize: '11px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%',
                            background: '#34d399', flexShrink: 0 }} />
                          <code style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: '11px' }}>
                            {peer.node_id.slice(0, 16)}…{peer.node_id.slice(-6)}
                          </code>
                          <span style={{ color: '#374151' }}>
                            {peer.result_count} result{peer.result_count !== 1 ? 's' : ''}
                          </span>
                          <span style={{ color: '#374151', marginLeft: 'auto' }}>
                            {timeAgo(peer.last_seen)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#374151', fontSize: '11px', fontStyle: 'italic' }}>
                    No peer activity yet — results from other nodes will appear here once they scan tokens.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
            style={{ color: '#34d399', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <img src={tracLogo} alt="Trac" style={{ width: '12px', height: '12px' }} />
            Trac P2P Network
          </a>
          {' '}·{' '}
          <a
            href="https://github.com/onchaindude/trac-sentinel"
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

const disclaimerStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(4px)',
  },
  modal: {
    background: '#111827', border: '1px solid #1f2937',
    borderRadius: '16px', padding: '36px 32px', maxWidth: '420px',
    width: '90%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  },
  icon:     { fontSize: '40px', marginBottom: '12px' },
  title:    { fontSize: '22px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' },
  subtitle: { fontSize: '13px', color: '#6b7280', marginBottom: '20px' },
  body: {
    fontSize: '13px', color: '#9ca3af', lineHeight: 1.7,
    marginBottom: '14px', padding: '0 4px',
  },
  dyor: {
    fontSize: '13px', fontWeight: 700, color: '#fbbf24',
    marginBottom: '24px',
  },
  btn: {
    background: '#065f46', border: '1px solid #059669',
    borderRadius: '10px', color: '#34d399',
    fontSize: '14px', fontWeight: 700,
    padding: '12px 32px', cursor: 'pointer',
    fontFamily: 'inherit', width: '100%',
  },
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
