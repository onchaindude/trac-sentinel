import axios from 'axios';
import { logger } from '../logger.js';

// Optional — set TAP_READER_URL in .env to enable TAP Protocol detection
// e.g. TAP_READER_URL=http://localhost:5099
const TAP_READER_URL = process.env.TAP_READER_URL ?? '';

export async function checkTapProtocol(ticker: string): Promise<boolean> {
  if (!TAP_READER_URL || !ticker) return false;
  try {
    const res = await axios.get(
      `${TAP_READER_URL}/getDeployment/${encodeURIComponent(ticker.toLowerCase())}`,
      { timeout: 3000 },
    );
    // tap-reader wraps result in { result } — a non-null result means token exists
    return res.status === 200 && !!res.data?.result;
  } catch {
    // TAP Reader not available or token not found — fail silently
    return false;
  }
}

export function tapReaderAvailable(): boolean {
  return !!TAP_READER_URL;
}
