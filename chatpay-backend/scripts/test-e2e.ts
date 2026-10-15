import fs from 'fs';
import path from 'path';
import { Keypair, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

const BASE_URL = process.env.BASE_URL || 'https://chatpay-7anj.onrender.com';
const DEMO_ACCOUNTS_PATH = path.resolve(process.cwd(), 'demo-accounts.json');

interface DemoAccounts {
  sender: {
    publicKey: string;
    secretKey: string;
  };
  recipient: {
    publicKey: string;
    secretKey: string;
  };
}

async function runE2ETest() {
  console.log('====================================================');
  console.log('🚀 ChatPay End-to-End Test (Live Stellar Testnet)');
  console.log(`🎯 Target API URL: ${BASE_URL}`);
  console.log('====================================================\n');

  // 0. Load test accounts
  if (!fs.existsSync(DEMO_ACCOUNTS_PATH)) {
    throw new Error('❌ demo-accounts.json not found! Run npm run testnet:setup first.');
  }

  const demo: DemoAccounts = JSON.parse(fs.readFileSync(DEMO_ACCOUNTS_PATH, 'utf8'));
  const senderKeypair = Keypair.fromSecret(demo.sender.secretKey);
  const recipientPublicKey = demo.recipient.publicKey;

  console.log(`👤 Sender Public Key:    ${senderKeypair.publicKey()}`);
  console.log(`🎯 Recipient Public Key: ${recipientPublicKey}\n`);

  // 1. Health check
  console.log('Step 1: Checking Backend Health...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) {
    throw new Error(`Health check failed with HTTP ${healthRes.status}`);
  }
  const healthData = await healthRes.json();
  console.log('✅ Health check passed:', JSON.stringify(healthData), '\n');

  // 2. Auth Challenge
  console.log('Step 2: Requesting Ed25519 Authentication Challenge...');
  const challengeRes = await fetch(`${BASE_URL}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: senderKeypair.publicKey() })
  });

  if (!challengeRes.ok) {
    throw new Error(`Challenge request failed: ${await challengeRes.text()}`);
  }

  const { challenge, nonce } = await challengeRes.json();
  console.log('✅ Received challenge from server.');

  // Sign challenge with sender's ed25519 secret key
  const signature = senderKeypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');
  console.log('🔐 Cryptographically signed challenge with sender wallet.');

  // Verify challenge
  const verifyRes = await fetch(`${BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: senderKeypair.publicKey(),
      signature,
      nonce
    })
  });

  if (!verifyRes.ok) {
    throw new Error(`Auth verification failed: ${await verifyRes.text()}`);
  }

  const { token, user } = await verifyRes.json();
  console.log(`✅ Authenticated! JWT token issued for User ID: ${user.id}\n`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  // 3. Recipient Address Book Management
  console.log('Step 3: Ensuring Recipient "Alex" is in Address Book...');
  const listRecipientsRes = await fetch(`${BASE_URL}/recipients`, {
    headers: authHeaders
  });
  const existingRecipients = await listRecipientsRes.json();
  const foundAlex = Array.isArray(existingRecipients) && existingRecipients.find((r: any) => r.alias.toLowerCase() === 'alex');

  if (foundAlex) {
    console.log(`ℹ️ Recipient "Alex" already registered (${foundAlex.address})`);
  } else {
    const addRecipientRes = await fetch(`${BASE_URL}/recipients`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        alias: 'Alex',
        address: recipientPublicKey
      })
    });

    if (!addRecipientRes.ok) {
      throw new Error(`Add recipient failed: ${await addRecipientRes.text()}`);
    }
    const added = await addRecipientRes.json();
    console.log(`✅ Added recipient "Alex" (${added.address}) to address book.\n`);
  }

  // 4. Send Natural Language Command
  const commandText = 'Send 1 USDC to Alex';
  console.log(`\nStep 4: Sending Natural Language Command: "${commandText}"...`);
  const commandRes = await fetch(`${BASE_URL}/commands`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      text: commandText,
      clientMsgId: `msg_${Date.now()}`
    })
  });

  if (!commandRes.ok) {
    throw new Error(`Command processing failed: ${await commandRes.text()}`);
  }

  const commandResult = await commandRes.json();
  if (commandResult.type !== 'preview' || !commandResult.preview) {
    throw new Error(`Expected 'preview' type, got: ${JSON.stringify(commandResult)}`);
  }

  const { preview } = commandResult;
  console.log('✅ Generated Payment Preview:');
  console.log(`   - Payment ID:    ${preview.paymentId}`);
  console.log(`   - Amount:        ${preview.amount} ${preview.asset}`);
  console.log(`   - Recipient:     ${preview.recipientAlias} (${preview.recipientAddress})`);
  console.log(`   - Estimated Fee: ${preview.estimatedFee} stroops`);
  console.log(`   - Expires At:    ${preview.expiresAt}`);
  if (preview.warnings && preview.warnings.length > 0) {
    console.log(`   - Warnings:      ${preview.warnings.join(', ')}`);
  }

  // 5. Emulate Freighter Wallet Signing
  console.log('\nStep 5: Simulating Freighter Wallet Signing...');
  const tx = TransactionBuilder.fromXDR(preview.unsignedXdr, Networks.TESTNET);
  tx.sign(senderKeypair);
  const signedXdr = tx.toXDR();
  console.log('✅ Transaction signed by sender keypair.');

  // 6. Submit Signed Payment to Live Stellar Testnet
  console.log('\nStep 6: Submitting Signed Transaction to Stellar Testnet...');
  const submitRes = await fetch(`${BASE_URL}/payments/${preview.paymentId}/submit`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ signedXdr })
  });

  if (!submitRes.ok) {
    throw new Error(`Payment submission failed: ${await submitRes.text()}`);
  }

  const submitResult = await submitRes.json();
  console.log('✅ Submission Result:', JSON.stringify(submitResult, null, 2));

  // 7. Verify Status & Confirmation
  console.log('\nStep 7: Verifying On-Chain Confirmation Status...');
  let paymentRecord;
  for (let i = 0; i < 15; i++) {
    const statusRes = await fetch(`${BASE_URL}/payments/${preview.paymentId}`, {
      headers: authHeaders
    });
    paymentRecord = await statusRes.json();
    console.log(`   Current Status: ${paymentRecord.status} (attempt ${i + 1})`);

    if (paymentRecord.status === 'confirmed' || paymentRecord.status === 'failed') {
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (paymentRecord.status !== 'confirmed') {
    throw new Error(`Payment did not confirm in time. Final status: ${paymentRecord.status}`);
  }

  console.log('\n====================================================');
  console.log('🎉 END-TO-END TEST PASSED SUCCESSFULLY!');
  console.log('====================================================');
  console.log(`Tx Hash:      ${paymentRecord.txHash}`);
  console.log(`Status:       ${paymentRecord.status}`);
  console.log(`Amount:       ${paymentRecord.amount} ${paymentRecord.assetCode}`);
  console.log(`Confirmed At: ${paymentRecord.confirmedAt}`);
  console.log(`Explorer:     https://stellar.expert/explorer/testnet/tx/${paymentRecord.txHash}`);
  console.log('====================================================\n');
}

runE2ETest().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err.message || err);
  process.exit(1);
});
