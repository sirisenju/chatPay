import { TESTNET_PASSPHRASE } from './wallet.ts';
import type { WalletApi } from './wallet.ts';
type SigningWallet = Pick<WalletApi, 'getAddress' | 'getNetworkDetails'> & {
 signTransaction(xdr: string, options: { networkPassphrase: string; address: string }): Promise<{ signedTxXdr: string; signerAddress: string; error?: { message: string } }>;
};
export async function approvePayment<T>(preview: { expiresAt: string; unsignedXdr: string }, address: string, wallet: SigningWallet, submit: (xdr: string) => Promise<T>, active: () => boolean): Promise<T> {
 const ensureActive = () => {
   if (!active()) throw new Error('Payment request cancelled. Nothing was submitted.');
   if (!Number.isFinite(Date.parse(preview.expiresAt)) || Date.now() >= Date.parse(preview.expiresAt)) throw new Error('This preview expired. Create a new preview before signing.');
 };
 ensureActive();
 const network = await wallet.getNetworkDetails();
 if (network.error) throw new Error(network.error.message);
 if (network.networkPassphrase !== TESTNET_PASSPHRASE) throw new Error('Switch Freighter to Testnet before approving.');
 const current = await wallet.getAddress();
 if (current.error || current.address !== address) throw new Error('Your wallet account changed. Reconnect before approving.');
 const signed = await wallet.signTransaction(preview.unsignedXdr, { networkPassphrase: TESTNET_PASSPHRASE, address });
 if (signed.error) throw new Error(signed.error.message);
 if (!signed.signedTxXdr || signed.signerAddress !== address) throw new Error('The signing account does not match your connected wallet.');
 ensureActive();
 const latestNetwork = await wallet.getNetworkDetails();
 const latestAccount = await wallet.getAddress();
 if (latestNetwork.error || latestNetwork.networkPassphrase !== TESTNET_PASSPHRASE || latestAccount.error || latestAccount.address !== address) throw new Error('Your wallet account or network changed. Reconnect before approving.');
 ensureActive();
 return submit(signed.signedTxXdr);
}
