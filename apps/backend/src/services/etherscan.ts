import axios from 'axios';

const API_KEY = process.env.ETHERSCAN_API_KEY!;

// Etherscan V2 supports all EVM chains with one key
const CHAIN_URLS: Record<string, string> = {
  eth:       'https://api.etherscan.io/v2/api?chainid=1',
  bsc:       'https://api.etherscan.io/v2/api?chainid=56',
  polygon:   'https://api.etherscan.io/v2/api?chainid=137',
  arbitrum:  'https://api.etherscan.io/v2/api?chainid=42161',
  base:      'https://api.etherscan.io/v2/api?chainid=8453',
  optimism:  'https://api.etherscan.io/v2/api?chainid=10',
  avalanche: 'https://api.etherscan.io/v2/api?chainid=43114',
};

function baseUrl(chain: string): string {
  return CHAIN_URLS[chain] ?? CHAIN_URLS['eth']!;
}

async function call(chain: string, params: Record<string, string>): Promise<unknown> {
  const url = baseUrl(chain);
  const qs = new URLSearchParams({ ...params, apikey: API_KEY }).toString();
  const res = await axios.get(`${url}&${qs}`, { timeout: 10000 });
  return res.data?.result;
}

export interface ContractInfo {
  verified: boolean;
  contractName: string;
  compilerVersion: string;
  sourceCode: string;
  abi: string;
}

export interface WalletInfo {
  firstTxAge: number;   // days
  txCount: number;
  ethBalance: string;
  isContract: boolean;
}

export async function getContractInfo(address: string, chain: string): Promise<ContractInfo | null> {
  try {
    const result = await call(chain, {
      module: 'contract',
      action: 'getsourcecode',
      address,
    }) as Array<Record<string, string>>;

    if (!result?.[0]) return null;
    const r = result[0];

    return {
      verified:       r.ABI !== 'Contract source code not verified',
      contractName:   r.ContractName ?? '',
      compilerVersion: r.CompilerVersion ?? '',
      sourceCode:     r.SourceCode ?? '',
      abi:            r.ABI ?? '',
    };
  } catch { return null; }
}

export async function getWalletInfo(address: string, chain: string): Promise<WalletInfo | null> {
  try {
    const [txList, balance] = await Promise.all([
      call(chain, { module: 'account', action: 'txlist', address, sort: 'asc', page: '1', offset: '5' }),
      call(chain, { module: 'account', action: 'balance', address, tag: 'latest' }),
    ]) as [Array<Record<string, string>>, string];

    const firstTx = txList?.[0];
    const firstTxAge = firstTx?.timeStamp
      ? (Date.now() / 1000 - parseInt(firstTx.timeStamp, 10)) / 86400
      : 0;

    return {
      firstTxAge: Math.floor(firstTxAge),
      txCount:    txList?.length ?? 0,
      ethBalance: balance ?? '0',
      isContract: false,
    };
  } catch { return null; }
}

