import axios from 'axios';

const API_KEY = process.env.COINGECKO_API_KEY ?? '';
const BASE    = 'https://api.coingecko.com/api/v3';

const headers = API_KEY ? { 'x-cg-demo-api-key': API_KEY } : {};

const COINGECKO_PLATFORMS: Record<string, string> = {
  eth:      'ethereum',
  bsc:      'binance-smart-chain',
  polygon:  'polygon-pos',
  arbitrum: 'arbitrum-one',
  base:     'base',
  optimism: 'optimistic-ethereum',
  solana:   'solana',
};

export interface CoinGeckoData {
  id: string;
  name: string;
  symbol: string;
  market_cap_usd: number;
  fdv_usd: number;
  price_usd: number;
  price_change_24h: number;
  volume_24h: number;
  listed_on_exchanges: string[];
  image: string | null;
}

export async function getCoinGeckoData(address: string, chain: string): Promise<CoinGeckoData | null> {
  try {
    const platform = COINGECKO_PLATFORMS[chain];
    if (!platform) return null;

    const res = await axios.get(`${BASE}/coins/${platform}/contract/${address}`, {
      headers,
      timeout: 8000,
    });

    const d = res.data;
    if (!d?.id) return null;

    const tickers: Array<{ market: { name: string } }> = d.tickers ?? [];
    const exchanges = [...new Set(tickers.slice(0, 10).map(t => t.market.name))];

    return {
      id:                  d.id,
      name:                d.name ?? '',
      symbol:              d.symbol?.toUpperCase() ?? '',
      market_cap_usd:      d.market_data?.market_cap?.usd ?? 0,
      fdv_usd:             d.market_data?.fully_diluted_valuation?.usd ?? 0,
      price_usd:           d.market_data?.current_price?.usd ?? 0,
      price_change_24h:    d.market_data?.price_change_percentage_24h ?? 0,
      volume_24h:          d.market_data?.total_volume?.usd ?? 0,
      listed_on_exchanges: exchanges,
      image:               d.image?.small ?? null,
    };
  } catch { return null; }
}
