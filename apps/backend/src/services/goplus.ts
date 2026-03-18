import axios from 'axios';
import { logger } from '../logger.js';

const APP_KEY = process.env.GOPLUS_APP_KEY!;

export interface GoPlusResult {
  is_honeypot: boolean;
  honeypot_reason: string;
  buy_tax: number;
  sell_tax: number;
  is_mintable: boolean;
  is_proxy: boolean;
  is_blacklisted: boolean;
  owner_address: string;
  owner_percent: number;
  creator_address: string;
  creator_percent: number;
  lp_locked_percent: number;
  lp_lock_expiry_ts: number | null;  // unix seconds of earliest LP lock expiry
  lp_total_supply: string;
  holder_count: number;
  top10_holder_percent: number;
  is_open_source: boolean;
  is_renounced: boolean;
  can_take_back_ownership: boolean;
  trading_cooldown: boolean;
  transfer_pausable: boolean;
  token_name: string;
  token_symbol: string;
  total_supply: string;
  raw: Record<string, unknown>;
}

// Chain ID mapping for GoPlus
const CHAIN_IDS: Record<string, string> = {
  eth:       '1',
  bsc:       '56',
  polygon:   '137',
  arbitrum:  '42161',
  base:      '8453',
  optimism:  '10',
  avalanche: '43114',
  solana:    'solana',
};

export async function checkTokenSecurity(address: string, chain: string): Promise<GoPlusResult | null> {
  try {
    const chainId = CHAIN_IDS[chain] ?? '1';

    // GoPlus supports both authenticated and public access
    // For solana, different endpoint
    const url = chain === 'solana'
      ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${address}`
      : `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${address}`;

    const res = await axios.get(url, {
      headers: { 'X-API-KEY': APP_KEY },
      timeout: 10000,
    });

    const data = res.data?.result?.[address.toLowerCase()] ?? res.data?.result?.[address];
    if (!data) return null;

    // Extract earliest LP lock expiry timestamp from locker_detail
    let lpLockExpiryTs: number | null = null;
    const lockerDetails = data.lp_holder_analysis?.locker_detail ?? [];
    for (const locker of lockerDetails) {
      for (const detail of locker.locked_detail ?? []) {
        const ts = parseInt(detail.end_time ?? '0', 10);
        if (ts > 0 && (lpLockExpiryTs === null || ts < lpLockExpiryTs)) {
          lpLockExpiryTs = ts; // earliest lock expiry
        }
      }
    }

    return {
      is_honeypot:             data.is_honeypot === '1',
      honeypot_reason:         data.honeypot_with_same_creator ?? '',
      buy_tax:                 parseFloat(data.buy_tax ?? '0') * 100,
      sell_tax:                parseFloat(data.sell_tax ?? '0') * 100,
      is_mintable:             data.is_mintable === '1',
      is_proxy:                data.is_proxy === '1',
      is_blacklisted:          data.is_blacklist === '1',
      owner_address:           data.owner_address ?? '',
      owner_percent:           parseFloat(data.owner_percent ?? '0') * 100,
      creator_address:         data.creator_address ?? '',
      creator_percent:         parseFloat(data.creator_percent ?? '0') * 100,
      lp_locked_percent:       parseFloat(data.lp_holder_analysis?.locked_percent ?? '0') * 100,
      lp_lock_expiry_ts:       lpLockExpiryTs,
      lp_total_supply:         data.lp_total_supply ?? '0',
      holder_count:            parseInt(data.holder_count ?? '0', 10),
      top10_holder_percent:    parseFloat(data.top10_holder_ratio ?? '0') * 100,
      is_open_source:          data.is_open_source === '1',
      is_renounced:            data.owner_address === '0x0000000000000000000000000000000000000000',
      can_take_back_ownership: data.can_take_back_ownership === '1',
      trading_cooldown:        data.trading_cooldown === '1',
      transfer_pausable:       data.transfer_pausable === '1',
      token_name:              data.token_name ?? '',
      token_symbol:            data.token_symbol ?? '',
      total_supply:            data.total_supply ?? '0',
      raw:                     data,
    };
  } catch (e) {
    logger.error({ err: e }, 'GoPlus fetch failed');
    return null;
  }
}
