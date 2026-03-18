import axios from 'axios';
import { logger } from '../logger.js';

const OLLAMA_HOST  = process.env.OLLAMA_HOST  ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'deepseek-r1:8b';

export interface SentinelVerdict {
  risk_score:   number;          // 0-100 — from rule engine
  risk_level:   'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
  confidence:   number;          // 0-100
  red_flags:    string[];
  green_flags:  string[];
  summary:      string;
  reasoning:    string;
}

export interface NarrativeInput {
  chain: string;
  risk_score: number;
  risk_level: 'SAFE' | 'CAUTION' | 'DANGER' | 'RUG';
  red_factors: string[];
  green_factors: string[];
  data_completeness: number;
  liquidity_usd: number;
  age_hours: number;
  holder_count: number;
  market_cap_usd: number;
}

export async function generateNarrative(input: NarrativeInput): Promise<{ summary: string; reasoning: string } | null> {
  try {
    const knownRed   = input.red_factors.length   > 0 ? input.red_factors.join('; ')   : 'none';
    const knownGreen = input.green_factors.length > 0 ? input.green_factors.join('; ') : 'none';

    const toneGuide =
      input.risk_level === 'SAFE'    ? 'The overall verdict is SAFE. Tone should be reassuring.' :
      input.risk_level === 'CAUTION' ? 'The overall verdict is CAUTION. Tone should be cautious but not alarming.' :
      input.risk_level === 'DANGER'  ? 'The overall verdict is DANGER. Tone should be serious and warn users.' :
                                       'The overall verdict is RUG. Tone should be strongly warning.';

    const marketContext = input.market_cap_usd > 100_000_000
      ? `This is a large-cap token with $${(input.market_cap_usd / 1_000_000).toFixed(0)}M market cap — some structural flags (mintable, not renounced) are normal for custodied or DAO-governed protocols.`
      : input.market_cap_usd > 0
      ? `Market cap: $${(input.market_cap_usd / 1_000_000).toFixed(1)}M.`
      : '';

    const prompt = `A crypto token on ${input.chain} was scored ${input.risk_score}/100 (${input.risk_level}) by a rule-based security engine.
${toneGuide}
${marketContext}
Risk factors detected: ${knownRed}.
Positive signals detected: ${knownGreen}.

Your response MUST match the ${input.risk_level} verdict. A score of ${input.risk_score}/100 means ${input.risk_level === 'SAFE' ? 'it is safe' : input.risk_level === 'CAUTION' ? 'proceed with caution' : input.risk_level === 'DANGER' ? 'high risk' : 'likely a rug pull'}.
Write ONLY a JSON object:
- "summary": one sentence reflecting ${input.risk_level} (max 20 words)
- "reasoning": 2-3 sentences. For SAFE tokens, focus on the positive signals. For risky tokens, focus on the dangers.`;

    const res = await axios.post(`${OLLAMA_HOST}/api/chat`, {
      model:  OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0.2, top_p: 0.9 },
      messages: [
        {
          role: 'system',
          content: 'You are a concise crypto security writer. Output only valid JSON with "summary" and "reasoning" fields. No markdown.',
        },
        { role: 'user', content: prompt },
      ],
    }, { timeout: 60000 });

    const raw = res.data?.message?.content ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; reasoning?: string };
    return {
      summary:   parsed.summary   ?? '',
      reasoning: parsed.reasoning ?? '',
    };
  } catch (e) {
    logger.error({ err: e }, 'Ollama narrative failed');
    return null;
  }
}

export async function checkOllamaHealth(): Promise<{ ok: boolean; model: string }> {
  try {
    const res = await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 3000 });
    const models: Array<{ name: string }> = res.data?.models ?? [];
    const hasModel = models.some(m => m.name.startsWith(OLLAMA_MODEL.split(':')[0]!));
    return { ok: true, model: hasModel ? OLLAMA_MODEL : `${OLLAMA_MODEL} (not found — pull it first)` };
  } catch {
    return { ok: false, model: 'Ollama not reachable' };
  }
}
