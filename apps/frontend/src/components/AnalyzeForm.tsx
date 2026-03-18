import { useState } from 'react';
import type { Chain } from '../hooks/useSentinel.js';

const CHAINS: Chain[] = ['eth', 'bsc', 'polygon', 'arbitrum', 'base', 'optimism', 'solana', 'tap'];

const CHAIN_LABELS: Record<Chain, string> = {
  eth:      'Ethereum',
  bsc:      'BNB Chain',
  polygon:  'Polygon',
  arbitrum: 'Arbitrum',
  base:     'Base',
  optimism: 'Optimism',
  solana:   'Solana',
  tap:      '₿ TAP Protocol',
};

const EVM_RE    = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TAP_RE    = /^[a-zA-Z0-9]{3,32}$/;

function validateAddress(address: string, chain: Chain): string | null {
  if (!address) return null;
  if (chain === 'solana') {
    return SOLANA_RE.test(address) ? null : 'Invalid Solana address (base58, 32–44 chars)';
  }
  if (chain === 'tap') {
    return TAP_RE.test(address) ? null : 'Invalid TAP ticker (3–32 alphanumeric characters, e.g. TRAC)';
  }
  return EVM_RE.test(address) ? null : 'Invalid EVM address (must be 0x + 40 hex characters)';
}

function parseBatch(raw: string, chain: Chain): { address: string; chain: Chain }[] {
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .filter(s => validateAddress(s, chain) === null)
    .map(address => ({ address, chain }));
}

interface Props {
  onAnalyze:     (address: string, chain: Chain) => Promise<string | null>;
  onBatch:       (items: { address: string; chain: Chain }[]) => Promise<void>;
  analyzing:     boolean;
  stepLabel?:    string;
  batchProgress?: { current: number; total: number; label: string } | null;
}

