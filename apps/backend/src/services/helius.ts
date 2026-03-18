import axios from 'axios';

const API_KEY = process.env.HELIUS_API_KEY!;
const BASE    = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

export interface SolanaTokenInfo {
  name: string;
  symbol: string;
  description: string;
  image: string | null;
  totalSupply: number;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isMutable: boolean;
  holderCount: number;
}

export async function getSolanaTokenInfo(mintAddress: string): Promise<SolanaTokenInfo | null> {
  try {
    const res = await axios.post(BASE, {
      jsonrpc: '2.0',
      id: 'sentinel',
      method: 'getAsset',
      params: { id: mintAddress },
    }, { timeout: 8000 });

    const asset = res.data?.result;
    if (!asset) return null;

    // mintAuthority can be in token_info (standard SPL) or mint_extensions (token-2022)
    const mintAuthority =
      asset.token_info?.mint_authority ??
      asset.mint_extensions?.mint_authority?.authority ??
      null;
    const freezeAuthority =
      asset.token_info?.freeze_authority ??
      asset.mint_extensions?.freeze_authority?.authority ??
      null;

    return {
      name:            asset.content?.metadata?.name ?? '',
      symbol:          asset.content?.metadata?.symbol ?? '',
      description:     asset.content?.metadata?.description ?? '',
      image:           asset.content?.links?.image ?? null,
      totalSupply:     asset.token_info?.supply ?? 0,
      decimals:        asset.token_info?.decimals ?? 0,
      mintAuthority,
      freezeAuthority,
      isMutable:       asset.mutable ?? true,
      holderCount:     0,
    };
  } catch { return null; }
}

export async function getSolanaHolders(mintAddress: string): Promise<number> {
  try {
    // Use getTokenAccounts with limit=1 to get total count
    const res = await axios.post(BASE, {
      jsonrpc: '2.0',
      id: 'sentinel-holders',
      method: 'getTokenAccounts',
      params: { mint: mintAddress, limit: 1, page: 1 },
    }, { timeout: 10000 });

    const total = res.data?.result?.total;
    if (typeof total === 'number' && total > 0) return total;

    // Fallback: count via token_accounts array length hint
    const items = res.data?.result?.token_accounts;
    if (Array.isArray(items)) return items.length;

    return 0;
  } catch { return 0; }
}
