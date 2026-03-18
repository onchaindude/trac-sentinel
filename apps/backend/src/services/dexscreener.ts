import axios from 'axios';
import { logger } from '../logger.js';

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  priceChange: { h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number };
  volume: { h24: number; h6: number; h1: number; m5: number };
  txns: { h24: { buys: number; sells: number }; h1: { buys: number; sells: number } };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
}

export interface DexData {
  pairs: DexPair[];
  bestPair: DexPair | null;
  totalLiquidityUsd: number;
  ageHours: number;
  buysSells24h: { buys: number; sells: number };
  priceChange24h: number;
}

export async function getDexData(address: string): Promise<DexData | null> {
  try {
    const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      timeout: 8000,
    });

    const pairs: DexPair[] = res.data?.pairs ?? [];
    if (!pairs.length) return null;

    // Sort by liquidity — best pair = most liquid
    const sorted = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const best = sorted[0]!;

    const totalLiq = pairs.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0);
    const ageMs = best.pairCreatedAt ? Date.now() - best.pairCreatedAt : 0;
    const ageHours = ageMs / (1000 * 60 * 60);

    return {
      pairs: sorted,
      bestPair: best,
      totalLiquidityUsd: totalLiq,
      ageHours,
      buysSells24h: {
        buys:  best.txns?.h24?.buys  ?? 0,
        sells: best.txns?.h24?.sells ?? 0,
      },
      priceChange24h: best.priceChange?.h24 ?? 0,
    };
  } catch (e) {
    logger.error({ err: e }, 'DexScreener fetch failed');
    return null;
  }
}
