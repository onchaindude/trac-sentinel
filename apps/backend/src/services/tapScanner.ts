import { logger } from '../logger.js';
import {
  getDeployment, getMintTokensLeft, getHoldersLength, getHolders,
  getBalance, getAccountAuthList, getTickerTradesLength,
} from './tapApi.js';

export interface TapTopHolder {
  address:      string;
  balance:      string;
  transferable: string;
  pct:          number;  // % of max supply
}

export interface TapScanResult {
  ticker:             string;
  maxSupply:          string;
  mintLimit:          string;    // per-mint cap
  deployedAt:         number;    // unix seconds
  deployerAddress:    string;
  deployBlock:        number;
  inscriptionId:      string;
  mintTokensLeft:     string;
  mintProgressPct:    number;    // 0–100
  fullyMinted:        boolean;
  holderCount:        number;
  topHolders:         TapTopHolder[];
  top10HolderPct:     number;
  deployerHoldsPct:   number;
  hasTokenAuth:       boolean;
  tokenAuthCount:     number;
  tokenAuthCoversAll: boolean;   // empty auth array = authority over ALL tickers
  tradeCount:         number;
  risks:              string[];
  positives:          string[];
  score:              number;
  risk_level:         'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
}

// TAP scanning is always available — uses public API at tap.trac.network
// Local tap-reader (TAP_READER_URL) is used as fallback if set.
export function tapReaderAvailable(): boolean {
  return true;
}

