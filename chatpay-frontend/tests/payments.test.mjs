import test from 'node:test';
import assert from 'node:assert/strict';
import { approvePayment } from '../lib/payment-flow.ts';
import { TESTNET_PASSPHRASE } from '../lib/wallet.ts';
const address='G'+'A'.repeat(55);
const preview={ paymentId:'one', expiresAt: new Date(Date.now()+60000).toISOString(), unsignedXdr:'unsigned' };
function wallet(overrides={}) { return { getNetworkDetails:async()=>({networkPassphrase:TESTNET_PASSPHRASE}),getAddress:async()=>({address}),signTransaction:async()=>({signedTxXdr:'signed',signerAddress:address}), ...overrides }; }
test('does not ask the wallet to sign an expired preview',async()=>{
 await assert.rejects(approvePayment({...preview,expiresAt:'2000-01-01'},address,wallet({signTransaction:async()=>assert.fail()}),async()=>assert.fail(),()=>true),/expired/);
});
test('never submits a rejected wallet request',async()=>{
 await assert.rejects(approvePayment(preview,address,wallet({signTransaction:async()=>({error:{message:'Rejected'},signedTxXdr:'',signerAddress:''})}),async()=>assert.fail(),()=>true),/Rejected/);
});
test('never submits a signature from a different account',async()=>{
 await assert.rejects(approvePayment(preview,address,wallet({signTransaction:async()=>({signedTxXdr:'signed',signerAddress:'other'})}),async()=>assert.fail(),()=>true),/account/);
});
test('cancelling while wallet is open prevents submission',async()=>{
 let active=true;
 await assert.rejects(approvePayment(preview,address,wallet({signTransaction:async()=>{active=false;return {signedTxXdr:'signed',signerAddress:address}}}),async()=>assert.fail(),()=>active),/cancelled/);
});
test('submits exactly the approved signed XDR',async()=>{
 const result=await approvePayment(preview,address,wallet(),async xdr=>{assert.equal(xdr,'signed');return {status:'submitted'}},()=>true);
 assert.equal(result.status,'submitted');
});

test('network changes during signing prevent submission',async()=>{
 let network=TESTNET_PASSPHRASE;
 await assert.rejects(approvePayment(preview,address,wallet({getNetworkDetails:async()=>({networkPassphrase:network}),signTransaction:async()=>{network='mainnet';return {signedTxXdr:'signed',signerAddress:address}}}),async()=>assert.fail(),()=>true),/network changed/);
});
