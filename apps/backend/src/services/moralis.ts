import axios from 'axios';

const API_KEY = process.env.MORALIS_API_KEY!;
const BASE    = 'https://deep-index.moralis.io/api/v2.2';

const headers = { 'X-API-Key': API_KEY };

const MORALIS_CHAINS: Record<string, string> = {
  eth:      '0x1',
  bsc:      '0x38',
  polygon:  '0x89',
  arbitrum: '0xa4b1',
  base:     '0x2105',
  optimism: '0xa',
};

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  logo: string | null;
  verified: boolean;
  categories: string[];
}

export interface WalletActivity {
  firstSeenDays: number;
  nativeBalance: string;
  tokenCount: number;
}

export async function getTokenMetadata(address: string, chain: string): Promise<TokenMetadata | null> {
  try {
    const chainHex = MORALIS_CHAINS[chain] ?? '0x1';
    const res = await axios.get(`${BASE}/erc20/metadata`, {
      headers,
      params: { chain: chainHex, addresses: [address] },
      timeout: 8000,
    });
    const d = res.data?.[0];
    if (!d) return null;
    return {
      name:        d.name ?? '',
      symbol:      d.symbol ?? '',
      decimals:    d.decimals ?? 18,
      totalSupply: d.total_supply_formatted ?? '0',
      logo:        d.logo ?? null,
      verified:    d.verified_contract ?? false,
      categories:  d.categories ?? [],
    };
  } catch { return null; }
}

export async function getWalletActivity(address: string, chain: string): Promise<WalletActivity | null> {
  try {
    const chainHex = MORALIS_CHAINS[chain] ?? '0x1';
    const [balRes, tokRes] = await Promise.all([
      axios.get(`${BASE}/${address}/balance`, { headers, params: { chain: chainHex }, timeout: 6000 }),
      axios.get(`${BASE}/${address}/erc20`, { headers, params: { chain: chainHex, limit: 1 }, timeout: 6000 }),
    ]);
    return {
      firstSeenDays: 0,
      nativeBalance: balRes.data?.balance ?? '0',
      tokenCount:    tokRes.data?.total ?? 0,
    };
  } catch { return null; }
}

export async function getTokenOwners(address: string, chain: string): Promise<{ count: number; top: Array<{ address: string; pct: number }> }> {
  try {
    const chainHex = MORALIS_CHAINS[chain] ?? '0x1';
    const res = await axios.get(`${BASE}/erc20/${address}/owners`, {
      headers,
      params: { chain: chainHex, limit: 10, order: 'DESC' },
      timeout: 8000,
    });
    const owners = res.data?.result ?? [];
    const total  = res.data?.total ?? 0;
    return {
      count: total,
      top: owners.map((o: Record<string, string>) => ({
        address: o.owner_address,
        pct:     parseFloat(o.percentage_relative_to_total_supply ?? '0'),
      })),
    };
  } catch { return { count: 0, top: [] }; }
}
