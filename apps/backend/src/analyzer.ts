import { checkTokenSecurity }  from './services/goplus.js';
import { getDexData }           from './services/dexscreener.js';
import { getContractInfo, getWalletInfo } from './services/etherscan.js';
import { getTokenMetadata, getTokenOwners } from './services/ankr.js';
import { getSolanaTokenInfo, getSolanaHolders } from './services/helius.js';
import { generateNarrative, type SentinelVerdict } from './services/ollama.js';
import { getCoinGeckoData, type CoinGeckoData } from './services/coinpaprika.js';
import { scoreToken, type ScoringResult } from './scoring.js';
import { getLatestResultForToken, getFreshPeerResult } from './db.js';
import { checkTapProtocol } from './services/tap.js';
import { tracNetwork } from './peer/tracNetwork.js';
import { scanTapToken, type TapScanResult } from './services/tapScanner.js';
import { logger } from './logger.js';
import { withRetry } from './retry.js';

// How long a cached result is considered fresh (1 hour)
const CACHE_TTL_MS = 60 * 60 * 1000;

export type Chain = 'eth' | 'bsc' | 'polygon' | 'arbitrum' | 'base' | 'optimism' | 'solana' | 'tap';

export interface AnalysisResult {
  id:           string;
  address:      string;
  chain:        Chain;
  ts:           number;
  status:       'analyzing' | 'complete' | 'error';
  source:       'live' | 'cache' | 'p2p';  // where this result came from
  node_id?:     string;                    // sender pubkey when source === 'p2p'
  name:         string;
  symbol:       string;
  // Raw data
  goplus:       Awaited<ReturnType<typeof checkTokenSecurity>>;
  dex:          Awaited<ReturnType<typeof getDexData>>;
  coingecko:    CoinGeckoData | null;
  scoring:      ScoringResult | null;
  tap_protocol: boolean;           // true = token also exists on Bitcoin via TAP Protocol
  tap_scan:     TapScanResult | null;  // populated when chain === 'tap'
  // Verdict
  verdict:      SentinelVerdict | null;
  // Progress
  steps:        AnalysisStep[];
  error?:       string;
}

export interface AnalysisStep {
  name:   string;
  status: 'pending' | 'running' | 'done' | 'failed';
  data?:  string;
}

