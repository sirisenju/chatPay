import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../../config/index.js';

export interface ParsedCommand {
  intent: 'payment' | 'unknown';
  amount?: string;
  asset?: string;
  recipientAlias?: string;
  rawText: string;
}

const llmExtractionSchema = z.object({
  intent: z.enum(['payment', 'unknown']),
  amount: z.string().nullable().optional(),
  asset: z.string().nullable().optional(),
  recipient: z.string().nullable().optional()
});

/**
 * Tier 1: Fast, deterministic regex-based parser covering all standard payment phrasings.
 */
export function parseWithRules(input: string): ParsedCommand {
  const text = input.trim();
  if (!text) {
    return { intent: 'unknown', rawText: text };
  }

  // Normalize string: collapse extra spaces, handle dollar signs
  const normalized = text.replace(/,/g, '').replace(/\s+/g, ' ');

  // Pattern 1: [send|pay|transfer] [amount] [asset?] to [alias]
  // Examples: "Send 10 USDC to Alex", "pay 50 to Bob", "transfer $25 to Charlie"
  const p1 = /^(?:send|pay|transfer)\s+\$?([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?\s+to\s+([a-zA-Z0-9_-]+)$/i;
  const m1 = normalized.match(p1);
  if (m1) {
    return {
      intent: 'payment',
      amount: m1[1],
      asset: (m1[2] || (text.includes('$') ? 'USDC' : 'USDC')).toUpperCase(),
      recipientAlias: m1[3],
      rawText: text
    };
  }

  // Pattern 2: [send|pay|transfer] [alias] [amount] [asset?]
  // Examples: "Send Alex 10 USDC", "pay bob 25", "transfer charlie $15"
  const p2 = /^(?:send|pay|transfer)\s+([a-zA-Z0-9_-]+)\s+\$?([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?$/i;
  const m2 = normalized.match(p2);
  if (m2) {
    return {
      intent: 'payment',
      recipientAlias: m2[1],
      amount: m2[2],
      asset: (m2[3] || (text.includes('$') ? 'USDC' : 'USDC')).toUpperCase(),
      rawText: text
    };
  }

  // Pattern 3: [amount] [asset?] to [alias]
  // Examples: "10 USDC to Alex", "$20 to Sarah"
  const p3 = /^\$?([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?\s+to\s+([a-zA-Z0-9_-]+)$/i;
  const m3 = normalized.match(p3);
  if (m3) {
    return {
      intent: 'payment',
      amount: m3[1],
      asset: (m3[2] || (text.includes('$') ? 'USDC' : 'USDC')).toUpperCase(),
      recipientAlias: m3[3],
      rawText: text
    };
  }

  // Pattern 4: Incomplete intent with missing recipient
  // Examples: "Send 10 USDC", "Pay 50"
  const p4 = /^(?:send|pay|transfer)\s+\$?([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?$/i;
  const m4 = normalized.match(p4);
  if (m4) {
    return {
      intent: 'payment',
      amount: m4[1],
      asset: (m4[2] || (text.includes('$') ? 'USDC' : 'USDC')).toUpperCase(),
      recipientAlias: undefined,
      rawText: text
    };
  }

  // Pattern 5: [alias] [amount] [asset?] or [alias], send [amount] [asset?]
  // Examples: "Alex 10 USDC", "Alex, send 50 USDC", "Bob $100"
  const p5 = /^([a-zA-Z0-9_-]+)(?:\s+(?:send|pay|transfer))?\s+\$?([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)?$/i;
  const m5 = normalized.match(p5);
  const reserved = ['send', 'pay', 'transfer', 'hello', 'hi', 'help', 'status'];
  if (m5 && !reserved.includes(m5[1].toLowerCase())) {
    return {
      intent: 'payment',
      recipientAlias: m5[1],
      amount: m5[2],
      asset: (m5[3] || (text.includes('$') ? 'USDC' : 'USDC')).toUpperCase(),
      rawText: text
    };
  }

  // Pattern 6: Incomplete intent with missing amount
  // Examples: "Send to Alex", "Pay Alex"
  const p6 = /^(?:send|pay|transfer)(?:\s+to)?\s+([a-zA-Z0-9_-]+)$/i;
  const m6 = normalized.match(p6);
  if (m6) {
    return {
      intent: 'payment',
      amount: undefined,
      asset: 'USDC',
      recipientAlias: m6[1],
      rawText: text
    };
  }

  return { intent: 'unknown', rawText: text };
}

/**
 * Optional Tier 2: LLM Field Extraction with Claude Haiku (behind feature flag)
 */
export async function parseWithLLM(input: string): Promise<ParsedCommand> {
  if (!config.ENABLE_LLM_PARSER || !config.ANTHROPIC_API_KEY) {
    return parseWithRules(input);
  }

  try {
    const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 150,
      temperature: 0,
      system:
        'You are an intent extraction engine for a payments chat application. ' +
        'Extract fields into a JSON object: {"intent": "payment" | "unknown", "amount": string | null, "asset": string | null, "recipient": string | null}. ' +
        'Output ONLY raw valid JSON, no explanations.',
      messages: [{ role: 'user', content: input }]
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsedJson = JSON.parse(content);
    const validated = llmExtractionSchema.parse(parsedJson);

    return {
      intent: validated.intent,
      amount: validated.amount || undefined,
      asset: validated.asset ? validated.asset.toUpperCase() : 'USDC',
      recipientAlias: validated.recipient || undefined,
      rawText: input
    };
  } catch {
    // Graceful fallback to deterministic rule engine
    return parseWithRules(input);
  }
}

export async function parseCommand(input: string): Promise<ParsedCommand> {
  const ruleResult = parseWithRules(input);
  if (ruleResult.intent === 'payment' && ruleResult.amount && ruleResult.recipientAlias) {
    return ruleResult;
  }

  if (config.ENABLE_LLM_PARSER) {
    return await parseWithLLM(input);
  }

  return ruleResult;
}
