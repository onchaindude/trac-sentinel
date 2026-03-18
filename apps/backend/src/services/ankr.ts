import axios from 'axios';
import { logger } from '../logger.js';

// Free tier works without a key (rate-limited). Set ANKR_API_KEY for higher limits.
const ANKR_API_KEY = process.env.ANKR_API_KEY ?? '';
const BASE = ANKR_API_KEY
  ? `https://rpc.ankr.com/multichain/${ANKR_API_KEY}`
  : 'https://rpc.ankr.com/multichain';

const ANKR_CHAINS: Record<string, string> = {
  eth:      'eth',
  bsc:      'bsc',
  polygon:  'polygon',
  arbitrum: 'arbitrum',
  base:     'base',
  optimism: 'optimism',
};

async function ankrPost<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await axios.post(BASE, { jsonrpc: '2.0', method, params, id: 1 }, { timeout: 8000 });
    return (res.data?.result as T) ?? null;
  } catch (e) {
    logger.debug({ err: e, method }, 'Ankr request failed');
    return null;
  }
}

// Keep same interfaces as moralis.ts for drop-in compatibility
export interface TokenMetadata {
  name:        string;
  symbol:      string;
  decimals:    number;
  totalSupply: string;
  logo:        string | null;
  verified:    boolean;
  categories:  string[];
}

export interface WalletActivity {
  firstSeenDays: number;
  nativeBalance: string;
  tokenCount:    number;
}

export async function getTokenMetadata(address: string, chain: string): Promise<TokenMetadata | null> {
  const blockchain = ANKR_CHAINS[chain];
  if (!blockchain) return null;

  const result = await ankrPost<Record<string, unknown>>('ankr_getTokenMetadata', {
    blockchain,
    contractAddress: address,
  });
  if (!result) return null;

  return {
    name:        String(result.name        ?? ''),
    symbol:      String(result.symbol      ?? ''),
    decimals:    Number(result.decimals    ?? 18),
    totalSupply: String(result.totalSupply ?? '0'),
    logo:        null,
    verified:    false,
    categories:  [],
  };
}

export async function getTokenOwners(
  address: string,
  chain:   string,
): Promise<{ count: number; top: Array<{ address: string; pct: number }> }> {
  const blockchain = ANKR_CHAINS[chain];
  if (!blockchain) return { count: 0, top: [] };

  const result = await ankrPost<{ holdersCount: number }>('ankr_getTokenHolders', {
    blockchain,
    contractAddress: address,
    pageSize: 1,   // just need the count, not the full list
  });

  return { count: result?.holdersCount ?? 0, top: [] };
}

export async function getWalletActivity(address: string, chain: string): Promise<WalletActivity | null> {
  const blockchain = ANKR_CHAINS[chain];
  if (!blockchain) return null;

  const result = await ankrPost<{ assets: unknown[] }>('ankr_getAccountBalance', {
    blockchain:    [blockchain],
    walletAddress: address,
  });
  if (!result) return null;

  return {
    firstSeenDays: 0,
    nativeBalance: '0',
    tokenCount:    Array.isArray(result.assets) ? result.assets.length : 0,
  };
}
