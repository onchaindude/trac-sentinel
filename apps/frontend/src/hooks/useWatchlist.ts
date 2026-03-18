import { useState, useCallback } from 'react';
import type { Chain, AnalysisResult } from './useSentinel.js';

export interface WatchlistItem {
  address:  string;
  chain:    Chain;
  name:     string;
  symbol:   string;
  pinnedAt: number;
}

const KEY = 'tracsentinel_watchlist';

function load(): WatchlistItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as WatchlistItem[]; }
  catch { return []; }
}

function persist(items: WatchlistItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(load);

  const pin = useCallback((result: AnalysisResult) => {
    setWatchlist(prev => {
      if (prev.some(w => w.address === result.address && w.chain === result.chain)) return prev;
      const next = [...prev, {
        address:  result.address,
        chain:    result.chain,
        name:     result.name || '',
        symbol:   result.symbol || '',
        pinnedAt: Date.now(),
      }];
      persist(next);
      return next;
    });
  }, []);

  const unpin = useCallback((address: string, chain: Chain) => {
    setWatchlist(prev => {
      const next = prev.filter(w => !(w.address === address && w.chain === chain));
      persist(next);
      return next;
    });
  }, []);

  const isPinned = useCallback((address: string, chain: Chain) =>
    watchlist.some(w => w.address === address && w.chain === chain),
  [watchlist]);

  return { watchlist, pin, unpin, isPinned };
}