export function AnalyzeForm({ onAnalyze, onBatch, analyzing, stepLabel, batchProgress }: Props) {
  const [address, setAddress]   = useState('');
  const [chain, setChain]       = useState<Chain>('eth');
  const [touched, setTouched]   = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [batchMode, setBatch]   = useState(false);
  const [batchText, setBatchText] = useState('');

  const validationError = touched ? validateAddress(address.trim(), chain) : null;
  const valid  = !validateAddress(address.trim(), chain);
  const error  = validationError ?? apiError;

  const batchItems  = parseBatch(batchText, chain);
  const batchValid  = batchItems.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (batchMode) {
      if (!batchValid) return;
      await onBatch(batchItems);
    } else {
      setTouched(true);
      if (!address.trim() || !valid) return;
      const err = await onAnalyze(address.trim(), chain);
      if (err) setApiError(err);
    }
  };

  const btnLabel = () => {
    if (batchProgress) return `Queuing ${batchProgress.current}/${batchProgress.total} — ${batchProgress.label}`;
    if (analyzing && stepLabel) return stepLabel;
    if (analyzing) return '⟳ Starting…';
    if (batchMode) return batchValid ? `🔍 Scan ${batchItems.length} token${batchItems.length !== 1 ? 's' : ''}` : 'Paste addresses above';
    return '🔍 Scan Token';
  };

  const stepNum = stepLabel ? parseInt(stepLabel) : 0;

  return (
    <form onSubmit={submit} style={styles.form}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div /> {/* spacer */}
        <button
          type="button"
          onClick={() => { setBatch(b => !b); setApiError(null); }}
          style={styles.modeToggle}
          disabled={analyzing}
        >
          {batchMode ? '← Single scan' : '⊞ Batch scan'}
        </button>
      </div>

      {batchMode ? (
        <div>
          <textarea
            style={styles.textarea}
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
            placeholder={'Paste addresses — one per line or comma separated:\n0x6982508145454ce325ddbe47a25d4ec3d231\n0xabcd...'}
            rows={5}
            disabled={analyzing}
            spellCheck={false}
          />
          {batchText && (
            <div style={{ fontSize: '11px', color: batchValid ? '#4ade80' : '#6b7280', margin: '4px 0 6px' }}>
              {batchValid
                ? `${batchItems.length} valid address${batchItems.length !== 1 ? 'es' : ''} found`
                : 'No valid addresses found — check format'}
            </div>
          )}
        </div>
      ) : (
        <div className="form-row" style={styles.row}>
          <input
            style={{ ...styles.input, borderColor: error ? '#ef4444' : '#374151' }}
            value={address}
            onChange={e => { setAddress(e.target.value); setTouched(true); setApiError(null); }}
            onBlur={() => setTouched(true)}
            placeholder={chain === 'tap' ? 'TAP ticker (e.g. TRAC, NAT, KARMA)' : 'Token contract address (0x… or Solana mint)'}
            spellCheck={false}
            disabled={analyzing}
            autoComplete="off"
          />
          <select
            style={styles.select}
            value={chain}
            onChange={e => { setChain(e.target.value as Chain); setTouched(!!address); }}
            disabled={analyzing}
          >
            {CHAINS.map(c => (
              <option key={c} value={c}>{CHAIN_LABELS[c]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Chain selector for batch mode */}
      {batchMode && (
        <div style={{ marginBottom: '8px' }}>
          <select
            style={{ ...styles.select, width: '100%' }}
            value={chain}
            onChange={e => setChain(e.target.value as Chain)}
            disabled={analyzing}
          >
            {CHAINS.map(c => (
              <option key={c} value={c}>{CHAIN_LABELS[c]}</option>
            ))}
          </select>
        </div>
      )}

      <button
        style={{ ...styles.btn, marginTop: batchMode ? '0' : '8px', opacity: (analyzing || (batchMode ? !batchValid : (!address.trim() || !valid))) ? 0.6 : 1 }}
        type="submit"
        disabled={analyzing || (batchMode ? !batchValid : (!address.trim() || !valid))}
      >
        {btnLabel()}
      </button>

      {analyzing && stepLabel && (
        <div style={styles.progress}>
          <div style={{ ...styles.progressBar, width: `${(stepNum / 7) * 100}%` }} />
        </div>
      )}
      {!batchMode && error && <p style={styles.error}>{error}</p>}
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form:  { width: '100%' },
  row: {
    display: 'flex', gap: '8px', alignItems: 'stretch',
  },
  modeToggle: {
    background: 'transparent', border: '1px solid #374151',
    borderRadius: '6px', color: '#6b7280', fontSize: '11px',
    padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
  },
  input: {
    flex:         1,
    padding:      '10px 14px',
    background:   '#111827',
    border:       '1px solid #374151',
    borderRadius: '8px',
    color:        '#e2e8f0',
    fontSize:     '14px',
    fontFamily:   'inherit',
    outline:      'none',
  },
  textarea: {
    width:        '100%',
    padding:      '10px 14px',
    background:   '#111827',
    border:       '1px solid #374151',
    borderRadius: '8px',
    color:        '#e2e8f0',
    fontSize:     '13px',
    fontFamily:   'monospace',
    outline:      'none',
    resize:       'vertical',
    marginBottom: '4px',
  },
  select: {
    padding:      '10px 12px',
    background:   '#111827',
    border:       '1px solid #374151',
    borderRadius: '8px',
    color:        '#e2e8f0',
    fontSize:     '14px',
    fontFamily:   'inherit',
    cursor:       'pointer',
    outline:      'none',
  },
  btn: {
    width:        '100%',
    padding:      '10px 20px',
    background:   '#6366f1',
    border:       'none',
    borderRadius: '8px',
    color:        '#fff',
    fontSize:     '14px',
    fontFamily:   'inherit',
    fontWeight:   600,
    cursor:       'pointer',
    whiteSpace:   'nowrap',
  },
  progress: {
    height: '2px', background: '#1f2937', borderRadius: '2px',
    marginTop: '8px', overflow: 'hidden',
  },
  progressBar: {
    height: '100%', background: '#6366f1', borderRadius: '2px',
    transition: 'width 0.4s ease',
  },
  error: {
    margin: '6px 0 0', color: '#ef4444', fontSize: '12px',
  },
};
