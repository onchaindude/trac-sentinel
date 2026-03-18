import type { AnalysisStep } from '../hooks/useSentinel.js';

interface Props { steps: AnalysisStep[] }

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  running: '◉',
  done:    '✓',
  failed:  '✗',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#4b5563',
  running: '#60a5fa',
  done:    '#4ade80',
  failed:  '#f87171',
};

export function StepTracker({ steps }: Props) {
  return (
    <div style={styles.container}>
      {steps.map((step, i) => (
        <div key={i} style={styles.step}>
          <span style={{ color: STATUS_COLOR[step.status], fontSize: '14px', minWidth: '16px' }}>
            {STATUS_ICON[step.status]}
          </span>
          <div style={styles.info}>
            <span style={{ color: STATUS_COLOR[step.status] === '#4b5563' ? '#9ca3af' : STATUS_COLOR[step.status], fontSize: '13px' }}>
              {step.name}
            </span>
            {step.data && (
              <span style={{ color: '#6b7280', fontSize: '12px' }}>{step.data}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '6px',
  },
  step: {
    display:    'flex',
    gap:        '8px',
    alignItems: 'flex-start',
  },
  info: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '1px',
  },
};
