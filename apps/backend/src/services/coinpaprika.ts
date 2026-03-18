import axios from 'axios';
import { logger } from '../logger.js';

const BASE = 'https://api.coinpaprika.com/v1';

// CoinPaprika platform IDs for contract lookup (no API key required)
const PLATFORMS: Record<string, string> = {
  eth:      'eth-ethereum',
  bsc:      'bnb-binance-coin',
  polygon:  'matic-polygon',
  solana:   'sol-solana',
  arbitrum: 'arb-arbitrum',
  base:     'base-base',
  optimism: 'op-optimism',
};

// Keep same interface name so analyzer.ts type reference doesn't change
export interface CoinGeckoData {
  id:                  string;
  name:                string;
  symbol:              string;
  market_cap_usd:      number;
  fdv_usd:             number;
  price_usd:           number;
  price_change_24h:    number;
  volume_24h:          number;
  listed_on_exchanges: string[];
  image:               string | null;
}

export async function getCoinGeckoData(address: string, chain: string): Promise<CoinGeckoData | null> {
  try {
    const platform = PLATFORMS[chain];
    if (!platform) return null;

    // Step 1: resolve contract address → coin ID
    const contractRes = await axios.get(
      `${BASE}/contracts/${platform}/${address.toLowerCase()}`,
      { timeout: 8000 },
    );
    const coinId = contractRes.data?.id;
    if (!coinId) return null;

    // Step 2: fetch market data
    const tickerRes = await axios.get(`${BASE}/tickers/${coinId}`, {
      params:  { quotes: 'USD' },
      timeout: 8000,
    });
    const d   = tickerRes.data;
    const usd = d?.quotes?.USD;
    if (!usd) return null;

    return {
      id:                  d.id    ?? coinId,
      name:                d.name  ?? '',
      symbol:              (d.symbol as string)?.toUpperCase() ?? '',
      market_cap_usd:      usd.market_cap                  ?? 0,
      fdv_usd:             usd.fully_diluted_market_cap    ?? 0,
      price_usd:           usd.price                       ?? 0,
      price_change_24h:    usd.percent_change_24h          ?? 0,
      volume_24h:          usd.volume_24h                  ?? 0,
      listed_on_exchanges: [],   // not needed for scoring — skip extra API call
      image:               null,
    };
  } catch (e) {
    logger.debug({ err: e, address, chain }, 'CoinPaprika lookup returned no data');
    return null;
  }
}
