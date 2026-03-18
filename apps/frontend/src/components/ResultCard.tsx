import { useState, useEffect } from 'react';
import type { AnalysisResult } from '../hooks/useSentinel.js';
import { RiskBadge } from './RiskBadge.js';
import { StepTracker } from './StepTracker.js';

interface Props {
  result:         AnalysisResult;
  isPinned?:      boolean;
  onPin?:         () => void;
  onUnpin?:       () => void;
  onScanAnother?: () => void;
}

const CHAIN_LABEL: Record<string, string> = {
  eth: 'ETH', bsc: 'BNB', polygon: 'MATIC',
  arbitrum: 'ARB', base: 'BASE', optimism: 'OP', solana: 'SOL', tap: '₿ TAP',
};

function shortAddr(addr: string) {
  return addr.length > 20 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

const SOURCE_LABEL: Record<string, { label: string; color: string; title: string }> = {
  live:  { label: '⚡ Live Scan',  color: '#60a5fa', title: 'Fresh scan from APIs'               },
  cache: { label: '💾 Cached',     color: '#a78bfa', title: 'Served from local cache'            },
  p2p:   { label: '🌐 Trac P2P',   color: '#34d399', title: 'Result shared via Trac P2P Network' },
};

const RISK_COLORS: Record<string, { border: string; accent: string; icon: string }> = {
  SAFE:    { border: '#166534', accent: '#4ade80', icon: '✓'  },
  CAUTION: { border: '#78350f', accent: '#fbbf24', icon: '⚠'  },
  DANGER:  { border: '#7c2d12', accent: '#f97316', icon: '⚡' },
  RUG:     { border: '#7f1d1d', accent: '#ef4444', icon: '☠'  },
};

// Safe formatter — handles null, undefined, and NaN without crashing
function fmt(n: unknown, dec = 1): string {
  const num = Number(n);
  return (n === null || n === undefined || isNaN(num)) ? '?' : num.toFixed(dec);
}

// Compact formatter for very large numbers (TAP supplies can be astronomical).
// Uses string-length analysis to avoid float precision loss at >10^15.
function fmtBig(n: string | number): string {
  const s = String(n).replace(/[^0-9]/g, '');
  if (!s || s === '0') return '0';
  const len = s.length;
  // head(keep): use first `keep` digits as integer, next 2 as decimals
  const head = (keep: number) => {
    const i = s.slice(0, keep) || '0';
    const d = s.slice(keep, keep + 2).padEnd(2, '0');
    return `${i}.${d}`;
  };
  if (len >= 25) return `${head(len - 24)} Sep`;  // Septillion  (10^24)
  if (len >= 22) return `${head(len - 21)} Sxt`;  // Sextillion  (10^21)
  if (len >= 19) return `${head(len - 18)} Qi`;   // Quintillion (10^18)
  if (len >= 16) return `${head(len - 15)} Qa`;   // Quadrillion (10^15)
  if (len >= 13) return `${head(len - 12)} T`;    // Trillion    (10^12)
  if (len >= 10) return `${head(len - 9)}  B`;    // Billion     (10^9)
  if (len >= 7)  return `${head(len - 6)}  M`;    // Million     (10^6)
  if (len >= 4)  return `${head(len - 3)}  K`;    // Thousand    (10^3)
  return Number(s).toLocaleString();
}

function RawRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '2px 0', borderBottom: '1px solid #1f2937', fontSize: '11px' }}>
      <span style={{ color: '#6b7280', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontFamily: mono ? 'monospace' : 'inherit',
        textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

// ── Security check row ─────────────────────────────────────────────────────
type CheckStatus = 'ok' | 'warn' | 'danger';

interface SecurityCheck {
  status:  CheckStatus;
  label:   string;
  value:   string;
  explain: string;
}

const CHECK_COLOR: Record<CheckStatus, string> = {
  ok:     '#4ade80',
  warn:   '#fbbf24',
  danger: '#ef4444',
};
const CHECK_ICON: Record<CheckStatus, string> = { ok: '✓', warn: '⚠', danger: '✗' };

function CheckRow({ check }: { check: SecurityCheck }) {
  const color = CHECK_COLOR[check.status];
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '6px 0',
      borderBottom: '1px solid #1f2937', alignItems: 'flex-start' }}>
      <span style={{ color, fontWeight: 700, fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>
        {CHECK_ICON[check.status]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 600 }}>{check.label}</span>
          <span style={{ color, fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>{check.value}</span>
        </div>
        {check.status !== 'ok' && (
          <div style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px', lineHeight: 1.4 }}>
            {check.explain}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Holder concentration bar ───────────────────────────────────────────────
function HolderBar({ top10Pct, holderCount }: { top10Pct: number; holderCount: number }) {
  const rest = Math.max(0, 100 - top10Pct);
  const barColor = top10Pct > 80 ? '#ef4444' : top10Pct > 50 ? '#fbbf24' : '#4ade80';
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#6b7280', fontSize: '11px' }}>Holder concentration</span>
        <span style={{ color: '#9ca3af', fontSize: '11px' }}>
          {holderCount.toLocaleString()} holders
        </span>
      </div>
      <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', gap: '1px' }}>
        <div style={{ width: `${top10Pct}%`, background: barColor, borderRadius: '5px 0 0 5px',
          transition: 'width 0.5s ease', minWidth: top10Pct > 0 ? '4px' : 0 }} />
        <div style={{ flex: 1, background: '#1f2937', borderRadius: '0 5px 5px 0' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span style={{ color: barColor, fontSize: '10px', fontWeight: 700 }}>
          Top 10 wallets: {top10Pct.toFixed(1)}%
        </span>
        <span style={{ color: '#4b5563', fontSize: '10px' }}>Others: {rest.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ── Build security checks from GoPlus data ─────────────────────────────────
function buildChecks(goplus: AnalysisResult['goplus']): SecurityCheck[] {
  if (!goplus) return [];
  const checks: SecurityCheck[] = [];

  // Honeypot
  checks.push(goplus.is_honeypot
    ? { status: 'danger', label: 'Honeypot', value: 'DETECTED',
        explain: 'You cannot sell this token. The contract traps your money — avoid buying.' }
    : { status: 'ok', label: 'No Honeypot', value: 'Safe', explain: '' });

  // Sell tax (most critical for traders)
  const sell = Number(goplus.sell_tax ?? 0);
  checks.push(sell > 10
    ? { status: 'danger', label: 'Sell Tax', value: `${sell.toFixed(1)}%`,
        explain: `You lose ${sell.toFixed(1)}% every time you sell. Above 10% is a major red flag — can be used to trap holders.` }
    : sell > 5
    ? { status: 'warn', label: 'Sell Tax', value: `${sell.toFixed(1)}%`,
        explain: `Elevated sell tax. Above 5% cuts your gains significantly on every sale.` }
    : { status: 'ok', label: 'Sell Tax', value: `${sell.toFixed(1)}%`, explain: '' });

  // Buy tax
  const buy = Number(goplus.buy_tax ?? 0);
  checks.push(buy > 10
    ? { status: 'danger', label: 'Buy Tax', value: `${buy.toFixed(1)}%`,
        explain: `You pay ${buy.toFixed(1)}% on every purchase — your balance starts in the red.` }
    : buy > 5
    ? { status: 'warn', label: 'Buy Tax', value: `${buy.toFixed(1)}%`,
        explain: `Above-average buy tax. Compare to similar tokens before buying.` }
    : { status: 'ok', label: 'Buy Tax', value: `${buy.toFixed(1)}%`, explain: '' });

  // Ownership renounced
  checks.push(goplus.is_renounced
    ? { status: 'ok', label: 'Ownership Renounced', value: 'Yes', explain: '' }
    : { status: 'warn', label: 'Ownership Not Renounced', value: 'Dev has control',
        explain: 'The developer still controls key contract functions and could change rules at any time.' });

  // Mintable
  checks.push(goplus.is_mintable
    ? { status: 'warn', label: 'Mintable Supply', value: 'Unlimited',
        explain: 'The developer can create new tokens at any time, diluting your holdings and crashing the price.' }
    : { status: 'ok', label: 'Fixed Supply', value: 'Yes', explain: '' });

  // Open source
  checks.push(goplus.is_open_source
    ? { status: 'ok', label: 'Open Source', value: 'Verified', explain: '' }
    : { status: 'warn', label: 'Closed Source', value: 'Unverified',
        explain: 'The contract code is hidden. You cannot independently verify what it does.' });

  // LP lock
  const lp = Number(goplus.lp_locked_percent ?? 0);
  checks.push(lp >= 80
    ? { status: 'ok', label: 'Liquidity Locked', value: `${lp.toFixed(0)}%`, explain: '' }
    : lp >= 20
    ? { status: 'warn', label: 'Partial LP Lock', value: `${lp.toFixed(0)}%`,
        explain: `Only ${lp.toFixed(0)}% of liquidity is locked. The developer could drain the unlocked portion.` }
    : { status: 'danger', label: 'LP Unlocked', value: lp > 0 ? `${lp.toFixed(0)}%` : 'None',
        explain: 'Liquidity is not locked. The developer can remove all funds from the pool at any time — classic rug pull setup.' });

  // Owner % (team holdings)
  const ownerPct = Number(goplus.owner_percent ?? 0);
  if (ownerPct > 0) {
    checks.push(ownerPct > 20
      ? { status: 'danger', label: 'Dev Holdings', value: `${ownerPct.toFixed(1)}%`,
          explain: `The developer holds ${ownerPct.toFixed(1)}% of supply. A large sell would crash the price.` }
      : ownerPct > 5
      ? { status: 'warn', label: 'Dev Holdings', value: `${ownerPct.toFixed(1)}%`,
          explain: 'Elevated developer holdings — monitor for sell activity on the deployer wallet.' }
      : { status: 'ok', label: 'Dev Holdings', value: `${ownerPct.toFixed(1)}%`, explain: '' });
  }

  // LP lock countdown
  const expiry = goplus.lp_lock_expiry_ts;
  if (expiry && expiry > 0) {
    const msLeft   = expiry * 1000 - Date.now();
    const daysLeft = msLeft / (1000 * 86400);
    if (msLeft < 0) {
      checks.push({ status: 'danger', label: 'LP Lock Expired', value: 'Unlocked',
        explain: 'The LP liquidity lock has expired. The developer can now remove all liquidity at any time.' });
    } else if (daysLeft < 7) {
      const h = Math.floor((msLeft % 86400000) / 3600000);
      checks.push({ status: 'danger', label: 'LP Unlocks Soon', value: `${Math.floor(daysLeft)}d ${h}h`,
        explain: `Liquidity lock expires in ${Math.floor(daysLeft)} days. High risk of liquidity pull once it expires.` });
    } else if (daysLeft < 30) {
      checks.push({ status: 'warn', label: 'LP Lock Countdown', value: `${Math.floor(daysLeft)} days`,
        explain: `LP lock expires in ${Math.floor(daysLeft)} days — monitor closely as the date approaches.` });
    } else {
      checks.push({ status: 'ok', label: 'LP Locked', value: `${Math.floor(daysLeft)} days left`, explain: '' });
    }
  }

  // Proxy contract
  if (goplus.is_proxy) {
    checks.push({ status: 'warn', label: 'Upgradeable Proxy', value: 'Yes',
      explain: 'The contract logic can be swapped out. The developer could silently replace it with malicious code.' });
  }

  // Blacklist function
  if (goplus.is_blacklisted) {
    checks.push({ status: 'warn', label: 'Blacklist Function', value: 'Present',
      explain: 'The contract can blacklist wallets, preventing them from buying or selling. Devs could target any holder.' });
  }

  // Can take back ownership
  if (goplus.can_take_back_ownership) {
    checks.push({ status: 'danger', label: 'Ownership Reclaimable', value: 'Yes',
      explain: 'Even though ownership appears renounced, the developer can reclaim it. Renouncement is not permanent.' });
  }

  // Transfer pausable
  if (goplus.transfer_pausable) {
    checks.push({ status: 'warn', label: 'Transfers Pausable', value: 'Yes',
      explain: 'The developer can pause all token transfers at any time, trapping holders.' });
  }

  // Trading cooldown
  if (goplus.trading_cooldown) {
    checks.push({ status: 'warn', label: 'Trading Cooldown', value: 'Active',
      explain: 'There is a cooldown between trades, which may indicate anti-bot measures or restrict normal selling.' });
  }

  return checks;
}

function ScoreBar({ score }: { score: number }) {
  const color = score < 26 ? '#4ade80' : score < 51 ? '#fbbf24' : score < 76 ? '#f97316' : '#ef4444';
  return (
    <div style={{ width: '100%', background: '#1f2937', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
      <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '4px',
        transition: 'width 0.5s ease' }} />
    </div>
  );
}

function Skeleton({ w = '100%', h = 14 }: { w?: string | number; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, marginBottom: 6 }} />;
}

// Canvas-based shareable image — no external deps
function exportAsImage(result: AnalysisResult) {
  const RISK_BG:   Record<string, string> = { SAFE: '#052e16', CAUTION: '#1c1917', DANGER: '#1c0a02', RUG: '#1c0a0a' };
  const RISK_FG:   Record<string, string> = { SAFE: '#4ade80', CAUTION: '#fbbf24', DANGER: '#f97316', RUG: '#ef4444' };
  const RISK_ICON: Record<string, string> = { SAFE: '✓',       CAUTION: '⚠',       DANGER: '⚡',      RUG: '☠' };

  const W = 600, H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d')!;

  const level  = result.verdict?.risk_level ?? 'SAFE';
  const accent = RISK_FG[level]  ?? '#4ade80';
  const score  = result.verdict?.risk_score ?? 0;

  // Background
  c.fillStyle = '#111827'; c.fillRect(0, 0, W, H);
  // Top accent bar
  c.fillStyle = accent; c.fillRect(0, 0, W, 4);
  // Header band
  c.fillStyle = '#0d1117'; c.fillRect(0, 4, W, 60);

  // Token name
  c.fillStyle = '#e2e8f0'; c.font = 'bold 22px system-ui';
  c.fillText(`${result.name || '?'} (${result.symbol || '?'})`, 20, 42);

  // Risk badge
  const badge = `${RISK_ICON[level]} ${level}  ${score}/100`;
  c.font = 'bold 15px system-ui';
  const bw = c.measureText(badge).width + 24;
  c.fillStyle = RISK_BG[level] ?? '#052e16';
  c.beginPath(); c.roundRect(W - bw - 16, 18, bw, 30, 999); c.fill();
  c.fillStyle = accent; c.fillText(badge, W - bw - 4, 38);

  // Score bar background
  c.fillStyle = '#1f2937'; c.beginPath(); c.roundRect(20, 82, W - 40, 10, 5); c.fill();
  // Score bar fill
  c.fillStyle = accent; c.beginPath(); c.roundRect(20, 82, Math.round((W - 40) * score / 100), 10, 5); c.fill();

  // AI summary
  c.fillStyle = '#9ca3af'; c.font = '13px system-ui';
  const summary = result.verdict?.summary ?? '';
  // Wrap text at 560px
  const words = summary.split(' '); let line = ''; let y = 118;
  for (const word of words) {
    const test = line + word + ' ';
    if (c.measureText(test).width > 560 && line) { c.fillText(line, 20, y); line = word + ' '; y += 20; }
    else line = test;
  }
  if (line) c.fillText(line.trim(), 20, y); y += 24;

  // Red flags
  c.fillStyle = '#f87171'; c.font = 'bold 12px system-ui';
  c.fillText('RED FLAGS', 20, y); y += 18;
  c.fillStyle = '#fca5a5'; c.font = '12px system-ui';
  for (const f of (result.verdict?.red_flags ?? []).slice(0, 3)) {
    c.fillText(`✗ ${f}`, 20, y); y += 17;
  }
  y += 4;

  // Green flags
  if ((result.verdict?.green_flags.length ?? 0) > 0) {
    c.fillStyle = '#4ade80'; c.font = 'bold 12px system-ui';
    c.fillText('GREEN FLAGS', 20, y); y += 18;
    c.fillStyle = '#86efac'; c.font = '12px system-ui';
    for (const f of (result.verdict?.green_flags ?? []).slice(0, 2)) {
      c.fillText(`✓ ${f}`, 20, y); y += 17;
    }
  }

  // Footer
  c.fillStyle = '#374151'; c.fillRect(0, H - 36, W, 36);
  c.fillStyle = '#34d399'; c.font = 'bold 12px system-ui';
  c.fillText('🌐 TracSentinel · Powered by @TracNetwork P2P', 20, H - 14);
  c.fillStyle = '#4b5563'; c.font = '11px system-ui';
  c.fillText(new Date(result.ts).toLocaleString(), W - 160, H - 14);

  const link = document.createElement('a');
  link.download = `${result.symbol || 'scan'}-${level.toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── TAP Protocol dedicated panel ───────────────────────────────────────────────
function TapPanel({ tap }: { tap: NonNullable<AnalysisResult['tap_scan']> }) {
  const mintColor = tap.fullyMinted ? '#4ade80' : tap.mintProgressPct > 80 ? '#fbbf24' : '#60a5fa';
  const concColor = tap.top10HolderPct > 80 ? '#ef4444' : tap.top10HolderPct > 50 ? '#fbbf24' : '#4ade80';
  const authColor = tap.tokenAuthCoversAll ? '#ef4444' : tap.hasTokenAuth ? '#fbbf24' : '#4ade80';
  const deployDate = tap.deployedAt > 0
    ? new Date(tap.deployedAt * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '?';

  // Token is "established" if deployed more than 24h ago
  const ageHours = tap.deployedAt > 0 ? (Date.now() / 1000 - tap.deployedAt) / 3600 : 0;
  const isEstablished = ageHours > 24;

  // When tap-reader hasn't synced a chunk yet, these come back as 0.
  // Show "Syncing…" so users know it's a P2P lag — not a real zero.
  const holderDisplay = (tap.holderCount === 0 && isEstablished) ? 'Syncing…' : tap.holderCount.toLocaleString();
  const tradeDisplay  = (tap.tradeCount === 0  && isEstablished) ? 'Syncing…' : tap.tradeCount.toLocaleString();
  const concDisplay   = (tap.top10HolderPct === 0 && isEstablished) ? 'Syncing…' : `${tap.top10HolderPct.toFixed(1)}%`;
  const concColor2    = (tap.top10HolderPct === 0 && isEstablished) ? '#6b7280' : concColor;

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase' }}>₿ TAP Protocol Analysis</div>
        <div style={{ background: '#1c1400', border: '1px solid #78350f',
          borderRadius: '4px', color: '#f59e0b', fontSize: '10px',
          fontWeight: 700, padding: '1px 6px' }}>Bitcoin Ordinals</div>
      </div>

      {/* Sync notice — shown when tap-reader hasn't downloaded this token's data yet */}
      {isEstablished && tap.holderCount === 0 && (
        <div style={{ background: '#0d1117', border: '1px solid #374151', borderRadius: '6px',
          padding: '7px 10px', marginBottom: '10px', fontSize: '11px', color: '#6b7280',
          display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#f59e0b' }}>⟳</span>
          Holder &amp; trade data is syncing via P2P — the TAP Reader node is still downloading this token's index chunks. Check back in a few minutes.
        </div>
      )}

      {/* Mint progress */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#6b7280', fontSize: '11px' }}>Mint progress</span>
          <span style={{ color: mintColor, fontSize: '11px', fontWeight: 700 }}>
            {tap.fullyMinted ? 'Fully Minted ✓' : `${tap.mintProgressPct.toFixed(1)}% minted`}
          </span>
        </div>
        <div style={{ height: '6px', background: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, tap.mintProgressPct)}%`, height: '100%',
            background: mintColor, borderRadius: '3px', transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ color: '#4b5563', fontSize: '10px', marginTop: '3px' }}>
          Max supply: {fmtBig(tap.maxSupply)} · Mint limit: {fmtBig(tap.mintLimit)} per mint
        </div>
      </div>

      {/* Key stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
        {[
          { label: 'Holder count',    value: holderDisplay,                              color: tap.holderCount === 0 && isEstablished ? '#6b7280' : '#e2e8f0' },
          { label: 'Trades (TAP)',    value: tradeDisplay,                               color: tap.tradeCount === 0  && isEstablished ? '#6b7280' : '#e2e8f0' },
          { label: 'Deploy date',     value: deployDate,                                 color: '#e2e8f0' },
          { label: 'Deploy block',    value: `#${tap.deployBlock.toLocaleString()}`,     color: '#e2e8f0' },
          { label: 'Deployer holds',  value: `${tap.deployerHoldsPct.toFixed(2)}%`,      color: tap.deployerHoldsPct > 10 ? '#f97316' : '#4ade80' },
          { label: 'Top 10 holders', value: concDisplay,                                 color: concColor2 },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#0d1117', borderRadius: '6px', padding: '6px 10px' }}>
            <div style={{ color: '#6b7280', fontSize: '10px', marginBottom: '2px' }}>{label}</div>
            <div style={{ color, fontSize: '12px', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Token-auth status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px',
        background: '#0d1117', borderRadius: '6px', marginBottom: '10px',
        border: `1px solid ${tap.tokenAuthCoversAll ? '#7f1d1d' : tap.hasTokenAuth ? '#78350f' : '#1f2937'}` }}>
        <span style={{ color: authColor, fontSize: '13px', fontWeight: 700 }}>
          {tap.tokenAuthCoversAll ? '✗' : tap.hasTokenAuth ? '⚠' : '✓'}
        </span>
        <div>
          <div style={{ color: '#e2e8f0', fontSize: '11px', fontWeight: 600 }}>Token-Auth Authority</div>
          <div style={{ color: '#6b7280', fontSize: '10px' }}>
            {tap.tokenAuthCoversAll
              ? 'Deployer controls ALL TAP tickers — can issue redemptions for any token'
              : tap.hasTokenAuth
              ? `${tap.tokenAuthCount} auth inscription(s) — deployer can issue signed redemptions`
              : 'No authority set — deployer cannot issue special redemptions'}
          </div>
        </div>
      </div>

      {/* Top holders */}
      {tap.topHolders.length > 0 && (
        <div>
          <div style={{ color: '#6b7280', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '5px' }}>
            Top {tap.topHolders.length} Holders
          </div>
          {tap.topHolders.slice(0, 5).map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px',
              padding: '3px 0', borderBottom: i < 4 ? '1px solid #1f2937' : 'none' }}>
              <span style={{ color: '#4b5563', fontSize: '10px', width: '14px', flexShrink: 0 }}>
                #{i + 1}
              </span>
              <div style={{ flex: 1, height: '4px', background: '#1f2937', borderRadius: '2px' }}>
                <div style={{ width: `${Math.min(100, h.pct * 2)}%`, height: '100%',
                  background: concColor, borderRadius: '2px' }} />
              </div>
              <span style={{ color: concColor, fontSize: '10px', fontWeight: 700, width: '38px', textAlign: 'right', flexShrink: 0 }}>
                {h.pct.toFixed(1)}%
              </span>
              <span style={{ color: '#4b5563', fontSize: '10px', fontFamily: 'monospace', flexShrink: 0 }}>
                {h.address.slice(0, 8)}…
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Inscription ID */}
      {tap.inscriptionId && (
        <div style={{ marginTop: '8px', fontSize: '10px', color: '#4b5563' }}>
          Inscription: <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>
            {tap.inscriptionId.slice(0, 20)}…
          </span>
        </div>
      )}
    </div>
  );
}

// ── Risk score history mini-chart ──────────────────────────────────────────────
interface HistoryPoint { ts: number; risk_level: string; risk_score: number; }

const LEVEL_COLOR: Record<string, string> = {
  SAFE: '#4ade80', CAUTION: '#fbbf24', DANGER: '#f97316', RUG: '#ef4444',
};

function ScoreHistory({ address, chain }: { address: string; chain: string }) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    fetch(`/api/results/${chain}/${encodeURIComponent(address)}/history`)
      .then(r => r.json())
      .then((data: HistoryPoint[]) => { if (data.length > 1) setHistory(data); })
      .catch(() => {});
  }, [address, chain]);

  if (history.length < 2) return null;

  const max = 100;
  const barW = Math.min(32, Math.floor(280 / history.length));

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', marginBottom: '6px' }}>
        Risk History ({history.length} scans)
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px' }}>
        {history.map((h, i) => {
          const color = LEVEL_COLOR[h.risk_level] ?? '#6b7280';
          const heightPct = Math.max(10, (h.risk_score / max) * 100);
          const date = new Date(h.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <div key={i} title={`${date}: ${h.risk_level} ${h.risk_score}/100`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1 }}>
              <div style={{ width: '100%', maxWidth: `${barW}px`, height: `${heightPct}%`,
                background: color, borderRadius: '2px 2px 0 0', opacity: i === history.length - 1 ? 1 : 0.55,
                transition: 'height 0.4s ease' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ color: '#4b5563', fontSize: '10px' }}>
          {new Date(history[0]!.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
        <span style={{ color: '#6b7280', fontSize: '10px' }}>
          {history[history.length - 1]!.risk_level} · {history[history.length - 1]!.risk_score}/100 (latest)
        </span>
      </div>
    </div>
  );
}

// ── Deployer reputation ────────────────────────────────────────────────────────
interface DeployerToken {
  address: string; chain: string; name: string | null; symbol: string | null;
  risk_level: string | null; risk_score: number | null; ts: number;
}

function DeployerHistory({ creatorAddress, currentAddress }: {
  creatorAddress: string;
  currentAddress: string;
}) {
  const [tokens, setTokens] = useState<DeployerToken[]>([]);

  useEffect(() => {
    fetch(`/api/creator/${encodeURIComponent(creatorAddress)}`)
      .then(r => r.json())
      .then((data: DeployerToken[]) => {
        const others = data.filter(t => t.address !== currentAddress);
        if (others.length > 0) setTokens(others.slice(0, 5));
      })
      .catch(() => {});
  }, [creatorAddress, currentAddress]);

  if (tokens.length === 0) return null;

  const rugCount = tokens.filter(t => t.risk_level === 'RUG').length;
  const dangerCount = tokens.filter(t => t.risk_level === 'DANGER').length;
  const headerColor = rugCount > 0 ? '#ef4444' : dangerCount > 0 ? '#f97316' : '#6b7280';

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ color: headerColor, fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
        Deployer History
        {rugCount > 0 && <span style={{ color: '#ef4444', marginLeft: '6px' }}>⚠ {rugCount} previous rug{rugCount > 1 ? 's' : ''}</span>}
      </div>
      {tokens.map((t, i) => {
        const color = LEVEL_COLOR[t.risk_level ?? ''] ?? '#4b5563';
        const CHAIN_LABEL: Record<string, string> = { eth: 'ETH', bsc: 'BNB', polygon: 'MATIC', arbitrum: 'ARB', base: 'BASE', optimism: 'OP', solana: 'SOL' };
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 0', borderBottom: i < tokens.length - 1 ? '1px solid #1f2937' : 'none',
            fontSize: '12px' }}>
            <span style={{ background: '#1f2937', color: '#60a5fa', padding: '1px 5px',
              borderRadius: '3px', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
              {CHAIN_LABEL[t.chain] ?? t.chain}
            </span>
            <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.name || t.symbol || `${t.address.slice(0, 8)}…`}
              {t.symbol && t.name && <span style={{ color: '#6b7280', marginLeft: '4px' }}>{t.symbol}</span>}
            </span>
            {t.risk_level && (
              <span style={{ color, fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>
                {t.risk_level} {t.risk_score != null ? `${t.risk_score}/100` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ResultCard({ result, isPinned, onPin, onUnpin, onScanAnother }: Props) {
  const { verdict, steps, status } = result;
  const isAnalyzing = status === 'analyzing';
  const [copied, setCopied]       = useState(false);
  const [flagged, setFlagged]     = useState(false);
  const [flagCount, setFlagCount] = useState(() => {
    // Persist flag count in localStorage so it survives refresh
    const key = `flag:${result.chain}:${result.address}`;
    return parseInt(localStorage.getItem(key) ?? '0', 10);
  });

  const risk   = verdict ? RISK_COLORS[verdict.risk_level] : null;
  const symbol = result.symbol || result.name?.slice(0, 4) || '?';
  const imgUrl = result.coingecko?.image ?? null;

  const copyLink = () => {
    const url = `${window.location.origin}/result/${encodeURIComponent(result.id)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const flagAsScam = () => {
    if (flagged) return;
    const key   = `flag:${result.chain}:${result.address}`;
    const next  = flagCount + 1;
    localStorage.setItem(key, String(next));
    setFlagCount(next);
    setFlagged(true);
  };

  const shareOnX = () => {
    if (!verdict) return;
    const icon = risk?.icon ?? '';
    const text = `Just scanned $${symbol} on #TracSentinel — ${verdict.risk_level} ${icon} (score ${verdict.risk_score}/100)\nPowered by @TracNetwork P2P\n\ngithub.com/your-username/trac-sentinel`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div style={{
      ...styles.card,
      border:    `1px solid ${risk?.border ?? '#1f2937'}`,
      borderTop: `3px solid ${risk?.border ?? '#1f2937'}`,
    }}>
      {/* Header */}
      <div style={styles.header}>
        {/* Token avatar */}
        <div style={styles.avatar}>
          {imgUrl ? (
            <img src={imgUrl} alt={symbol} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '16px', fontWeight: 700, color: risk?.accent ?? '#6b7280' }}>
              {symbol.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div style={styles.tokenInfo}>
          <div style={styles.tokenName}>
            {result.name || '?'} <span style={{ color: '#6b7280' }}>{result.symbol || ''}</span>
          </div>
          <div style={styles.meta}>
            <span style={styles.chain}>{CHAIN_LABEL[result.chain] ?? result.chain}</span>
            <span style={styles.addr}>{shortAddr(result.address)}</span>
            <span style={{ color: '#4b5563', fontSize: '11px' }}>
              {new Date(result.ts).toLocaleTimeString()}
            </span>
            {result.source && (() => {
              const s = SOURCE_LABEL[result.source];
              if (!s) return null;
              const nodeHint = result.source === 'p2p' && result.node_id
                ? ` · node ${result.node_id.slice(0, 12)}…`
                : '';
              return (
                <span style={{ color: s.color, fontSize: '11px', fontWeight: 600 }}
                  title={result.node_id ? `${s.title}\nNode: ${result.node_id}` : s.title}>
                  {s.label}{nodeHint}
                </span>
              );
            })()}
            {result.tap_protocol && (
              <span style={styles.tapBadge} title="This token also exists on Bitcoin via Trac TAP Protocol">
                ₿ TAP Protocol
              </span>
            )}
          </div>
        </div>
        <div style={styles.badgeArea}>
          {verdict ? (
            <RiskBadge level={verdict.risk_level} score={verdict.risk_score} />
          ) : (
            <span style={{ color: '#4b5563', fontSize: '12px' }}>
              {isAnalyzing ? 'scanning…' : 'no verdict'}
            </span>
          )}
          {!isAnalyzing && verdict && (
            <div className="result-buttons" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(onPin || onUnpin) && (
                <button onClick={isPinned ? onUnpin : onPin} style={styles.copyBtn}
                  title={isPinned ? 'Remove from watchlist' : 'Add to watchlist'}>
                  {isPinned ? '📌 Pinned' : '📌 Pin'}
                </button>
              )}
              <button onClick={() => exportAsImage(result)} style={styles.copyBtn} title="Save as image">
                🖼 Save
              </button>
              <button onClick={copyLink} style={styles.copyBtn} title="Copy shareable link">
                {copied ? '✓ Copied' : '🔗 Copy'}
              </button>
              <button onClick={shareOnX} style={styles.xBtn} title="Share on X">
                𝕏 Post
              </button>
              <button
                onClick={flagAsScam}
                style={{ ...styles.copyBtn, color: flagged ? '#ef4444' : '#6b7280',
                  borderColor: flagged ? '#7f1d1d' : '#374151' }}
                title="Report this token as a scam"
                disabled={flagged}
              >
                🚩 {flagCount > 0 ? `Flagged (${flagCount})` : 'Flag'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {result.status === 'error' && result.error && (
        <div style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', borderRadius: '8px',
          padding: '10px 14px', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <span style={{ color: '#ef4444', fontSize: '16px', flexShrink: 0 }}>⚠</span>
          <div>
            <div style={{ color: '#f87171', fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>Scan Failed</div>
            <div style={{ color: '#9ca3af', fontSize: '12px', lineHeight: 1.5 }}>{result.error}</div>
          </div>
        </div>
      )}

      {/* Skeleton while analyzing */}
      {isAnalyzing && !verdict && (
        <div style={{ marginBottom: '12px' }}>
          <Skeleton h={8} />
          <Skeleton w="90%" h={13} />
          <Skeleton w="70%" h={13} />
          <Skeleton w="80%" h={13} />
        </div>
      )}

      {/* Score bar */}
      {verdict && (
        <div style={{ margin: '0 0 12px' }}>
          <ScoreBar score={verdict.risk_score} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>
              Risk score: {verdict.risk_score}/100 · Confidence: {verdict.confidence}%
            </span>
          </div>
        </div>
      )}

      {/* Verdict summary */}
      {verdict && (
        <div style={{ ...styles.summary, borderLeft: `3px solid ${risk?.accent ?? '#374151'}` }}>
          <div style={{ color: '#e2e8f0', fontSize: '13px', marginBottom: '8px' }}>
            {verdict.summary}
          </div>
          <div style={{ color: '#9ca3af', fontSize: '12px', lineHeight: 1.6 }}>
            {verdict.reasoning}
          </div>
        </div>
      )}

      {/* Flags */}
      {verdict && (verdict.red_flags.length > 0 || verdict.green_flags.length > 0) && (
        <div style={styles.flags}>
          {verdict.red_flags.length > 0 && (
            <div>
              <div style={{ color: '#f87171', fontSize: '11px', fontWeight: 600, marginBottom: '4px', letterSpacing: '0.05em' }}>
                RED FLAGS
              </div>
              {verdict.red_flags.map((f, i) => (
                <div key={i} style={{ color: '#fca5a5', fontSize: '12px', marginBottom: '2px' }}>
                  ✗ {f}
                </div>
              ))}
            </div>
          )}
          {verdict.green_flags.length > 0 && (
            <div>
              <div style={{ color: '#4ade80', fontSize: '11px', fontWeight: 600, marginBottom: '4px', letterSpacing: '0.05em' }}>
                GREEN FLAGS
              </div>
              {verdict.green_flags.map((f, i) => (
                <div key={i} style={{ color: '#86efac', fontSize: '12px', marginBottom: '2px' }}>
                  ✓ {f}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Market data */}
      {result.coingecko && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '12px' }}>
          <span style={{ color: '#9ca3af' }}>MCap: <span style={{ color: '#e2e8f0' }}>${(result.coingecko.market_cap_usd / 1_000_000).toFixed(1)}M</span></span>
          {result.coingecko.listed_on_exchanges.length > 0 && (
            <span style={{ color: '#9ca3af' }}>Exchanges: <span style={{ color: '#e2e8f0' }}>{result.coingecko.listed_on_exchanges.slice(0, 3).join(', ')}</span></span>
          )}
        </div>
      )}

      {/* Scoring metadata */}
      {result.scoring && (
        <div style={{ fontSize: '11px', color: '#4b5563', marginBottom: '4px' }}>
          Data completeness: {result.scoring.data_completeness}% · Rule-based score: {result.scoring.score}/100
        </div>
      )}

      {/* Steps */}
      <details style={{ marginTop: '12px' }}>
        <summary style={{ color: '#6b7280', fontSize: '12px', cursor: 'pointer', userSelect: 'none' }}>
          Analysis steps
        </summary>
        <div style={{ marginTop: '8px' }}>
          <StepTracker steps={steps} />
        </div>
      </details>

      {/* Scan another token CTA */}
      {!isAnalyzing && verdict && onScanAnother && (
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <button onClick={onScanAnother} style={styles.scanAnotherBtn}>
            🔍 Scan another token →
          </button>
        </div>
      )}

      {/* TAP Protocol panel */}
      {result.tap_scan && !isAnalyzing && (
        <TapPanel tap={result.tap_scan} />
      )}

      {/* Security checks panel (plain-English, EVM/Solana only) */}
      {result.goplus && !isAnalyzing && (() => {
        const checks = buildChecks(result.goplus);
        const top10  = Number(result.goplus.top10_holder_percent ?? 0);
        const count  = Number(result.goplus.holder_count ?? 0);
        return (
          <div style={{ marginTop: '12px' }}>
            <div style={styles.panelTitle}>Security Checks</div>
            {count > 0 && top10 > 0 && (
              <HolderBar top10Pct={top10} holderCount={count} />
            )}
            <div>
              {checks.map((c, i) => <CheckRow key={i} check={c} />)}
            </div>
          </div>
        );
      })()}

      {/* Risk history & deployer reputation */}
      {!isAnalyzing && verdict && (
        <>
          <ScoreHistory address={result.address} chain={result.chain} />
          {result.goplus?.creator_address && (
            <DeployerHistory
              creatorAddress={result.goplus.creator_address}
              currentAddress={result.address}
            />
          )}
        </>
      )}

      {/* Advanced data (collapsed) */}
      {(result.goplus || result.dex || result.coingecko) && (
        <details style={{ marginTop: '8px' }}>
          <summary style={{ color: '#4b5563', fontSize: '11px', cursor: 'pointer', userSelect: 'none' }}>
            Advanced data
          </summary>
          <div style={styles.rawPanel}>
            {result.goplus && (
              <div style={styles.rawSection}>
                <div style={styles.rawTitle}>GoPlus Security</div>
                <RawRow label="Honeypot"       value={result.goplus.is_honeypot ? '🚨 YES' : '✓ No'} />
                <RawRow label="Buy / Sell tax" value={`${fmt(result.goplus.buy_tax)}% / ${fmt(result.goplus.sell_tax)}%`} />
                <RawRow label="Mintable"       value={result.goplus.is_mintable   ? '⚠ Yes' : '✓ No'} />
                <RawRow label="Open source"    value={result.goplus.is_open_source ? '✓ Yes' : '✗ No'} />
                <RawRow label="Renounced"      value={result.goplus.is_renounced  ? '✓ Yes' : '✗ No'} />
                <RawRow label="LP locked"      value={`${fmt(result.goplus.lp_locked_percent, 0)}%`} />
                <RawRow label="Owner %"        value={`${fmt(result.goplus.owner_percent, 2)}%`} />
                <RawRow label="Top 10 holders" value={`${fmt(result.goplus.top10_holder_percent)}%`} />
                <RawRow label="Holder count"   value={String(result.goplus.holder_count ?? '?')} />
                {result.goplus.creator_address && (
                  <RawRow label="Creator" value={`${result.goplus.creator_address.slice(0, 10)}…`} mono />
                )}
              </div>
            )}
            {result.dex && (
              <div style={styles.rawSection}>
                <div style={styles.rawTitle}>DexScreener</div>
                <RawRow label="Total liquidity"  value={`$${(result.dex.totalLiquidityUsd ?? 0).toLocaleString()}`} />
                <RawRow label="Age"              value={`${fmt(result.dex.ageHours, 0)}h`} />
                <RawRow label="Price change 24h" value={`${fmt(result.dex.priceChange24h)}%`} />
                <RawRow label="Buys / Sells 24h" value={`${result.dex.buysSells24h.buys} / ${result.dex.buysSells24h.sells}`} />
                {result.dex.bestPair && (
                  <>
                    <RawRow label="Best pair DEX"  value={result.dex.bestPair.dexId} />
                    <RawRow label="Best pair liq"  value={`$${(result.dex.bestPair.liquidity?.usd ?? 0).toLocaleString()}`} />
                    <RawRow label="Volume 24h"     value={`$${(result.dex.bestPair.volume?.h24 ?? 0).toLocaleString()}`} />
                    <RawRow label="Price USD"      value={result.dex.bestPair.priceUsd} />
                    <RawRow label="Pair address"   value={`${result.dex.bestPair.pairAddress.slice(0, 10)}…`} mono />
                  </>
                )}
                {(result.dex.pairs?.length ?? 0) > 1 && (
                  <RawRow label="Total pairs" value={`${result.dex.pairs.length}`} />
                )}
              </div>
            )}
            {result.coingecko && (
              <div style={styles.rawSection}>
                <div style={styles.rawTitle}>CoinGecko</div>
                <RawRow label="Market cap" value={`$${fmt(result.coingecko.market_cap_usd / 1_000_000, 2)}M`} />
                <RawRow label="FDV"        value={`$${fmt(result.coingecko.fdv_usd / 1_000_000, 2)}M`} />
                <RawRow label="Exchanges"  value={result.coingecko.listed_on_exchanges.join(', ')} />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background:   '#111827',
    border:       '1px solid #1f2937',
    borderRadius: '12px',
    padding:      '16px',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   '12px',
    gap:            '12px',
  },
  avatar: {
    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
    background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  tokenInfo: { flex: 1, minWidth: 0 },
  tokenName: {
    fontSize:   '16px',
    fontWeight: 700,
    color:      '#e2e8f0',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    display: 'flex',
    gap:     '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  chain: {
    background:   '#1f2937',
    color:        '#60a5fa',
    padding:      '2px 7px',
    borderRadius: '4px',
    fontSize:     '11px',
    fontWeight:   700,
  },
  addr: {
    color:      '#6b7280',
    fontSize:   '12px',
    fontFamily: 'monospace',
  },
  badgeArea: { flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' },
  copyBtn: {
    padding: '4px 10px', background: 'transparent', border: '1px solid #374151',
    borderRadius: '6px', color: '#9ca3af', fontSize: '11px', cursor: 'pointer',
    fontFamily: 'inherit',
  },
  xBtn: {
    padding: '4px 10px', background: '#0f0f0f', border: '1px solid #374151',
    borderRadius: '6px', color: '#e2e8f0', fontSize: '11px', cursor: 'pointer',
    fontFamily: 'inherit', fontWeight: 700,
  },
  scanAnotherBtn: {
    background: 'transparent', border: '1px solid #374151',
    borderRadius: '8px', color: '#6b7280', fontSize: '13px',
    padding: '8px 20px', cursor: 'pointer', fontFamily: 'inherit',
    width: '100%',
  },
  tapBadge: {
    background: '#1c1400', border: '1px solid #78350f',
    borderRadius: '4px', color: '#f59e0b',
    fontSize: '10px', fontWeight: 700, padding: '1px 6px',
    letterSpacing: '0.03em',
  },
  summary: {
    background:   '#0d1117',
    borderRadius: '8px',
    padding:      '10px 12px',
    marginBottom: '12px',
  },
  flags: {
    display: 'flex',
    gap:     '16px',
    flexWrap: 'wrap',
    background: '#0d1117',
    borderRadius: '8px',
    padding: '10px 12px',
    marginBottom: '4px',
  },
  rawPanel: {
    marginTop:    '8px',
    background:   '#0d1117',
    borderRadius: '8px',
    padding:      '10px 12px',
    display:      'flex',
    gap:          '24px',
    flexWrap:     'wrap',
  },
  rawSection: { minWidth: '180px', flex: 1 },
  rawTitle:   { color: '#60a5fa', fontSize: '11px', fontWeight: 600,
    letterSpacing: '0.05em', marginBottom: '6px' },
  panelTitle: {
    color: '#6b7280', fontSize: '11px', fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase' as const,
    marginBottom: '8px',
  },
};
