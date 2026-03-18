interface Props {
  level: 'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
  score?: number;
  size?: 'sm' | 'lg';
}

const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SAFE:    { bg: '#052e16', text: '#4ade80', border: '#166534' },
  CAUTION: { bg: '#1c1917', text: '#fbbf24', border: '#78350f' },
  DANGER:  { bg: '#1c0a02', text: '#f97316', border: '#7c2d12' },
  RUG:     { bg: '#1c0a0a', text: '#ef4444', border: '#7f1d1d' },
};

const ICONS: Record<string, string> = {
  SAFE:    '✓',
  CAUTION: '⚠',
  DANGER:  '⚡',
  RUG:     '☠',
};

export function RiskBadge({ level, score, size = 'sm' }: Props) {
  const c = COLORS[level]!;
  const isLarge = size === 'lg';
  const isRug   = level === 'RUG';
  return (
    <span style={{
      display:      'inline-flex',
      alignItems:   'center',
      gap:          '5px',
      padding:      isLarge ? '6px 16px' : '3px 9px',
      background:   c.bg,
      border:       `1px solid ${c.border}`,
      borderRadius: '999px',
      color:        c.text,
      fontSize:     isLarge ? '18px' : '12px',
      fontWeight:   700,
      letterSpacing: '0.05em',
      boxShadow:    isRug ? '0 0 8px rgba(239,68,68,0.5)' : undefined,
    }}>
      <span>{ICONS[level]}</span>
      <span>{level}</span>
      {score !== undefined && <span style={{ opacity: 0.7, fontWeight: 400 }}>{score}</span>}
    </span>
  );
}