export async function analyzeToken(
  address: string,
  chain: Chain,
  onProgress: (result: Partial<AnalysisResult>) => void
): Promise<AnalysisResult> {
  // ── TAP Protocol path (Bitcoin Ordinals tokens) ───────────────────
  if (chain === 'tap') {
    return analyzeTapToken(address, onProgress);
  }

  // Peer mode: no Etherscan key = can't do live scans
  const isPeerMode = !process.env.ETHERSCAN_API_KEY;

  // Check DB for a fresh result (survives restarts, works for both live and p2p)
  const dbCached = getFreshPeerResult(address, chain, CACHE_TTL_MS);
  if (dbCached) {
    const fresh = { ...dbCached, source: (dbCached.source === 'p2p' ? 'p2p' : 'cache') as AnalysisResult['source'] };
    onProgress(fresh);
    return fresh;
  }

  if (isPeerMode) {
    const errResult: AnalysisResult = {
      id: `${chain}:${address}:${Date.now()}`,
      address, chain, ts: Date.now(),
      status: 'error', source: 'p2p',
      name: address.slice(0, 8) + '…', symbol: '???',
      goplus: null, dex: null, coingecko: null, scoring: null,
      tap_protocol: false, tap_scan: null, verdict: null,
      steps: [],
      error: 'Peer mode — live scanning requires API keys (ETHERSCAN_API_KEY, GOPLUS_APP_KEY). This node is connected to the Trac P2P Network and will display results automatically when another Full Node scans this token. To enable live scanning, add your API keys to the .env file and restart.',
    };
    onProgress(errResult);
    return errResult;
  }

  const id    = `${chain}:${address}:${Date.now()}`;
  const steps: AnalysisStep[] = [
    { name: 'Security scan (GoPlus)',   status: 'pending' },
    { name: 'DEX data (DexScreener)',   status: 'pending' },
    { name: 'Contract & deployer info', status: 'pending' },
    { name: 'Token metadata',           status: 'pending' },
    { name: 'Market data (CoinPaprika)', status: 'pending' },
    { name: 'Risk scoring engine',      status: 'pending' },
    { name: 'AI narrative (Ollama)',    status: 'pending' },
  ];

  const update = (patch: Partial<AnalysisResult>) =>
    onProgress({ id, address, chain, ts: Date.now(), steps, ...patch });

  update({ status: 'analyzing' });

  // ── Step 1: GoPlus ───────────────────────────────────────────────
  steps[0]!.status = 'running'; update({});
  const goplus = await withRetry(() => checkTokenSecurity(address, chain), { label: 'GoPlus' }).catch(() => null);
  steps[0]!.status = goplus ? 'done' : 'failed';
  steps[0]!.data   = goplus
    ? `${goplus.is_honeypot ? '🚨 HONEYPOT' : '✓'} tax: ${isNaN(goplus.buy_tax) ? '?' : goplus.buy_tax.toFixed(0)}%/${isNaN(goplus.sell_tax) ? '?' : goplus.sell_tax.toFixed(0)}%`
    : chain === 'solana' ? 'Not supported on Solana' : 'GoPlus unavailable — honeypot/tax data missing';
  const name   = goplus?.token_name   ?? '';
  const symbol = goplus?.token_symbol ?? '';
  update({ goplus });

  // ── Step 2: DexScreener ──────────────────────────────────────────
  steps[1]!.status = 'running'; update({});
  const dex = await withRetry(() => getDexData(address), { label: 'DexScreener' }).catch(() => null);
  steps[1]!.status = dex ? 'done' : 'failed';
  steps[1]!.data   = dex
    ? `$${(dex.totalLiquidityUsd / 1000).toFixed(0)}k liq · ${dex.ageHours.toFixed(0)}h old`
    : 'No trading pairs found on DexScreener';
  update({ dex });

  // ── Step 3: Contract + deployer ──────────────────────────────────
  steps[2]!.status = 'running'; update({});
  let contractVerified      = false;
  let deployerAgeDays       = 0;
  let contractInfoAvailable = false;
  let mintAuthorityExists   = false;
  let freezeAuthorityExists = false;
  let isMutable             = false;

  if (chain !== 'solana') {
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
    const [contract, deployer] = await Promise.all([
      getContractInfo(address, chain),
      goplus?.creator_address && goplus.creator_address !== ZERO_ADDR
        ? getWalletInfo(goplus.creator_address, chain)
        : Promise.resolve(null),
    ]);
    contractVerified      = contract?.verified ?? false;
    deployerAgeDays       = deployer?.firstTxAge ?? 0;
    contractInfoAvailable = !!contract;
    steps[2]!.data = `${contractVerified ? '✓ verified' : '✗ unverified'} · deployer ${deployerAgeDays}d old`;
  } else {
    const solInfo = await getSolanaTokenInfo(address);
    if (solInfo) {
      mintAuthorityExists   = !!solInfo.mintAuthority;
      freezeAuthorityExists = !!solInfo.freezeAuthority;
      isMutable             = solInfo.isMutable;
      contractInfoAvailable = true;
      steps[2]!.data = `mint: ${mintAuthorityExists ? '⚠ active' : '✓ revoked'} · freeze: ${freezeAuthorityExists ? '⚠ active' : '✓ none'}`;
    } else {
      steps[2]!.data = 'No data';
    }
  }
  steps[2]!.status = 'done'; update({});

  // ── Step 4: Token metadata + holders ────────────────────────────
  steps[3]!.status = 'running'; update({});
  let holderCount = goplus?.holder_count ?? 0;

  if (chain !== 'solana') {
    const [meta, owners] = await Promise.all([
      getTokenMetadata(address, chain),
      getTokenOwners(address, chain),
    ]);
    if (!holderCount && owners.count > 0) holderCount = owners.count;
    steps[3]!.data = meta ? `${meta.name} · ${holderCount.toLocaleString()} holders` : 'Limited data';
  } else {
    const [solHolders] = await Promise.all([getSolanaHolders(address)]);
    if (solHolders > 0) holderCount = solHolders;
    steps[3]!.data = holderCount > 0 ? `${holderCount.toLocaleString()} holders` : 'Holder data unavailable';
  }
  steps[3]!.status = 'done'; update({});

  // ── Step 5: CoinGecko ─────────────────────────────────────────────
  steps[4]!.status = 'running'; update({});
  const coingecko = await withRetry(() => getCoinGeckoData(address, chain), { label: 'CoinGecko' }).catch(() => null);
  steps[4]!.status = coingecko ? 'done' : 'failed';
  steps[4]!.data   = coingecko
    ? `$${(coingecko.market_cap_usd / 1_000_000).toFixed(1)}M mcap · ${coingecko.listed_on_exchanges.slice(0, 2).join(', ')}`
    : 'Not listed on CoinGecko';
  update({ coingecko });

  // ── Step 6: Rule-based scoring ───────────────────────────────────
  steps[5]!.status = 'running'; update({});
  const scoring = scoreToken({
    chain,
    dex_available:        !!dex,
    goplus_available:     !!goplus,
    is_honeypot:          goplus?.is_honeypot       ?? false,
    buy_tax:              goplus?.buy_tax            ?? 0,
    sell_tax:             goplus?.sell_tax           ?? 0,
    is_mintable:          goplus?.is_mintable        ?? false,
    is_open_source:       goplus?.is_open_source     ?? false,
    is_renounced:         goplus?.is_renounced       ?? false,
    lp_locked_percent:    goplus?.lp_locked_percent  ?? 0,
    top10_holder_percent: goplus?.top10_holder_percent ?? 0,
    holder_count:         holderCount,
    owner_percent:        goplus?.owner_percent      ?? 0,
    liquidity_usd:        dex?.totalLiquidityUsd     ?? 0,
    age_hours:            dex?.ageHours              ?? 0,
    volume_24h:           dex?.bestPair?.volume.h24  ?? 0,
    buys_24h:             dex?.buysSells24h.buys     ?? 0,
    sells_24h:            dex?.buysSells24h.sells    ?? 0,
    price_change_24h:     dex?.priceChange24h        ?? 0,
    contract_info_available: contractInfoAvailable,
    contract_verified:    contractVerified,
    deployer_age_days:    deployerAgeDays,
    mint_authority_exists:   mintAuthorityExists,
    freeze_authority_exists: freezeAuthorityExists,
    is_mutable:           isMutable,
    market_cap_usd:       coingecko?.market_cap_usd ?? 0,
    coingecko_listed:     !!coingecko,
  });
  steps[5]!.status = 'done';
  steps[5]!.data   = `${scoring.risk_level} · score ${scoring.score}/100 · ${scoring.data_completeness}% data`;
  update({ scoring });

  // ── Step 7: AI narrative ─────────────────────────────────────────
  steps[6]!.status = 'running'; update({});
  const narrative = await generateNarrative({
    chain,
    risk_score:        scoring.score,
    risk_level:        scoring.risk_level,
    red_factors:       scoring.red_factors,
    green_factors:     scoring.green_factors,
    data_completeness: scoring.data_completeness,
    liquidity_usd:     dex?.totalLiquidityUsd ?? 0,
    age_hours:         dex?.ageHours ?? 0,
    holder_count:      holderCount,
    market_cap_usd:    coingecko?.market_cap_usd ?? 0,
  });

  const resolvedName   = name   || coingecko?.name   || dex?.bestPair?.baseToken.name   || 'Unknown';
  const resolvedSymbol = symbol || coingecko?.symbol || dex?.bestPair?.baseToken.symbol || '???';

  // TAP Protocol cross-chain badge is only meaningful for TAP chain scans —
  // ticker symbols are not unique across chains so cross-checking EVM/Solana is misleading
  const tap_protocol = false;

  const verdict: SentinelVerdict = {
    risk_score:  scoring.score,
    risk_level:  scoring.risk_level,
    confidence:  scoring.data_completeness,
    red_flags:   scoring.red_factors,
    green_flags: scoring.green_factors,
    summary:     narrative?.summary   ?? `Risk score ${scoring.score}/100 — ${scoring.risk_level}`,
    reasoning:   narrative?.reasoning ?? scoring.red_factors.slice(0, 2).join('. '),
  };

  steps[6]!.status = narrative ? 'done' : 'failed';
  steps[6]!.data   = narrative ? `${scoring.risk_level} · ${narrative.summary.slice(0, 50)}…` : 'Narrative skipped (Ollama offline)';
  update({ verdict });

  const result: AnalysisResult = {
    id, address, chain,
    ts:     Date.now(),
    status: 'complete',
    source: 'live',
    name:   resolvedName,
    symbol: resolvedSymbol,
    goplus, dex, coingecko, scoring, tap_protocol, tap_scan: null, verdict, steps,
  };

  // Share result with Trac Network peers
  tracNetwork.publish(result);

  return result;
}

