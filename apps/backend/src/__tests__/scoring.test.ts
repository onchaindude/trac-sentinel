import { describe, it, expect } from 'vitest';
import { scoreToken, type ScoringInput } from '../scoring.js';

// Base input representing a clean, well-established EVM token
const CLEAN: ScoringInput = {
  chain: 'eth',
  dex_available: true,
  goplus_available: true,
  is_honeypot: false,
  buy_tax: 0,
  sell_tax: 0,
  is_mintable: false,
  is_open_source: true,
  is_renounced: true,
  lp_locked_percent: 0,
  top10_holder_percent: 20,
  holder_count: 200_000,
  owner_percent: 0,
  liquidity_usd: 2_000_000,
  age_hours: 10_000,
  volume_24h: 500_000,
  buys_24h: 500,
  sells_24h: 300,
  price_change_24h: 2,
  contract_info_available: true,
  contract_verified: true,
  deployer_age_days: 500,
  mint_authority_exists: false,
  freeze_authority_exists: false,
  is_mutable: false,
  market_cap_usd: 50_000_000,
  coingecko_listed: true,
};

// Minimal neutral base for isolated penalty tests — few green signals
const BARE: ScoringInput = {
  chain: 'eth',
  dex_available: true,
  goplus_available: true,
  is_honeypot: false,
  buy_tax: 0, sell_tax: 0,
  is_mintable: false,
  is_open_source: true,
  is_renounced: true,
  lp_locked_percent: 0,
  top10_holder_percent: 30,
  holder_count: 5_000,
  owner_percent: 0,
  liquidity_usd: 150_000,
  age_hours: 200,
  volume_24h: 50_000,
  buys_24h: 100, sells_24h: 60,
  price_change_24h: 3,
  contract_info_available: false,
  contract_verified: false,
  deployer_age_days: 0,
  mint_authority_exists: false,
  freeze_authority_exists: false,
  is_mutable: false,
  market_cap_usd: 0,
  coingecko_listed: false,
};

describe('scoreToken — instant RUG', () => {
  it('honeypot returns RUG 95 immediately', () => {
    const r = scoreToken({ ...CLEAN, is_honeypot: true });
    expect(r.score).toBe(95);
    expect(r.risk_level).toBe('RUG');
    expect(r.red_factors[0]).toMatch(/honeypot/i);
  });

  it('sell tax ≥50% is near-honeypot → DANGER or RUG', () => {
    const r = scoreToken({ ...BARE, sell_tax: 50 });
    expect(r.score).toBeGreaterThan(50); // at minimum DANGER
    expect(['DANGER', 'RUG']).toContain(r.risk_level);
    expect(r.red_factors.some(f => f.includes('functionally a honeypot'))).toBe(true);
  });
});

describe('scoreToken — tax tiers', () => {
  it('sell tax >30% → DANGER+', () => {
    const r = scoreToken({ ...BARE, sell_tax: 35 });
    expect(r.score).toBeGreaterThan(50);
  });

  it('sell tax >10% → elevated risk adds penalty', () => {
    const base  = scoreToken({ ...BARE });
    const taxed = scoreToken({ ...BARE, sell_tax: 15 });
    expect(taxed.score).toBeGreaterThan(base.score);
    expect(taxed.red_factors.some(f => f.includes('Sell tax'))).toBe(true);
  });

  it('zero sell tax → green flag', () => {
    const r = scoreToken({ ...CLEAN, sell_tax: 0 });
    expect(r.green_factors.some(f => f.includes('Zero sell tax'))).toBe(true);
  });
});

describe('scoreToken — concentration floor (FLOKI case)', () => {
  it('owner >40% forces minimum score of 26 (CAUTION)', () => {
    // Give it many discounts that would normally push score below 26
    const r = scoreToken({
      ...CLEAN,
      owner_percent: 44,
      holder_count: 500_000,
      liquidity_usd: 5_000_000,
      market_cap_usd: 100_000_000,
      coingecko_listed: true,
      age_hours: 20_000,
    });
    expect(r.score).toBeGreaterThanOrEqual(26);
    expect(r.risk_level).not.toBe('SAFE');
  });

  it('owner >30% forces minimum score of 15', () => {
    const r = scoreToken({
      ...CLEAN,
      owner_percent: 35,
      holder_count: 500_000,
      liquidity_usd: 5_000_000,
      market_cap_usd: 50_000_000,
      coingecko_listed: true,
    });
    expect(r.score).toBeGreaterThanOrEqual(15);
  });
});

