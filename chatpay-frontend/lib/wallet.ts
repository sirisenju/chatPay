export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

type WalletError = { message: string };
export interface WalletApi {
  isConnected(): Promise<{ isConnected: boolean; error?: WalletError }>;
  requestAccess(): Promise<{ address: string; error?: WalletError }>;
  getAddress(): Promise<{ address: string; error?: WalletError }>;
  getNetworkDetails(): Promise<{ networkPassphrase: string; error?: WalletError }>;
}

export async function connectFreighter(api: WalletApi): Promise<string> {
  const installed = await api.isConnected();
  if (!installed.isConnected) throw new Error('Install Freighter in this browser, then return here to connect.');
  if (installed.error) throw new Error(installed.error.message);
  const access = await api.requestAccess();
  if (access.error) throw new Error(access.error.message || 'Connection was declined. Please try again.');
  if (!access.address) throw new Error('No wallet address was returned. Unlock Freighter and try again.');
  await verifyWallet(api, access.address);
  return access.address;
}

export async function verifyWallet(api: WalletApi, address: string): Promise<void> {
  const network = await api.getNetworkDetails();
  if (network.error) throw new Error(network.error.message);
  if (network.networkPassphrase !== TESTNET_PASSPHRASE) {
    throw new Error('Switch Freighter to Testnet, then connect again. Open Freighter and select Testnet as the active network. Disconnecting ChatPay does not change your wallet’s network.');
  }
  const current = await api.getAddress();
  if (current.error) throw new Error(current.error.message);
  if (current.address !== address) throw new Error('Your wallet account changed. Please connect again.');
}