// ── TAP Protocol token analysis ───────────────────────────────────────────────
async function analyzeTapToken(
  ticker: string,
  onProgress: (result: Partial<AnalysisResult>) => void
): Promise<AnalysisResult> {
  const id = `tap:${ticker.toLowerCase()}:${Date.now()}`;

  // Check DB cache
  const dbCached = getLatestResultForToken(ticker.toLowerCase(), 'tap');
  if (dbCached && Date.now() - dbCached.ts < CACHE_TTL_MS) {
    const fresh = { ...dbCached, source: 'cache' as const };
    onProgress(fresh);
    return fresh;
  }

  const steps: AnalysisStep[] = [
    { name: 'TAP deployment info',   status: 'pending' },
    { name: 'Holder analysis',        status: 'pending' },
    { name: 'Token-auth check',       status: 'pending' },
    { name: 'Trading activity',       status: 'pending' },
    { name: 'Risk scoring',           status: 'pending' },
    { name: 'AI narrative (Ollama)',  status: 'pending' },
  ];

  const update = (patch: Partial<AnalysisResult>) =>
    onProgress({ id, address: ticker.toLowerCase(), chain: 'tap', ts: Date.now(), steps, ...patch });

  update({ status: 'analyzing' });

  // Steps 1-4 all run inside scanTapToken — emit progress updates
  steps[0]!.status = 'running'; update({});
  const tap_scan = await scanTapToken(ticker);
  steps[0]!.status = tap_scan ? 'done' : 'failed';
  steps[0]!.data   = tap_scan
    ? `${tap_scan.ticker} · max ${Number(tap_scan.maxSupply).toLocaleString()} · by ${tap_scan.deployerAddress.slice(0, 10)}…`
    : 'Ticker not found in TAP index';
  update({});

  if (!tap_scan) {
    const errResult: AnalysisResult = {
      id, address: ticker.toLowerCase(), chain: 'tap',
      ts: Date.now(), status: 'error', source: 'live',
      name: ticker.toUpperCase(), symbol: ticker.toUpperCase(),
      goplus: null, dex: null, coingecko: null, scoring: null,
      tap_protocol: true, tap_scan: null, verdict: null, steps,
      error: `"${ticker.toUpperCase()}" was not found in the TAP index. If this token was just deployed, wait ~10 minutes for the next Bitcoin block confirmation and try again.`,
    };
    onProgress(errResult);
    return errResult;
  }

  steps[1]!.status = 'done';
  steps[1]!.data   = `${tap_scan.holderCount.toLocaleString()} holders · top10: ${tap_scan.top10HolderPct.toFixed(1)}%`;
  steps[2]!.status = 'done';
  steps[2]!.data   = tap_scan.hasTokenAuth
    ? `${tap_scan.tokenAuthCount} auth inscription(s)${tap_scan.tokenAuthCoversAll ? ' — covers ALL tickers' : ''}`
    : 'No token-auth authority';
  steps[3]!.status = 'done';
  steps[3]!.data   = `${tap_scan.tradeCount.toLocaleString()} trades · ${tap_scan.mintProgressPct.toFixed(1)}% minted`;
  update({});

  // Step 5: Risk score (already computed in scanTapToken)
  steps[4]!.status = 'running'; update({});
  steps[4]!.status = 'done';
  steps[4]!.data   = `${tap_scan.risk_level} · ${tap_scan.score}/100`;
  update({});

  // Step 6: AI narrative
  steps[5]!.status = 'running'; update({});
  const narrative = await generateNarrative({
    chain: 'tap' as Chain,
    risk_score:        tap_scan.score,
    risk_level:        tap_scan.risk_level,
    red_factors:       tap_scan.risks,
    green_factors:     tap_scan.positives,
    data_completeness: 80,
    liquidity_usd:     0,
    age_hours:         (Date.now() / 1000 - tap_scan.deployedAt) / 3600,
    holder_count:      tap_scan.holderCount,
    market_cap_usd:    0,
  });
  steps[5]!.status = narrative ? 'done' : 'failed';
  steps[5]!.data   = narrative ? `${tap_scan.risk_level} · ${narrative.summary.slice(0, 50)}…` : 'Narrative skipped';

  const verdict: SentinelVerdict = {
    risk_score:  tap_scan.score,
    risk_level:  tap_scan.risk_level,
    confidence:  80,
    red_flags:   tap_scan.risks,
    green_flags: tap_scan.positives,
    summary:     narrative?.summary   ?? `TAP token ${tap_scan.ticker} — risk score ${tap_scan.score}/100`,
    reasoning:   narrative?.reasoning ?? tap_scan.risks.slice(0, 2).join('. '),
  };
  update({ verdict });

  const result: AnalysisResult = {
    id, address: ticker.toLowerCase(), chain: 'tap',
    ts: Date.now(), status: 'complete', source: 'live',
    name: tap_scan.ticker, symbol: tap_scan.ticker,
    goplus: null, dex: null, coingecko: null, scoring: null,
    tap_protocol: true, tap_scan, verdict, steps,
  };

  // Share result with Trac Network peers
  tracNetwork.publish(result);

  return result;
}
