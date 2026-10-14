import { Recipient } from '@prisma/client';
import { prisma } from '../../db/prisma.js';

export type ResolutionResult =
  | { status: 'found'; recipient: Recipient }
  | { status: 'not_found'; alias: string }
  | { status: 'ambiguous'; alias: string; candidates: Recipient[] };

export async function resolveRecipientAlias(
  userId: string,
  aliasInput: string
): Promise<ResolutionResult> {
  const clean = aliasInput.trim();
  const norm = clean.toLowerCase();

  // 1. Exact match on normalized alias
  const exact = await prisma.recipient.findUnique({
    where: {
      userId_aliasNorm: {
        userId,
        aliasNorm: norm
      }
    }
  });

  if (exact) {
    return { status: 'found', recipient: exact };
  }

  // 2. Prefix match
  const prefixMatches = await prisma.recipient.findMany({
    where: {
      userId,
      aliasNorm: {
        startsWith: norm
      }
    }
  });

  if (prefixMatches.length === 1) {
    return { status: 'found', recipient: prefixMatches[0] };
  }

  if (prefixMatches.length > 1) {
    return { status: 'ambiguous', alias: clean, candidates: prefixMatches };
  }

  return { status: 'not_found', alias: clean };
}
