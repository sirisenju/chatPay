import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { verifyMessageSignature } from '../../src/modules/auth/message-signature.ts';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const check = (payload, signature) => verify(null, payload, publicKey, signature);
test('accepts the Freighter SEP-53 signature format', () => {
  const message = 'ChatPay Authentication Challenge\nNonce: one-use';
  const payload = createHash('sha256').update('Stellar Signed Message:\n').update(message).digest();
  assert.equal(verifyMessageSignature(message, sign(null, payload, privateKey).toString('base64'), check), true);
});
test('preserves raw signature compatibility', () => {
  assert.equal(verifyMessageSignature('challenge', sign(null, Buffer.from('challenge'), privateKey).toString('base64'), check), true);
});
test('rejects changed challenges and malformed signatures', () => {
  const sig = sign(null, Buffer.from('challenge'), privateKey).toString('base64');
  assert.equal(verifyMessageSignature('other', sig, check), false);
  assert.equal(verifyMessageSignature('challenge', 'invalid', check), false);
});

test('accepts the official SEP-53 published test vector', () => {
  const address='GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L';
  let bits=0, value=0; const bytes=[];
  for(const character of address){value=(value<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character);bits+=5;if(bits>=8){bits-=8;bytes.push((value>>bits)&255)}}
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(bytes).subarray(1,33)]),format:'der',type:'spki'});
  assert.equal(verifyMessageSignature('Hello, World!', 'fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==', (payload, signature)=>verify(null,payload,key,signature)),true);
});
