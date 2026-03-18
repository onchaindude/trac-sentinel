import { useEffect, useRef, useState, useCallback } from 'react';

export type Chain = 'eth' | 'bsc' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'solana' | 'tap';

export interface SentinelVerdict {
  risk_score:   number;
  risk_level:   'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
  confidence:   number;
  red_flags:    string[];
  green_flags:  string[];
  summary:      string;
  reasoning:    string;
}

export interface AnalysisStep {
  name:   string;
  status: 'pending' | 'running' | 'done' | 'failed';
  data?:  string;
}

export interface AnalysisResult {
  id:      string;
  address: string;
  chain:   Chain;
  ts:      number;
  status:  'analyzing' | 'complete' | 'error';
  source:  'live' | 'cache' | 'p2p';
  name:    string;
  symbol:  string;
  verdict: SentinelVerdict | null;
  steps:   AnalysisStep[];
  error?:  string;
  tap_protocol: boolean;
  tap_scan: {
    ticker: string; maxSupply: string; mintLimit: string;
    deployedAt: number; deployerAddress: string; deployBlock: number;
    inscriptionId: string; mintTokensLeft: string; mintProgressPct: number;
    fullyMinted: boolean; holderCount: number;
    topHolders: { address: string; balance: string; transferable: string; pct: number }[];
    top10HolderPct: number; deployerHoldsPct: number;
    hasTokenAuth: boolean; tokenAuthCount: number; tokenAuthCoversAll: boolean;
    tradeCount: number; risks: string[]; positives: string[];
    score: number; risk_level: 'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
  } | null;
  scoring: {
    score: number;
    risk_level: 'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
    red_factors: string[];
    green_factors: string[];
    data_completeness: number;
  } | null;
  coingecko: {
    market_cap_usd: number;
    fdv_usd: number;
    listed_on_exchanges: string[];
    image: string | null;
  } | null;
  goplus: {
    is_honeypot: boolean;
    buy_tax: number;
    sell_tax: number;
    is_mintable: boolean;
    is_proxy: boolean;
    is_blacklisted: boolean;
    is_open_source: boolean;
    is_renounced: boolean;
    can_take_back_ownership: boolean;
    trading_cooldown: boolean;
    transfer_pausable: boolean;
    lp_locked_percent: number;
    lp_lock_expiry_ts: number | null;
    top10_holder_percent: number;
    holder_count: number;
    owner_percent: number;
    creator_address: string;
    token_name: string;
    token_symbol: string;
  } | null;
  dex: {
    totalLiquidityUsd: number;
    ageHours: number;
    priceChange24h: number;
    buysSells24h: { buys: number; sells: number };
    bestPair: {
      pairAddress: string;
      dexId: string;
      volume: { h24: number };
      liquidity: { usd: number };
      priceUsd: string;
    } | null;
    pairs: Array<{
      pairAddress: string;
      dexId: string;
      liquidity: { usd: number };
      volume: { h24: number };
    }>;
  } | null;
}

export interface RiskAlert {
  token: string;
  from:  string;
  to:    string;
}

export interface BatchProgress {
  current: number;
  total:   number;
  label:   string;
}

const WS_URL = import.meta.env.DEV ? 'ws://localhost:4000/ws' : `ws://${location.host}/ws`;

export function useSentinel() {
  const [results, setResults]         = useState<AnalysisResult[]>([]);
  const [connected, setConnected]     = useState(false);
  const [analyzing, setAnalyzing]     = useState(false);
  const [riskAlert, setRiskAlert]     = useState<RiskAlert | null>(null);
  const [batchProgress, setBatch]     = useState<BatchProgress | null>(null);
  const ws              = useRef<WebSocket | null>(null);
  const prevRiskRef     = useRef<Map<string, string>>(new Map());
  const analyzeTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsert = useCallback((item: AnalysisResult) => {
    setResults(prev => {
      const idx = prev.findIndex(r => r.id === item.id);
      if (idx === -1) return [item, ...prev];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen  = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket.close();

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; data: AnalysisResult | AnalysisResult[] };

          if (msg.type === 'snapshot') {
            const snap = (msg.data as AnalysisResult[]).sort((a, b) => b.ts - a.ts);
            // Seed prev risk levels from snapshot so we can detect changes on rescan
            for (const r of snap) {
              if (r.verdict) {
                prevRiskRef.current.set(`${r.chain}:${r.address}`, r.verdict.risk_level);
              }
            }
            setResults(snap);

          } else if (msg.type === 'progress' || msg.type === 'complete') {
            upsert(msg.data as AnalysisResult);

            if (msg.type === 'complete') {
              if (analyzeTimeout.current) { clearTimeout(analyzeTimeout.current); analyzeTimeout.current = null; }
              setAnalyzing(false);
              const r   = msg.data as AnalysisResult;
              const key = `${r.chain}:${r.address}`;
              const prev = prevRiskRef.current.get(key);
              const next = r.verdict?.risk_level;
              if (prev && next && prev !== next) {
                setRiskAlert({ token: r.name || r.symbol || r.address.slice(0, 8), from: prev, to: next });
              }
              if (next) prevRiskRef.current.set(key, next);
            }

          } else if (msg.type === 'error') {
            if (analyzeTimeout.current) { clearTimeout(analyzeTimeout.current); analyzeTimeout.current = null; }
            setAnalyzing(false);
          }
        } catch {}
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, [upsert]);

  const analyze = useCallback(async (address: string, chain: Chain): Promise<string | null> => {
    setAnalyzing(true);
    // Safety net: reset after 2 minutes if WS never delivers complete/error
    if (analyzeTimeout.current) clearTimeout(analyzeTimeout.current);
    analyzeTimeout.current = setTimeout(() => setAnalyzing(false), 120_000);
    try {
      const res = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address, chain }),
      });
      if (!res.ok) {
        setAnalyzing(false);
        const body = await res.json().catch(() => ({})) as { error?: string };
        return body.error ?? `Server error (${res.status})`;
      }
      return null;
    } catch {
      setAnalyzing(false);
      return 'Could not reach the server — is the backend running?';
    }
  }, []);

  // Queue multiple scans sequentially — results stream in via WebSocket
  const analyzeBatch = useCallback(async (
    items: { address: string; chain: Chain }[]
  ): Promise<void> => {
    setAnalyzing(true);
    for (let i = 0; i < items.length; i++) {
      const { address, chain } = items[i]!;
      setBatch({ current: i + 1, total: items.length, label: `${address.slice(0, 8)}…` });
      await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ address, chain }),
      }).catch(() => {});
      // Respect rate limit: 10 req/min = one every 6.5s
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 6500));
    }
    setBatch(null);
    setAnalyzing(false);
  }, []);

  const clearHistory = useCallback(async () => {
    await fetch('/api/results', { method: 'DELETE' });
  }, []);

  const clearRiskAlert = useCallback(() => setRiskAlert(null), []);

  return { results, connected, analyzing, analyze, analyzeBatch, batchProgress, clearHistory, riskAlert, clearRiskAlert };
}
