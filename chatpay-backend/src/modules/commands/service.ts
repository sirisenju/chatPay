import { Decimal } from 'decimal.js';
import { prisma } from '../../db/prisma.js';
import { stellarClient } from '../../stellar/client.js';
import { buildUnsignedPaymentTransaction } from '../../stellar/builder.js';
import { STELLAR_CONFIG } from '../../config/stellar.js';
import { parseCommand } from './parser.js';
import { resolveRecipientAlias } from './resolver.js';
import { AppError } from '../../types/errors.js';

export interface CommandResponse {
  type: 'preview' | 'clarify' | 'needs_recipient' | 'error';
  message: string;
  code?: string;
  options?: string[];
  alias?: string;
  preview?: {
    paymentId: string;
    recipientAlias: string;
    recipientAddress: string;
    amount: string;
    asset: string;
    estimatedFee: string;
    memo?: string;
    expiresAt: string;
    unsignedXdr: string;
    warnings: string[];
  };
}

export class CommandService {
  /**
   * Processes a natural-language payment command.
   */
  async processCommand(params: {
    userId: string;
    userPublicKey: string;
    text: string;
    clientMsgId?: string;
  }): Promise<CommandResponse> {
    const { userId, userPublicKey, text, clientMsgId } = params;

    // 1. Idempotency check
    if (clientMsgId) {
      const existingPayment = await prisma.payment.findUnique({
        where: {
          userId_clientMsgId: {
            userId,
            clientMsgId
          }
        },
        include: { recipient: true }
      });

      if (existingPayment) {
        return {
          type: 'preview',
          message: 'Retrieved existing payment preview',
          preview: {
            paymentId: existingPayment.id,
            recipientAlias: existingPayment.recipient?.alias || 'Recipient',
            recipientAddress: existingPayment.recipientAddress,
            amount: existingPayment.amount,
            asset: existingPayment.assetCode,
            estimatedFee: '100',
            memo: existingPayment.memo || undefined,
            expiresAt: existingPayment.expiresAt.toISOString(),
            unsignedXdr: existingPayment.xdrUnsigned,
            warnings: []
          }
        };
      }
    }

    // Record user chat message
    if (clientMsgId) {
      await prisma.chatMessage
        .create({
          data: {
            userId,
            role: 'user',
            type: 'text',
            payload: { text },
            clientMsgId
          }
        })
        .catch(() => {
          // Ignore unique clientMsgId collision on chat message if any
        });
    }

    // 2. Parse command text
    const parsed = await parseCommand(text);

    if (parsed.intent !== 'payment') {
      const clarifyMsg = "I couldn't recognize a payment instruction. Try: 'Send 10 USDC to Alex'";
      await this.saveSystemMessage(userId, 'clarify', { message: clarifyMsg });
      return {
        type: 'clarify',
        message: clarifyMsg
      };
    }

    if (!parsed.amount && parsed.recipientAlias) {
      const clarifyMsg = `How much ${parsed.asset || 'USDC'} would you like to send to ${parsed.recipientAlias}?`;
      await this.saveSystemMessage(userId, 'clarify', { message: clarifyMsg });
      return {
        type: 'clarify',
        message: clarifyMsg
      };
    }

    if (!parsed.recipientAlias && parsed.amount) {
      const clarifyMsg = `Who would you like to send ${parsed.amount} ${parsed.asset || 'USDC'} to?`;
      await this.saveSystemMessage(userId, 'clarify', { message: clarifyMsg });
      return {
        type: 'clarify',
        message: clarifyMsg
      };
    }

    if (!parsed.amount || !parsed.recipientAlias) {
      const clarifyMsg = "Please specify both an amount and a recipient. Example: 'Send 10 USDC to Alex'";
      await this.saveSystemMessage(userId, 'clarify', { message: clarifyMsg });
      return {
        type: 'clarify',
        message: clarifyMsg
      };
    }

    // 3. Asset allowlist
    const assetCode = (parsed.asset || 'USDC').toUpperCase();
    if (assetCode !== 'USDC' && assetCode !== 'XLM') {
      const errorMsg = `Asset '${assetCode}' is not supported. Supported assets are USDC and XLM.`;
      await this.saveSystemMessage(userId, 'error', { code: 'UNSUPPORTED_ASSET', message: errorMsg });
      return {
        type: 'error',
        code: 'UNSUPPORTED_ASSET',
        message: errorMsg
      };
    }

    // 4. Validate amount
    let decAmount: Decimal;
    try {
      decAmount = new Decimal(parsed.amount);
      if (decAmount.lte(0)) {
        throw new Error('Amount must be positive');
      }
      if (decAmount.decimalPlaces() > 7) {
        throw new Error('Stellar allows up to 7 decimal places');
      }
      if (decAmount.gt(new Decimal(STELLAR_CONFIG.maxPaymentCap))) {
        throw new Error(`Amount exceeds maximum cap of ${STELLAR_CONFIG.maxPaymentCap} ${assetCode}`);
      }
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Invalid amount format';
      await this.saveSystemMessage(userId, 'error', { code: 'AMOUNT_OUT_OF_RANGE', message: errorMsg });
      return {
        type: 'error',
        code: 'AMOUNT_OUT_OF_RANGE',
        message: errorMsg
      };
    }

    // 5. Resolve Recipient
    const resolution = await resolveRecipientAlias(userId, parsed.recipientAlias);

    if (resolution.status === 'not_found') {
      const msg = `Recipient '${parsed.recipientAlias}' was not found in your address book. Please add them first before sending.`;
      await this.saveSystemMessage(userId, 'needs_recipient', { alias: parsed.recipientAlias, message: msg });
      return {
        type: 'needs_recipient',
        alias: parsed.recipientAlias,
        message: msg
      };
    }

    if (resolution.status === 'ambiguous') {
      const options = resolution.candidates.map((c) => c.alias);
      const msg = `Multiple recipients match '${parsed.recipientAlias}'. Did you mean ${options.join(' or ')}?`;
      await this.saveSystemMessage(userId, 'clarify', { message: msg, options });
      return {
        type: 'clarify',
        message: msg,
        options
      };
    }

    const recipient = resolution.recipient;

    if (recipient.address === userPublicKey) {
      const msg = 'Cannot send payment to your own wallet address.';
      await this.saveSystemMessage(userId, 'error', { code: 'SELF_TRANSFER_NOT_ALLOWED', message: msg });
      return {
        type: 'error',
        code: 'SELF_TRANSFER_NOT_ALLOWED',
        message: msg
      };
    }

    // 6. On-chain pre-checks
    const warnings: string[] = [];
    try {
      const senderBalances = await stellarClient.getAccountBalances(userPublicKey);
      if (!senderBalances.exists) {
        const msg = 'Your Stellar Testnet account is not funded. Please fund it with testnet XLM first.';
        await this.saveSystemMessage(userId, 'error', { code: 'INSUFFICIENT_FUNDS', message: msg });
        return {
          type: 'error',
          code: 'INSUFFICIENT_FUNDS',
          message: msg
        };
      }

      if (assetCode === 'USDC') {
        if (!senderBalances.hasUsdcTrustline) {
          const msg = 'Your account has not established a USDC trustline.';
          await this.saveSystemMessage(userId, 'error', { code: 'NO_TRUSTLINE', message: msg });
          return {
            type: 'error',
            code: 'NO_TRUSTLINE',
            message: msg
          };
        }

        if (new Decimal(senderBalances.usdcBalance).lt(decAmount)) {
          const msg = `Insufficient USDC balance (available: ${senderBalances.usdcBalance} USDC, required: ${decAmount.toFixed(7)} USDC)`;
          await this.saveSystemMessage(userId, 'error', { code: 'INSUFFICIENT_FUNDS', message: msg });
          return {
            type: 'error',
            code: 'INSUFFICIENT_FUNDS',
            message: msg
          };
        }
      }

      // Check recipient on-chain status
      const recipientBalances = await stellarClient.getAccountBalances(recipient.address);
      if (!recipientBalances.exists) {
        warnings.push("Recipient account does not exist on Stellar Testnet and will need funding before receiving USDC");
      } else if (assetCode === 'USDC' && !recipientBalances.hasUsdcTrustline) {
        warnings.push("Recipient account exists but has not established a USDC trustline");
      }
    } catch {
      // Allow preview creation to proceed; submission verifier handles final state
    }

    // 7. Build unsigned transaction
    const memo = `chatpay:${recipient.alias.slice(0, 15)}`;
    let buildResult;
    try {
      buildResult = await buildUnsignedPaymentTransaction({
        sourcePublicKey: userPublicKey,
        destinationPublicKey: recipient.address,
        amount: decAmount.toFixed(7),
        assetCode,
        assetIssuer: assetCode === 'USDC' ? STELLAR_CONFIG.usdc.issuer : undefined,
        memoText: memo
      });
    } catch (err: unknown) {
      if (err instanceof AppError) {
        await this.saveSystemMessage(userId, 'error', { code: err.code, message: err.message });
        return {
          type: 'error',
          code: err.code,
          message: err.message
        };
      }
      throw err;
    }

    // 8. Store payment in database
    const payment = await prisma.payment.create({
      data: {
        userId,
        recipientId: recipient.id,
        recipientAddress: recipient.address,
        amount: decAmount.toFixed(7),
        assetCode,
        assetIssuer: assetCode === 'USDC' ? STELLAR_CONFIG.usdc.issuer : '',
        memo,
        status: 'awaiting_signature',
        xdrUnsigned: buildResult.unsignedXdr,
        txHashExpected: buildResult.txHashExpected,
        sourceSeq: buildResult.sourceSeq,
        expiresAt: buildResult.expiresAt,
        clientMsgId
      }
    });

    const previewData = {
      paymentId: payment.id,
      recipientAlias: recipient.alias,
      recipientAddress: recipient.address,
      amount: decAmount.toFixed(7),
      asset: assetCode,
      estimatedFee: buildResult.fee,
      memo,
      expiresAt: buildResult.expiresAt.toISOString(),
      unsignedXdr: buildResult.unsignedXdr,
      warnings
    };

    // 9. Save system preview message
    await this.saveSystemMessage(userId, 'preview', previewData);

    return {
      type: 'preview',
      message: `Preview created to send ${decAmount.toFixed(7)} ${assetCode} to ${recipient.alias}`,
      preview: previewData
    };
  }

  private async saveSystemMessage(userId: string, type: string, payload: unknown) {
    try {
      await prisma.chatMessage.create({
        data: {
          userId,
          role: 'system',
          type,
          payload: payload as object
        }
      });
    } catch {
      // non-critical message save failure
    }
  }
}

export const commandService = new CommandService();
