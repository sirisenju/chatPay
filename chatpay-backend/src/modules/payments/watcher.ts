import { prisma } from '../../db/prisma.js';
import { stellarClient } from '../../stellar/client.js';
import { STELLAR_CONFIG } from '../../config/stellar.js';
import { socketGateway } from '../../realtime/gateway.js';

export class ConfirmationWatcher {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private pollIntervalMs = 5000;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reconcilePendingPayments().catch((err) => {
        console.error('Error during payment reconciliation pass:', err);
      });
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconcilePendingPayments(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingPayments = await prisma.payment.findMany({
        where: {
          status: 'submitted',
          txHash: { not: null }
        },
        include: { recipient: true }
      });

      for (const payment of pendingPayments) {
        if (!payment.txHash) continue;

        try {
          const txRecord = await stellarClient.getTransaction(payment.txHash);
          const now = new Date();

          if (txRecord) {
            // Found on ledger!
            if (txRecord.successful) {
              await prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: 'confirmed',
                  confirmedAt: new Date(txRecord.created_at || Date.now())
                }
              });

              const explorerUrl = `${STELLAR_CONFIG.explorerBaseUrl}/${payment.txHash}`;
              const payload = {
                paymentId: payment.id,
                status: 'confirmed',
                amount: payment.amount,
                asset: payment.assetCode,
                recipientAlias: payment.recipient?.alias || 'Recipient',
                txHash: payment.txHash,
                explorerUrl
              };

              await prisma.chatMessage.create({
                data: {
                  userId: payment.userId,
                  role: 'system',
                  type: 'status',
                  payload
                }
              });

              // Push real-time event
              socketGateway.emitToUser(payment.userId, 'payment:status', payload);
            } else {
              // Transaction failed on ledger
              await prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: 'failed',
                  failureCode: 'LEDGER_FAILED'
                }
              });

              const payload = {
                paymentId: payment.id,
                status: 'failed',
                code: 'LEDGER_FAILED',
                message: 'Transaction failed during ledger processing'
              };

              await prisma.chatMessage.create({
                data: {
                  userId: payment.userId,
                  role: 'system',
                  type: 'error',
                  payload
                }
              });

              socketGateway.emitToUser(payment.userId, 'payment:status', payload);
            }
          } else {
            // Not yet found. Check if expired beyond time bounds plus 30s grace period
            const gracePeriodMs = 30 * 1000;
            if (now.getTime() > payment.expiresAt.getTime() + gracePeriodMs) {
              // Final confirmation: lookup one more time before marking failed
              const finalCheck = await stellarClient.getTransaction(payment.txHash);
              if (!finalCheck) {
                await prisma.payment.update({
                  where: { id: payment.id },
                  data: {
                    status: 'failed',
                    failureCode: 'TRANSACTION_TIMEOUT'
                  }
                });

                const payload = {
                  paymentId: payment.id,
                  status: 'failed',
                  code: 'TRANSACTION_TIMEOUT',
                  message: 'Transaction timed out without inclusion on Stellar ledger'
                };

                await prisma.chatMessage.create({
                  data: {
                    userId: payment.userId,
                    role: 'system',
                    type: 'error',
                    payload
                  }
                });

                socketGateway.emitToUser(payment.userId, 'payment:status', payload);
              }
            }
          }
        } catch {
          // Continue to next pending payment on network error
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const confirmationWatcher = new ConfirmationWatcher();
