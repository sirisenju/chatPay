import { StrKey } from '@stellar/stellar-sdk';
import { prisma } from '../../db/prisma.js';
import { stellarClient } from '../../stellar/client.js';
import { AppError } from '../../types/errors.js';

export interface RecipientDTO {
  id: string;
  alias: string;
  address: string;
  createdAt: Date;
  updatedAt: Date;
  warnings?: string[];
}

export class RecipientService {
  /**
   * Lists all recipients for an authenticated user.
   */
  async listRecipients(userId: string): Promise<RecipientDTO[]> {
    const list = await prisma.recipient.findMany({
      where: { userId },
      orderBy: { alias: 'asc' }
    });

    return list.map((r) => ({
      id: r.id,
      alias: r.alias,
      address: r.address,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
  }

  /**
   * Adds a new recipient for the user.
   */
  async createRecipient(
    userId: string,
    userPublicKey: string,
    alias: string,
    address: string
  ): Promise<RecipientDTO> {
    const cleanAlias = alias.trim();
    const cleanAddress = address.trim();
    const aliasNorm = cleanAlias.toLowerCase();

    if (!cleanAlias) {
      throw new AppError('VALIDATION_FAILED', 'Recipient alias is required');
    }

    if (!StrKey.isValidEd25519PublicKey(cleanAddress)) {
      throw new AppError('VALIDATION_FAILED', 'Invalid Stellar ed25519 public key for recipient address');
    }

    if (cleanAddress === userPublicKey) {
      throw new AppError('SELF_TRANSFER_NOT_ALLOWED', 'Cannot add your own wallet address as a recipient');
    }

    // Check unique alias per user
    const existing = await prisma.recipient.findUnique({
      where: {
        userId_aliasNorm: {
          userId,
          aliasNorm
        }
      }
    });

    if (existing) {
      throw new AppError('CONFLICT', `A recipient with alias '${cleanAlias}' already exists in your address book`, 409);
    }

    // On-chain check for warnings
    const warnings: string[] = [];
    try {
      const balanceInfo = await stellarClient.getAccountBalances(cleanAddress);
      if (!balanceInfo.exists) {
        warnings.push("Recipient account does not exist on Stellar Testnet and will need funding before receiving USDC");
      } else if (!balanceInfo.hasUsdcTrustline) {
        warnings.push("Recipient account exists but has not established a USDC trustline");
      }
    } catch {
      // Non-blocking warnings
    }

    const created = await prisma.recipient.create({
      data: {
        userId,
        alias: cleanAlias,
        aliasNorm,
        address: cleanAddress
      }
    });

    return {
      id: created.id,
      alias: created.alias,
      address: created.address,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      ...(warnings.length > 0 ? { warnings } : {})
    };
  }

  /**
   * Edits an existing recipient owned by the user.
   */
  async updateRecipient(
    userId: string,
    userPublicKey: string,
    id: string,
    data: { alias?: string; address?: string }
  ): Promise<RecipientDTO> {
    const existing = await prisma.recipient.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Recipient not found', 404);
    }

    const updateData: { alias?: string; aliasNorm?: string; address?: string } = {};

    if (data.alias) {
      const cleanAlias = data.alias.trim();
      const aliasNorm = cleanAlias.toLowerCase();

      // Check conflict if changing alias
      if (aliasNorm !== existing.aliasNorm) {
        const conflict = await prisma.recipient.findUnique({
          where: {
            userId_aliasNorm: {
              userId,
              aliasNorm
            }
          }
        });
        if (conflict) {
          throw new AppError('CONFLICT', `A recipient with alias '${cleanAlias}' already exists`, 409);
        }
      }
      updateData.alias = cleanAlias;
      updateData.aliasNorm = aliasNorm;
    }

    if (data.address) {
      const cleanAddress = data.address.trim();
      if (!StrKey.isValidEd25519PublicKey(cleanAddress)) {
        throw new AppError('VALIDATION_FAILED', 'Invalid Stellar ed25519 public key');
      }
      if (cleanAddress === userPublicKey) {
        throw new AppError('SELF_TRANSFER_NOT_ALLOWED', 'Cannot use your own wallet address as a recipient');
      }
      updateData.address = cleanAddress;
    }

    const updated = await prisma.recipient.update({
      where: { id: existing.id },
      data: updateData
    });

    return {
      id: updated.id,
      alias: updated.alias,
      address: updated.address,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  }

  /**
   * Deletes a recipient owned by the user.
   */
  async deleteRecipient(userId: string, id: string): Promise<void> {
    const existing = await prisma.recipient.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      throw new AppError('NOT_FOUND', 'Recipient not found', 404);
    }

    await prisma.recipient.delete({
      where: { id: existing.id }
    });
  }
}

export const recipientService = new RecipientService();
