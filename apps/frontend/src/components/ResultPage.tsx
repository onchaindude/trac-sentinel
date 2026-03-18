import { useEffect, useState } from 'react';
import type { AnalysisResult } from '../hooks/useSentinel.js';
import { ResultCard } from './ResultCard.js';

export function ResultPage({ id }: { id: string }) {
  const [result, setResult]   = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/results/${encodeURIComponent(id)}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Result not found' : 'Failed to load');
        return r.json() as Promise<AnalysisResult>;
      })
      .then(data => { setResult(data); setLoading(false); })
      .catch(e  => { setError(String(e.message)); setLoading(false); });
  }, [id]);

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <a href="/" style={styles.logo}>
          <span>🛡</span>
          <span style={styles.logoText}>TracSentinel</span>
        </a>
        <a href="/" style={styles.back}>← New scan</a>
      </header>
      <main style={styles.main}>
        {loading && <div style={styles.msg}>Loading result…</div>}
        {error   && <div style={{ ...styles.msg, color: '#ef4444' }}>{error}</div>}
        {result  && <ResultCard result={result} />}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 24px', borderBottom: '1px solid #1f2937', background: '#0d1117',
  },
  logo: {
    display: 'flex', gap: '10px', alignItems: 'center',
    textDecoration: 'none', color: '#e2e8f0',
  },
  logoText: { fontSize: '18px', fontWeight: 700 },
  back: { fontSize: '13px', color: '#6b7280', textDecoration: 'none' },
  main: { flex: 1, padding: '24px', maxWidth: '860px', margin: '0 auto', width: '100%' },
  msg:  { color: '#9ca3af', textAlign: 'center', padding: '60px 0' },
};
