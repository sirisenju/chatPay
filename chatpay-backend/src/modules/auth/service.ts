import crypto from 'crypto';
import { verifyMessageSignature } from './message-signature.js';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../types/errors.js';

export function formatChallengeMessage(publicKey: string, nonce: string, expiresAt: Date): string {
  return `ChatPay Authentication Challenge\n\nPublic Key: ${publicKey}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}`;
}

export class AuthService {
  /**
   * Generates a single-use expiring authentication challenge for a given Stellar public key.
   */
  async createChallenge(publicKey: string): Promise<{
    challenge: string;
    nonce: string;
    expiresAt: Date;
  }> {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new AppError('VALIDATION_FAILED', 'Invalid Stellar ed25519 public key');
    }

    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    const challenge = formatChallengeMessage(publicKey, nonce, expiresAt);

    await prisma.authChallenge.create({
      data: {
        publicKey,
        nonce,
        expiresAt
      }
    });

    return {
      challenge,
      nonce,
      expiresAt
    };
  }

  /**
   * Verifies the cryptographic ed25519 signature of the challenge and upserts the user.
   */
  async verifyChallenge(
    publicKey: string,
    signature: string,
    nonce?: string
  ): Promise<{
    user: { id: string; publicKey: string };
  }> {
    if (!StrKey.isValidEd25519PublicKey(publicKey)) {
      throw new AppError('VALIDATION_FAILED', 'Invalid Stellar ed25519 public key');
    }

    if (!signature || signature.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'Challenge signature is required');
    }

    // Find the challenge by nonce or find latest active challenge
    let challengeRecord;
    if (nonce) {
      challengeRecord = await prisma.authChallenge.findUnique({
        where: { nonce }
      });
    } else {
      challengeRecord = await prisma.authChallenge.findFirst({
        where: {
          publicKey,
          usedAt: null,
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!challengeRecord) {
      throw new AppError('UNAUTHORIZED', 'No active challenge found for this public key', 401);
    }

    if (challengeRecord.publicKey !== publicKey) {
      throw new AppError('UNAUTHORIZED', 'Challenge public key mismatch', 401);
    }

    if (challengeRecord.usedAt !== null) {
      throw new AppError('UNAUTHORIZED', 'Authentication challenge has already been used', 401);
    }

    if (new Date() > challengeRecord.expiresAt) {
      throw new AppError('UNAUTHORIZED', 'Authentication challenge has expired', 401);
    }

    // Reconstruct challenge text
    const challengeText = formatChallengeMessage(
      publicKey,
      challengeRecord.nonce,
      challengeRecord.expiresAt
    );

    const keypair = Keypair.fromPublicKey(publicKey);
    const isValid = verifyMessageSignature(challengeText, signature, (payload, bytes) => keypair.verify(payload, bytes));


    if (!isValid) {
      throw new AppError('UNAUTHORIZED', 'Invalid cryptographic signature for authentication challenge', 401);
    }

    // Mark challenge as used to prevent replay attacks
    await prisma.authChallenge.update({
      where: { id: challengeRecord.id },
      data: { usedAt: new Date() }
    });

    // Upsert User
    const user = await prisma.user.upsert({
      where: { publicKey },
      update: {},
      create: { publicKey }
    });

    return {
      user: {
        id: user.id,
        publicKey: user.publicKey
      }
    };
  }
}

export const authService = new AuthService();
