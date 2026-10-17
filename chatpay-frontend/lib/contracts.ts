export interface WalletBalance { publicKey: string; exists: boolean; nativeBalance: string; usdcBalance: string; hasUsdcTrustline: boolean }
export interface Recipient { id: string; alias: string; address: string; warnings?: string[] }
export interface Preview { paymentId: string; recipientAlias: string; recipientAddress: string; amount: string; asset: string; estimatedFee: string; memo?: string; expiresAt: string; unsignedXdr: string; warnings: string[] }
export interface CommandResult { type: 'preview' | 'clarify' | 'needs_recipient' | 'error'; message: string; code?: string; alias?: string; options?: string[]; preview?: Preview }
export interface Payment { id: string; recipientAlias: string; recipientAddress: string; amount: string; assetCode: string; status: string; txHash?: string | null; explorerUrl?: string | null; createdAt: string; confirmedAt?: string | null; failureCode?: string | null }
export interface PaymentHistory { total: number; offset: number; limit: number; items: Payment[] }
