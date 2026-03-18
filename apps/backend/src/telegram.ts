import { Bot, InlineKeyboard } from 'grammy';
import { logger } from './logger.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Chain detection patterns
const EVM_RE    = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TAP_RE    = /^[a-zA-Z0-9]{3,32}$/;

const CHAIN_KEYWORDS: Record<string, string> = {
  eth: 'eth', ethereum: 'eth',
  bsc: 'bsc', bnb: 'bsc', binance: 'bsc',
  polygon: 'polygon', matic: 'polygon',
  arbitrum: 'arbitrum', arb: 'arbitrum',
  base: 'base',
  optimism: 'optimism', op: 'optimism',
  solana: 'solana', sol: 'solana',
  tap: 'tap', bitcoin: 'tap', btc: 'tap',
};

const RISK_EMOJI: Record<string, string> = {
  SAFE: '✅', CAUTION: '⚠️', DANGER: '🔴', RUG: '☠️',
};

function detectChain(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [kw, chain] of Object.entries(CHAIN_KEYWORDS)) {
    if (lower.includes(kw)) return chain;
  }
  return null;
}

function detectAddress(text: string): { address: string; chain: string } | null {
  const words = text.trim().split(/\s+/);

  // Check if there's an explicit chain hint in the message
  const chainHint = detectChain(text);

  for (const word of words) {
    if (EVM_RE.test(word)) {
      return { address: word, chain: chainHint ?? 'eth' };
    }
    if (SOLANA_RE.test(word) && word.length > 40) {
      return { address: word, chain: 'solana' };
    }
  }

  // TAP ticker — only if explicitly mentioned or "tap" in message
  if (chainHint === 'tap') {
    for (const word of words) {
      if (TAP_RE.test(word) && !Object.keys(CHAIN_KEYWORDS).includes(word.toLowerCase())) {
        return { address: word, chain: 'tap' };
      }
    }
  }

  return null;
}

async function requestScan(address: string, chain: string): Promise<string> {
  const base = process.env.SENTINEL_URL ?? 'http://localhost:4000';
  const res = await fetch(`${base}/api/analyze`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ address, chain }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Server error ${res.status}`);
  }
  // Scan queued — poll for result
  return pollResult(address, chain);
}

async function pollResult(address: string, chain: string, maxWait = 90_000): Promise<string> {
  const base  = process.env.SENTINEL_URL ?? 'http://localhost:4000';
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`${base}/api/results/${chain}/${encodeURIComponent(address.toLowerCase())}`);
    if (!res.ok) continue;
    const raw = await res.json().catch(() => null);
    if (!raw || typeof raw !== 'object') continue;
    const data = raw as { status?: string; verdict?: { risk_level: string; risk_score: number; summary: string; reasoning: string; red_flags: string[]; green_flags: string[] }; name?: string; symbol?: string; error?: string; id?: string };

    if (data.status === 'error') {
      return `❌ *Scan Failed*\n${data.error ?? 'Unknown error'}`;
    }

    if (data.status === 'complete' && data.verdict) {
      const v      = data.verdict;
      const emoji  = RISK_EMOJI[v.risk_level] ?? '?';
      const name   = data.name || data.symbol || address.slice(0, 8);
      const reds   = Array.isArray(v.red_flags)   ? v.red_flags.slice(0, 3).map(f => `• ${f}`).join('\n') || '• None' : '• None';
      const greens = Array.isArray(v.green_flags) ? v.green_flags.slice(0, 3).map(f => `• ${f}`).join('\n') || '• None' : '• None';
      // Strip markdown special chars from AI text — unescaped * _ ` [ break Telegram's parser
      const sanitize = (s: string) => s.replace(/[*_`[\]]/g, '');
      const reasoningText = v.reasoning ? sanitize(v.reasoning).slice(0, 300) + (v.reasoning.length > 300 ? '…' : '') : '';
      const reasoning = reasoningText ? `\n🤖 ${reasoningText}\n` : '';

      return [
        `${emoji} *${name}* — ${v.risk_level} (${v.risk_score}/100)`,
        ``,
        `📋 ${sanitize(v.summary)}`,
        reasoning,
        `🔴 *Red flags*`,
        reds,
        ``,
        `🟢 *Green flags*`,
        greens,
        ``,
        `_Powered by TracSentinel × Trac Network_`,
      ].join('\n');
    }
  }

  throw new Error('Scan timed out after 90s');
}

// Track addresses currently being scanned to prevent duplicate concurrent requests
const inFlight = new Set<string>();

export function startTelegramBot(): void {
  if (!TOKEN) {
    logger.info('TELEGRAM_BOT_TOKEN not set — bot disabled');
    return;
  }

  const bot = new Bot(TOKEN);

  bot.command('start', ctx => ctx.reply(
    '👋 *TracSentinel Bot*\n\nPaste any token contract address or TAP ticker and I\'ll scan it for rug pull risks.\n\nExamples:\n• `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984` eth\n• `TRAC` tap\n• `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` solana',
    { parse_mode: 'Markdown' }
  ));

  bot.command('help', ctx => ctx.reply(
    '*How to use TracSentinel Bot*\n\n1. Paste a contract address with an optional chain keyword (eth, bsc, base, arbitrum, polygon, solana)\n2. For TAP Protocol tokens, include "tap" — e.g. `TRAC tap`\n3. Wait ~30s for the scan to complete\n\n_No keys. No tracking. Local AI._',
    { parse_mode: 'Markdown' }
  ));

  bot.on('message:text', async ctx => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;

    const detected = detectAddress(text);
    if (!detected) {
      await ctx.reply('⚠️ No token address or TAP ticker detected.\n\nExamples:\n• `0x...` eth\n• `TRAC` tap', { parse_mode: 'Markdown' });
      return;
    }

    const { address, chain } = detected;
    const flightKey = `${chain}:${address.toLowerCase()}`;

    if (inFlight.has(flightKey)) {
      await ctx.reply('⏳ This token is already being scanned — please wait a moment.', { parse_mode: 'Markdown' });
      return;
    }

    const msg = await ctx.reply(`🔍 Scanning *${address.slice(0, 12)}…* on *${chain.toUpperCase()}* — please wait…`, { parse_mode: 'Markdown' });
    inFlight.add(flightKey);

    try {
      const result = await requestScan(address, chain);
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id, result, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      await ctx.api.editMessageText(ctx.chat.id, msg.message_id,
        `❌ Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      inFlight.delete(flightKey);
    }
  });

  bot.catch(err => logger.error({ err }, 'Telegram bot error'));
  bot.start();
  logger.info('Telegram bot started');
}