export async function scanTapToken(ticker: string): Promise<TapScanResult | null> {
  const tick = ticker.toLowerCase();

  // ── 1. Deployment info ────────────────────────────────────────────
  const deployment = await getDeployment(tick);
  if (!deployment) {
    logger.warn({ ticker }, 'TAP deployment not found');
    return null;
  }

  const maxSupply      = String(deployment.max ?? '0');
  const mintLimit      = String(deployment.lim ?? '0');
  const deployedAt     = Number(deployment.ts  ?? 0);
  const deployerAddr   = String(deployment.addr ?? '');
  const deployBlock    = Number(deployment.blck ?? 0);
  const inscriptionId  = String(deployment.ins  ?? '');

  // ── 2. Mint progress ──────────────────────────────────────────────
  const mintLeft = await getMintTokensLeft(tick) ?? '0';

  let mintProgressPct = 0;
  let fullyMinted     = false;
  try {
    const maxBig    = BigInt(maxSupply || '0');
    const leftBig   = BigInt(mintLeft  || '0');
    fullyMinted     = leftBig === BigInt(0);
    if (maxBig > BigInt(0)) {
      const mintedBig = maxBig > leftBig ? maxBig - leftBig : BigInt(0);
      mintProgressPct = Number(mintedBig * BigInt(10000) / maxBig) / 100;
    }
  } catch { /* BigInt parse error — keep defaults */ }

  // ── 3. Holders ───────────────────────────────────────────────────
  const holderCount = await getHoldersLength(tick);
  const rawHolders  = await getHolders(tick, 0, 10);

  let top10HolderPct = 0;
  const topHolders: TapTopHolder[] = rawHolders.map(h => {
    let pct = 0;
    try {
      const maxBig = BigInt(maxSupply || '0');
      const balBig = BigInt(h.balance  || '0');
      if (maxBig > BigInt(0)) pct = Number(balBig * BigInt(10000) / maxBig) / 100;
    } catch { /* ignore */ }
    top10HolderPct += pct;
    return { address: h.address, balance: h.balance, transferable: h.transferable ?? '0', pct };
  });

  // ── 4. Deployer holdings ──────────────────────────────────────────
  let deployerHoldsPct = 0;
  if (deployerAddr) {
    const deployerBal = await getBalance(deployerAddr, tick);
    try {
      const maxBig = BigInt(maxSupply   || '0');
      const balBig = BigInt(deployerBal || '0');
      if (maxBig > BigInt(0)) deployerHoldsPct = Number(balBig * BigInt(10000) / maxBig) / 100;
    } catch { /* ignore */ }
  }

  // ── 5. Token-auth check ───────────────────────────────────────────
  let hasTokenAuth       = false;
  let tokenAuthCount     = 0;
  let tokenAuthCoversAll = false;
  if (deployerAddr) {
    const authList = await getAccountAuthList(deployerAddr, 0, 20);
    tokenAuthCount     = authList.length;
    hasTokenAuth       = tokenAuthCount > 0;
    tokenAuthCoversAll = authList.some(a => !a.auth || a.auth.length === 0);
  }

  // ── 6. Trading activity ───────────────────────────────────────────
  const tradeCount = await getTickerTradesLength(tick);

  // ── 7. Risk signals & scoring ─────────────────────────────────────
  const risks:     string[] = [];
  const positives: string[] = [];

  const ageHours = deployedAt > 0 ? (Date.now() / 1000 - deployedAt) / 3600 : 0;
  let score = 0;  // 0 = safest, 100 = riskiest

  // Holder concentration
  if (top10HolderPct > 80) {
    risks.push(`Extreme holder concentration — top 10 wallets hold ${top10HolderPct.toFixed(1)}% of supply`);
    score += 30;
  } else if (top10HolderPct > 50) {
    risks.push(`High holder concentration — top 10 wallets control ${top10HolderPct.toFixed(1)}%`);
    score += 15;
  } else if (top10HolderPct > 0) {
    positives.push(`Distributed supply — top 10 hold only ${top10HolderPct.toFixed(1)}%`);
  }

  // Deployer holdings
  if (deployerHoldsPct > 20) {
    risks.push(`Deployer holds ${deployerHoldsPct.toFixed(1)}% of supply — large potential dump risk`);
    score += 25;
  } else if (deployerHoldsPct > 5) {
    risks.push(`Deployer holds ${deployerHoldsPct.toFixed(1)}% — monitor for sell activity`);
    score += 10;
  } else {
    positives.push('Deployer holds minimal supply — low dump risk');
  }

  // Token-auth authority
  if (tokenAuthCoversAll) {
    risks.push('Deployer holds token-auth authority over ALL TAP tickers — can issue special redemptions for any token');
    score += 20;
  } else if (hasTokenAuth) {
    risks.push(`Deployer has ${tokenAuthCount} active token-auth inscription(s) — can issue signed redemptions for this token`);
    score += 10;
  } else {
    positives.push('No token-auth authority set — deployer cannot issue special redemptions');
  }

  // Mint status
  if (!fullyMinted) {
    risks.push(`Minting still open — ${mintProgressPct.toFixed(1)}% complete, new tokens can dilute supply`);
    score += 10;
  } else {
    positives.push('Fully minted — supply is fixed, no new tokens can be created');
  }

  // Age
  if (ageHours < 24) {
    risks.push(`Very new token — deployed only ${Math.floor(ageHours)}h ago, no track record`);
    score += 10;
  } else if (ageHours > 24 * 30) {
    positives.push(`Established token — deployed over ${Math.floor(ageHours / 24)} days ago`);
  }

  // Liquidity / trading
  if (tradeCount === 0) {
    risks.push('No trading activity recorded on TAP Protocol');
    score += 5;
  } else if (tradeCount > 500) {
    positives.push(`Highly active — ${tradeCount.toLocaleString()} trades on TAP Protocol`);
  } else if (tradeCount > 50) {
    positives.push(`Active trading — ${tradeCount.toLocaleString()} trades on TAP Protocol`);
  }

  // Holders
  if (holderCount > 5000) {
    positives.push(`Large holder base — ${holderCount.toLocaleString()} unique holders`);
  } else if (holderCount > 500) {
    positives.push(`Good distribution — ${holderCount.toLocaleString()} holders`);
  } else if (holderCount < 50 && holderCount > 0) {
    risks.push(`Very few holders (${holderCount}) — extremely illiquid and concentrated`);
    score += 10;
  }

  score = Math.min(100, score);
  // Boundaries match EVM scoring.ts: 0-25=SAFE, 26-50=CAUTION, 51-75=DANGER, 76+=RUG
  const risk_level: TapScanResult['risk_level'] =
    score <= 25 ? 'SAFE' :
    score <= 50 ? 'CAUTION' :
    score <= 75 ? 'DANGER' : 'RUG';

  return {
    ticker: String(deployment.tick ?? ticker).toUpperCase(),
    maxSupply, mintLimit, deployedAt, deployerAddress: deployerAddr,
    deployBlock, inscriptionId, mintTokensLeft: mintLeft,
    mintProgressPct, fullyMinted, holderCount, topHolders,
    top10HolderPct, deployerHoldsPct,
    hasTokenAuth, tokenAuthCount, tokenAuthCoversAll,
    tradeCount, risks, positives, score, risk_level,
  };
}
