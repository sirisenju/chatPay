import { prisma } from '../../db/prisma.js';
import { stellarClient } from '../../stellar/client.js';
import { verifySignedTransaction } from '../../stellar/verifier.js';
import { mapHorizonError } from '../../stellar/errors.js';
import { STELLAR_CONFIG } from '../../config/stellar.js';
import { AppError } from '../../types/errors.js';

export interface PaymentSubmissionResult {
  paymentId: string;
  status: string;
  txHash: string;
  explorerUrl: string;
}

export class PaymentService {
  /**
   * Submits a signed transaction XDR for an awaiting_signature payment.
   */
  async submitPayment(
    userId: string,
    userPublicKey: string,
    paymentId: string,
    signedXdr: string
  ): Promise<PaymentSubmissionResult> {
    // 1. Fetch payment ensuring strict user ownership
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        userId
      },
      include: {
        recipient: true
      }
    });

    if (!payment) {
      throw new AppError('NOT_FOUND', 'Payment not found', 404);
    }

    // 2. Idempotency: if already submitted or confirmed, return current status
    if (payment.status === 'submitted' || payment.status === 'confirmed') {
      const txHash = payment.txHash || payment.txHashExpected || '';
      return {
        paymentId: payment.id,
        status: payment.status,
        txHash,
        explorerUrl: `${STELLAR_CONFIG.explorerBaseUrl}/${txHash}`
      };
    }

    if (payment.status !== 'awaiting_signature') {
      throw new AppError(
        'VALIDATION_FAILED',
        `Payment cannot be submitted in '${payment.status}' status`
      );
    }

    // 3. Expiration check
    if (new Date() > payment.expiresAt) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'expired' }
      });
      throw new AppError('PREVIEW_EXPIRED', 'Payment preview has expired');
    }

    // 4. Cryptographic and structural XDR verification
    const verification = verifySignedTransaction({
      signedXdr,
      expectedSourcePublicKey: userPublicKey,
      expectedDestinationPublicKey: payment.recipientAddress,
      expectedAmount: payment.amount,
      expectedAssetCode: payment.assetCode,
      expectedAssetIssuer: payment.assetIssuer || undefined,
      expectedMemo: payment.memo,
      expectedExpiresAt: payment.expiresAt
    });

    // 5. Guarded status update to 'submitted'
    const updateResult = await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: 'awaiting_signature'
      },
      data: {
        status: 'submitted',
        txHash: verification.txHash
      }
    });

    if (updateResult.count === 0) {
      // Handled by concurrent request
      const current = await prisma.payment.findUnique({ where: { id: payment.id } });
      const currentHash = current?.txHash || verification.txHash;
      return {
        paymentId: payment.id,
        status: current?.status || 'submitted',
        txHash: currentHash,
        explorerUrl: `${STELLAR_CONFIG.explorerBaseUrl}/${currentHash}`
      };
    }

    // 6. Submit to Stellar Testnet Horizon
    try {
      await stellarClient.server.submitTransaction(verification.transaction);

      // Successfully accepted into ledger!
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'confirmed',
          confirmedAt: new Date()
        }
      });

      const explorerUrl = `${STELLAR_CONFIG.explorerBaseUrl}/${verification.txHash}`;

      // Insert confirmation chat message
      await prisma.chatMessage.create({
        data: {
          userId,
          role: 'system',
          type: 'status',
          payload: {
            paymentId: payment.id,
            status: 'confirmed',
            amount: payment.amount,
            asset: payment.assetCode,
            recipientAlias: payment.recipient?.alias || 'Recipient',
            txHash: verification.txHash,
            explorerUrl
          }
        }
      });

      return {
        paymentId: payment.id,
        status: 'confirmed',
        txHash: verification.txHash,
        explorerUrl
      };
    } catch (err: unknown) {
      const mappedError = mapHorizonError(err);

      // If it's a 5xx or timeout, do NOT mark failed; let watcher poll hash
      if (mappedError.statusCode >= 500) {
        return {
          paymentId: payment.id,
          status: 'submitted',
          txHash: verification.txHash,
          explorerUrl: `${STELLAR_CONFIG.explorerBaseUrl}/${verification.txHash}`
        };
      }

      // Mark payment failed in database
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          failureCode: mappedError.code
        }
      });

      await prisma.chatMessage.create({
        data: {
          userId,
          role: 'system',
          type: 'error',
          payload: {
            paymentId: payment.id,
            status: 'failed',
            code: mappedError.code,
            message: mappedError.message
          }
        }
      });

      throw mappedError;
    }
  }

  /**
   * Fetches payment details by ID for the authenticated user.
   */
  async getPayment(userId: string, id: string) {
    const payment = await prisma.payment.findFirst({
      where: { id, userId },
      include: { recipient: true }
    });

    if (!payment) {
      throw new AppError('NOT_FOUND', 'Payment not found', 404);
    }

    const txHash = payment.txHash || payment.txHashExpected || '';
    return {
      id: payment.id,
      recipientAlias: payment.recipient?.alias || 'Recipient',
      recipientAddress: payment.recipientAddress,
      amount: payment.amount,
      assetCode: payment.assetCode,
      memo: payment.memo,
      status: payment.status,
      txHash: payment.txHash,
      explorerUrl: txHash ? `${STELLAR_CONFIG.explorerBaseUrl}/${txHash}` : null,
      createdAt: payment.createdAt,
      confirmedAt: payment.confirmedAt,
      expiresAt: payment.expiresAt,
      failureCode: payment.failureCode
    };
  }

  /**
   * Fetches paginated payment history for the user.
   */
  async listPayments(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const offset = Math.max(options.offset || 0, 0);

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where: { userId } }),
      prisma.payment.findMany({
        where: { userId },
        include: { recipient: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      })
    ]);

    const items = payments.map((p) => {
      const txHash = p.txHash || p.txHashExpected || '';
      return {
        id: p.id,
        recipientAlias: p.recipient?.alias || 'Recipient',
        recipientAddress: p.recipientAddress,
        amount: p.amount,
        assetCode: p.assetCode,
        memo: p.memo,
        status: p.status,
        txHash: p.txHash,
        explorerUrl: txHash ? `${STELLAR_CONFIG.explorerBaseUrl}/${txHash}` : null,
        createdAt: p.createdAt,
        confirmedAt: p.confirmedAt,
        failureCode: p.failureCode
      };
    });

    return {
      total,
      limit,
      offset,
      items
    };
  }
}

export const paymentService = new PaymentService();
