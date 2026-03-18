// Deterministic risk scoring engine — no AI involved
// All scores are rule-based and explainable

export interface ScoringInput {
  chain: string;
  // GoPlus
  goplus_available: boolean;
  is_honeypot: boolean;
  buy_tax: number;
  sell_tax: number;
  is_mintable: boolean;
  is_open_source: boolean;
  is_renounced: boolean;
  lp_locked_percent: number;
  top10_holder_percent: number;
  holder_count: number;
  owner_percent: number;
  // DEX
  dex_available: boolean;
  liquidity_usd: number;
  age_hours: number;
  volume_24h: number;
  buys_24h: number;
  sells_24h: number;
  price_change_24h: number;
  // Contract
  contract_info_available: boolean;
  contract_verified: boolean;
  deployer_age_days: number;
  // Solana-specific
  mint_authority_exists: boolean;
  freeze_authority_exists: boolean;
  is_mutable: boolean;
  // CoinGecko
  market_cap_usd: number;
  coingecko_listed: boolean;
}

export interface ScoringResult {
  score: number;                        // 0–100
  risk_level: 'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
  red_factors: string[];
  green_factors: string[];
  data_completeness: number;            // 0–100 — how much data we had
}

export function scoreToken(input: ScoringInput): ScoringResult {
  let score = 0;
  const red: string[] = [];
  const green: string[] = [];

  // ── Instant RUG: honeypot ──────────────────────────────────────────
  if (input.goplus_available && input.is_honeypot) {
    return {
      score: 95,
      risk_level: 'RUG',
      red_factors: ['Token is a confirmed honeypot — sells are blocked'],
      green_factors: [],
      data_completeness: 100,
    };
  }

  // ── Tax ───────────────────────────────────────────────────────────
  if (input.goplus_available) {
    const sellTax = isNaN(input.sell_tax) ? 0 : input.sell_tax;
    const buyTax  = isNaN(input.buy_tax)  ? 0 : input.buy_tax;
    if (sellTax >= 50)     { score += 55; red.push(`Sell tax: ${sellTax.toFixed(0)}% — functionally a honeypot, sells are nearly impossible`); }
    else if (sellTax > 30) { score += 40; red.push(`Sell tax: ${sellTax.toFixed(0)}% (extremely high)`); }
    else if (sellTax > 10) { score += 25; red.push(`Sell tax: ${sellTax.toFixed(0)}% (high)`); }
    else if (sellTax > 5)  { score += 10; red.push(`Sell tax: ${sellTax.toFixed(0)}% (elevated)`); }
    else if (sellTax === 0) { green.push('Zero sell tax'); }

    if (buyTax >= 50)      { score += 50; red.push(`Buy tax: ${buyTax.toFixed(0)}% — functionally a honeypot, buying loses most funds`); }
    else if (buyTax > 30)  { score += 35; red.push(`Buy tax: ${buyTax.toFixed(0)}% (extremely high)`); }
    else if (buyTax > 10)  { score += 15; red.push(`Buy tax: ${buyTax.toFixed(0)}% (high)`); }
    else if (buyTax > 5)   { score += 5;  red.push(`Buy tax: ${buyTax.toFixed(0)}% (elevated)`); }
  }

  // ── Ownership ────────────────────────────────────────────────────
  if (input.goplus_available) {
    if (input.owner_percent > 30) { score += 25; red.push(`Owner holds ${input.owner_percent.toFixed(1)}% of supply`); }
    else if (input.owner_percent > 10) { score += 15; red.push(`Owner holds ${input.owner_percent.toFixed(1)}% of supply`); }
    else if (input.owner_percent > 5)  { score += 8;  red.push(`Owner holds ${input.owner_percent.toFixed(1)}% of supply`); }

    if (!input.is_renounced) { score += 8; red.push('Ownership not renounced — dev can still modify contract'); }
    else { green.push('Ownership renounced'); }

    if (input.is_mintable) { score += 15; red.push('Contract can mint unlimited new tokens'); }
    else { green.push('Cannot mint new tokens'); }

    if (!input.is_open_source) { score += 10; red.push('Source code not verified on GoPlus'); }
  }

  // ── LP Lock ───────────────────────────────────────────────────────
  if (input.goplus_available) {
    if (input.lp_locked_percent === 0) { score += 15; red.push('Liquidity not locked — dev can rug-pull instantly'); }
    else if (input.lp_locked_percent < 50) { score += 8; red.push(`Only ${input.lp_locked_percent.toFixed(0)}% of LP locked`); }
    else if (input.lp_locked_percent > 80) { score -= 10; green.push(`${input.lp_locked_percent.toFixed(0)}% of LP locked`); }
  }

  // ── Holder concentration ─────────────────────────────────────────
  if (input.goplus_available && input.top10_holder_percent > 0) {
    if (input.top10_holder_percent > 90) { score += 20; red.push(`Top 10 wallets own ${input.top10_holder_percent.toFixed(0)}% of supply`); }
    else if (input.top10_holder_percent > 70) { score += 10; red.push(`Top 10 wallets own ${input.top10_holder_percent.toFixed(0)}% of supply`); }
    else if (input.top10_holder_percent > 50) { score += 5; }
  }

  // ── Holder count ──────────────────────────────────────────────────
  if (input.holder_count > 0) {
    if (input.holder_count > 100_000) { score -= 15; green.push(`${input.holder_count.toLocaleString()} holders — widely distributed`); }
    else if (input.holder_count > 10_000) { score -= 8; green.push(`${input.holder_count.toLocaleString()} holders`); }
    else if (input.holder_count < 50)  { score += 20; red.push(`Only ${input.holder_count} holders`); }
    else if (input.holder_count < 200) { score += 12; red.push(`Low holder count: ${input.holder_count}`); }
    else if (input.holder_count < 1000){ score += 5; }
  }

  // ── Liquidity (check large values first) ──────────────────────────
  // cgEstablished tokens trade primarily on CEXes — low DEX liquidity is expected, not a risk signal
  const cgEstablished = input.coingecko_listed && input.market_cap_usd > 1_000_000;
  if (input.dex_available) {
    if (input.liquidity_usd > 1_000_000)     { score -= 10; green.push(`High liquidity: $${(input.liquidity_usd / 1_000_000).toFixed(1)}M`); }
    else if (input.liquidity_usd > 500_000)  { score -= 5;  green.push(`Strong liquidity: $${(input.liquidity_usd / 1000).toFixed(0)}k`); }
    else if (!cgEstablished && input.liquidity_usd < 5_000)   { score += 30; red.push(`Dangerously low liquidity: $${input.liquidity_usd.toLocaleString()}`); }
    else if (!cgEstablished && input.liquidity_usd < 25_000)  { score += 20; red.push(`Very low liquidity: $${input.liquidity_usd.toLocaleString()}`); }
    else if (!cgEstablished && input.liquidity_usd < 100_000) { score += 10; red.push(`Low liquidity: $${input.liquidity_usd.toLocaleString()}`); }
    else if (cgEstablished  && input.liquidity_usd < 5_000)   { score += 10; red.push(`Low on-chain liquidity: $${input.liquidity_usd.toLocaleString()} (likely trades on CEXes)`); }
    else if (cgEstablished  && input.liquidity_usd < 50_000)  { score += 5;  }
  } else {
    // No DEX pairs found — token may be illiquid or listed on obscure venues
    score += 15; red.push('No trading pairs found on DexScreener — liquidity unknown');
  }

  // ── Age — skip penalty if CoinGecko confirms established token ────
  if (input.dex_available) {
    if (!cgEstablished && input.age_hours < 1)    { score += 25; red.push('Token launched less than 1 hour ago'); }
    else if (!cgEstablished && input.age_hours < 24)  { score += 15; red.push(`Token is only ${input.age_hours.toFixed(0)}h old`); }
    else if (!cgEstablished && input.age_hours < 72)  { score += 8; }
    else if (input.age_hours > 4320) { score -= 15; green.push(`Long-standing token: ${(input.age_hours / 8760).toFixed(1)} years old`); }
    else if (input.age_hours > 720)  { score -= 8;  green.push(`Established token: ${(input.age_hours / 24).toFixed(0)} days old`); }
  } else if (cgEstablished) {
    // CoinGecko confirms it's established even without DEX pairs
    if (input.market_cap_usd > 100_000_000) { score -= 10; green.push('Established large-cap token'); }
    else { score -= 5; green.push('Established token (CoinGecko confirmed)'); }
  }

  // ── Trading patterns ─────────────────────────────────────────────
  if (input.dex_available && input.buys_24h > 0 && input.sells_24h > 0) {
    const sellRatio = input.sells_24h / (input.buys_24h + input.sells_24h);
    if (sellRatio > 0.75) { score += 10; red.push(`Heavy sell pressure: ${input.sells_24h} sells vs ${input.buys_24h} buys`); }
    else if (sellRatio < 0.35) { green.push(`Strong buy pressure: ${input.buys_24h} buys vs ${input.sells_24h} sells`); }
  }
  if (input.dex_available && Math.abs(input.price_change_24h) > 100) { score += 10; red.push(`Extreme 24h price swing: ${input.price_change_24h.toFixed(0)}%`); }

  // ── Dead token detection — old token with no trading activity ─────
  // Skip for cgEstablished: low DEX volume is normal for CEX-dominant tokens (e.g. BLUR on Binance)
  if (input.dex_available && !cgEstablished) {
    if (input.age_hours > 720 && input.liquidity_usd > 10_000 && input.volume_24h < 1_000) {
      score += 25;
      red.push('Essentially no trading volume despite existing liquidity — token may be abandoned or already rugged');
    } else if (input.age_hours > 720 && input.liquidity_usd > 50_000 && input.volume_24h < 10_000) {
      score += 15;
      red.push(`Very low 24h volume ($${input.volume_24h.toLocaleString()}) relative to liquidity — token appears inactive`);
    }
  }

  // ── Contract / deployer ───────────────────────────────────────────
  if (input.contract_info_available) {
    if (!input.contract_verified) { score += 8; red.push('Contract source code not verified on-chain'); }
    else { green.push('Contract source code verified'); }

    // Skip deployer age penalty for large established tokens — Etherscan often can't trace very old deployer wallets
    const skipDeployerCheck = cgEstablished && input.market_cap_usd > 50_000_000;
    if (!skipDeployerCheck) {
      if (input.deployer_age_days === 0) { score += 20; red.push('Deployer wallet has no prior transaction history'); }
      else if (input.deployer_age_days < 7)  { score += 20; red.push(`Deployer wallet only ${input.deployer_age_days} days old`); }
      else if (input.deployer_age_days < 30) { score += 10; red.push(`Deployer wallet ${input.deployer_age_days} days old`); }
      else if (input.deployer_age_days < 90) { score += 5; }
    }
    if (input.deployer_age_days > 365) { score -= 5; green.push(`Deployer wallet ${input.deployer_age_days} days old`); }
  }

  // ── Solana-specific ───────────────────────────────────────────────
  if (input.chain === 'solana') {
    if (input.mint_authority_exists)   { score += 20; red.push('Mint authority not revoked — dev can create new tokens'); }
    else if (!input.mint_authority_exists && input.is_mutable === false) {
      green.push('Mint authority revoked and contract immutable');
    }
    if (input.freeze_authority_exists) { score += 15; red.push('Freeze authority exists — dev can freeze wallets'); }
    if (input.is_mutable)              { score += 5;  red.push('Token metadata is mutable'); }
    else                               { green.push('Token metadata is immutable'); }
  }

  // ── CoinGecko market data ─────────────────────────────────────────
  // Cap CoinGecko discount when owner concentration is dangerously high (>30%)
  // A $300M token where one wallet holds 44% is still highly risky
  const highConcentration = input.goplus_available && input.owner_percent > 30;
  if (input.coingecko_listed) {
    if (input.market_cap_usd > 100_000_000) {
      const discount = highConcentration ? 8 : 20;
      score -= discount;
      green.push(`Large-cap token: $${(input.market_cap_usd / 1_000_000).toFixed(0)}M market cap`);
    } else if (input.market_cap_usd > 10_000_000) {
      const discount = highConcentration ? 4 : 12;
      score -= discount;
      green.push(`Mid-cap: $${(input.market_cap_usd / 1_000_000).toFixed(1)}M market cap`);
    } else if (input.market_cap_usd > 1_000_000) {
      score -= 5;
      green.push(`Listed on CoinGecko: $${(input.market_cap_usd / 1_000_000).toFixed(1)}M market cap`);
    }
  }

  // ── Concentration floor — extreme single-wallet ownership overrides discounts ──
  if (input.goplus_available) {
    if (input.owner_percent > 40 && score < 26) { score = 26; } // Force CAUTION minimum
    else if (input.owner_percent > 30 && score < 15) { score = 15; }
  }

  // ── Uncertainty floor — missing data means we can't be fully certain ──
  let completenessCheck = 0;
  if (input.dex_available)           completenessCheck += 40;
  if (input.goplus_available)        completenessCheck += 35;
  if (input.contract_info_available) completenessCheck += 15;
  if (input.coingecko_listed)        completenessCheck += 10;
  // When data is < 60% complete, floor the score at 10 (can't claim SAFE with partial data)
  if (completenessCheck < 60 && score < 10) score = 10;

  // ── Clamp and map ────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, Math.round(score)));

  const risk_level =
    score <= 25 ? 'SAFE' :
    score <= 50 ? 'CAUTION' :
    score <= 75 ? 'DANGER' : 'RUG';

  // ── Data completeness ────────────────────────────────────────────
  let completeness = 0;
  if (input.dex_available)           completeness += 40;
  if (input.goplus_available)        completeness += 35;
  if (input.contract_info_available) completeness += 15;
  if (input.coingecko_listed)        completeness += 10;
  completeness = Math.min(100, completeness);

  return {
    score,
    risk_level,
    red_factors: red.slice(0, 8),
    green_factors: green.slice(0, 5),
    data_completeness: completeness,
  };
}