describe('scoreToken — cgEstablished skips DEX penalties (BLUR case)', () => {
  it('low DEX liquidity on CoinGecko-listed token does not trigger big penalty', () => {
    const blur = scoreToken({
      ...CLEAN,
      liquidity_usd: 20_000,    // low DEX liquidity — trades on Binance/OKX
      volume_24h: 500,          // low DEX volume
      age_hours: 27_000,
      market_cap_usd: 57_000_000,
      coingecko_listed: true,
      is_renounced: false,
      is_mintable: true,
      lp_locked_percent: 0,
    });
    // Should NOT trigger dead-token or large low-liq penalty
    expect(blur.score).toBeLessThan(26); // SAFE
    expect(blur.red_factors.some(f => f.includes('abandoned'))).toBe(false);
    expect(blur.red_factors.some(f => f.includes('Dangerously low'))).toBe(false);
  });

  it('low DEX liquidity on unknown token does trigger full penalty', () => {
    const risky = scoreToken({
      ...CLEAN,
      coingecko_listed: false,
      market_cap_usd: 0,
      liquidity_usd: 3_000,
      holder_count: 100,
      age_hours: 2,
    });
    expect(risky.red_factors.some(f => f.includes('Dangerously low liquidity'))).toBe(true);
    expect(risky.score).toBeGreaterThan(50);
  });
});

describe('scoreToken — no DEX data path', () => {
  it('missing DEX data adds "no trading pairs" flag and not age/liq penalties', () => {
    const r = scoreToken({
      ...CLEAN,
      dex_available: false,
      liquidity_usd: 0,
      age_hours: 0,
      coingecko_listed: false,
      market_cap_usd: 0,
    });
    expect(r.red_factors.some(f => f.includes('No trading pairs found'))).toBe(true);
    expect(r.red_factors.some(f => f.includes('less than 1 hour'))).toBe(false);
    expect(r.red_factors.some(f => f.includes('Dangerously low liquidity'))).toBe(false);
  });

  it('missing DEX but CoinGecko confirmed adds age discount', () => {
    const r = scoreToken({
      ...CLEAN,
      dex_available: false,
      liquidity_usd: 0,
      age_hours: 0,
      market_cap_usd: 200_000_000,
      coingecko_listed: true,
    });
    expect(r.green_factors.some(f => f.includes('Established large-cap'))).toBe(true);
  });
});

describe('scoreToken — uncertainty floor', () => {
  it('score stays ≥10 when completeness <60% and score would be low', () => {
    const r = scoreToken({
      ...CLEAN,
      dex_available: false,
      goplus_available: false,
      coingecko_listed: false,
      contract_info_available: true, // only 15% completeness
    });
    expect(r.score).toBeGreaterThanOrEqual(10);
    expect(r.data_completeness).toBe(15);
  });
});

describe('scoreToken — Solana-specific flags', () => {
  it('mint authority → +20 penalty', () => {
    const base     = scoreToken({ ...BARE, chain: 'solana', goplus_available: false });
    const withMint = scoreToken({ ...BARE, chain: 'solana', goplus_available: false, mint_authority_exists: true });
    expect(withMint.score).toBeGreaterThan(base.score);
    expect(withMint.red_factors.some(f => f.includes('Mint authority'))).toBe(true);
  });

  it('freeze authority → +15 penalty', () => {
    const base       = scoreToken({ ...BARE, chain: 'solana', goplus_available: false });
    const withFreeze = scoreToken({ ...BARE, chain: 'solana', goplus_available: false, freeze_authority_exists: true });
    expect(withFreeze.score).toBeGreaterThan(base.score);
    expect(withFreeze.red_factors.some(f => f.includes('Freeze authority'))).toBe(true);
  });
});

describe('scoreToken — dead token detection', () => {
  it('old token + liquidity + near-zero volume → abandoned flag', () => {
    const r = scoreToken({
      ...CLEAN,
      coingecko_listed: false,
      market_cap_usd: 0,
      age_hours: 2000,
      liquidity_usd: 50_000,
      volume_24h: 200,
    });
    expect(r.red_factors.some(f => f.includes('abandoned'))).toBe(true);
  });

  it('dead token check skipped for cgEstablished tokens', () => {
    const r = scoreToken({
      ...CLEAN,
      age_hours: 2000,
      liquidity_usd: 50_000,
      volume_24h: 200,
      coingecko_listed: true,
      market_cap_usd: 10_000_000,
    });
    expect(r.red_factors.some(f => f.includes('abandoned'))).toBe(false);
  });
});

describe('scoreToken — data completeness', () => {
  it('all data available = 100%', () => {
    const r = scoreToken({ ...CLEAN });
    expect(r.data_completeness).toBe(100);
  });

  it('only DEX data = 40%', () => {
    const r = scoreToken({
      ...CLEAN,
      goplus_available: false,
      contract_info_available: false,
      coingecko_listed: false,
    });
    expect(r.data_completeness).toBe(40);
  });

  it('no data at all = 0%', () => {
    const r = scoreToken({
      ...CLEAN,
      dex_available: false,
      goplus_available: false,
      contract_info_available: false,
      coingecko_listed: false,
    });
    expect(r.data_completeness).toBe(0);
  });
});

describe('scoreToken — risk level thresholds', () => {
  it('score ≤25 = SAFE', () => {
    const r = scoreToken({ ...CLEAN });
    expect(r.risk_level).toBe('SAFE');
    expect(r.score).toBeLessThanOrEqual(25);
  });

  it('score 26–50 = CAUTION', () => {
    // Force into CAUTION via concentration floor
    const r = scoreToken({ ...CLEAN, owner_percent: 42, market_cap_usd: 0, coingecko_listed: false });
    expect(r.risk_level).toBe('CAUTION');
  });
});
