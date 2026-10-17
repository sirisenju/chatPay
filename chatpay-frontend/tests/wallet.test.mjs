import test from 'node:test';
import assert from 'node:assert/strict';
import { connectFreighter, verifyWallet, TESTNET_PASSPHRASE } from '../lib/wallet.ts';

const address = 'G' + 'A'.repeat(55);
function api(overrides = {}) {
  return {
    isConnected: async () => ({ isConnected: true }),
    requestAccess: async () => ({ address }),
    getAddress: async () => ({ address }),
    getNetworkDetails: async () => ({ networkPassphrase: TESTNET_PASSPHRASE }),
    ...overrides,
  };
}
test('connects with an authorized public address on Testnet', async () => {
  assert.equal(await connectFreighter(api()), address);
});
test('does not request access when the extension is missing', async () => {
  await assert.rejects(connectFreighter(api({
    isConnected: async () => ({ isConnected: false }),
    requestAccess: async () => { assert.fail('Should not prompt'); },
  })), /Install Freighter/);
});
test('reports rejected access without returning a connected address', async () => {
  await assert.rejects(connectFreighter(api({ requestAccess: async () => ({ address: '', error: { message: 'User declined access' } }) })), /declined/);
});
test('rejects Mainnet even after access is approved', async () => {
  await assert.rejects(connectFreighter(api({ getNetworkDetails: async () => ({ networkPassphrase: 'Public Global Stellar Network ; September 2015' }) })), /Switch Freighter to Testnet/);
});
test('does not accept an empty address', async () => {
  await assert.rejects(connectFreighter(api({ requestAccess: async () => ({ address: '' }) })), /No wallet address/);
});
test('invalidates a connected session when the selected account changes', async () => {
  await assert.rejects(verifyWallet(api({ getAddress: async () => ({ address: 'G' + 'B'.repeat(55) }) }), address), /account changed/);
});
test('invalidates a session when the network changes', async () => {
  await assert.rejects(verifyWallet(api({ getNetworkDetails: async () => ({ networkPassphrase: 'mainnet' }) }), address), /Testnet/);
});
test('verifies an unchanged Testnet wallet', async () => {
  await assert.doesNotReject(verifyWallet(api(), address));
});
test('surfaces an unreadable wallet network', async () => {
  await assert.rejects(connectFreighter(api({ getNetworkDetails: async () => ({ networkPassphrase: '', error: { message: 'Wallet is locked' } }) })), /locked/);
});
test('invalidates access when authorization has been revoked', async () => {
  await assert.rejects(verifyWallet(api({ getAddress: async () => ({ address: '', error: { message: 'Access revoked' } }) }), address), /revoked/);
});
