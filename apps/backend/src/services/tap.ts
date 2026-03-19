import { getDeployment } from './tapApi.js';

// Check if a ticker exists on TAP Protocol — uses public API, no local node needed
export async function checkTapProtocol(ticker: string): Promise<boolean> {
  if (!ticker) return false;
  try {
    const deployment = await getDeployment(ticker.toLowerCase());
    return !!deployment;
  } catch {
    return false;
  }
}

export function tapReaderAvailable(): boolean {
  return true; // always available via public API
}
