import { createHash } from 'node:crypto';

export function verifyMessageSignature(
  message: string,
  signature: string,
  verify: (payload: Buffer, signature: Buffer) => boolean
): boolean {
  const raw = Buffer.from(message, 'utf8');
  const sep53 = createHash('sha256').update('Stellar Signed Message:\n').update(raw).digest();
  for (const encoding of ['base64', 'hex'] as const) {
    const bytes = Buffer.from(signature, encoding);
    if (bytes.length !== 64) continue;
    for (const payload of [sep53, raw]) {
      try { if (verify(payload, bytes)) return true; } catch { /* Invalid signature. */ }
    }
  }
  return false;
}
