import fs from 'fs';
import path from 'path';
import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder
} from '@stellar/stellar-sdk';
import { STELLAR_CONFIG } from '../src/config/stellar.js';

const HORIZON_URL = STELLAR_CONFIG.horizonUrl;
const server = new Horizon.Server(HORIZON_URL);

async function fundWithFriendbot(publicKey: string): Promise<void> {
  console.log(`🤖 Funding account via Friendbot: ${publicKey}...`);
  try {
    const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    if (!res.ok) {
      const text = await res.text();
      console.warn(`Friendbot notice for ${publicKey}: ${text}`);
    } else {
      console.log(`✅ Funded ${publicKey} successfully.`);
    }
  } catch (err) {
    console.error(`Error requesting Friendbot for ${publicKey}:`, err);
  }
}

async function addTrustline(accountKeypair: Keypair, asset: Asset): Promise<void> {
  const account = await server.loadAccount(accountKeypair.publicKey());

  // Check if trustline already exists
  const hasTrust = account.balances.some(
    (b) =>
      'asset_code' in b &&
      'asset_issuer' in b &&
      b.asset_code === asset.getCode() &&
      b.asset_issuer === asset.getIssuer()
  );

  if (hasTrust) {
    console.log(`ℹ️ Trustline for ${asset.getCode()} already exists on ${accountKeypair.publicKey()}`);
    return;
  }

  console.log(`🔗 Adding trustline for ${asset.getCode()} on ${accountKeypair.publicKey()}...`);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(
      Operation.changeTrust({
        asset,
        limit: '1000000000'
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(accountKeypair);
  await server.submitTransaction(tx);
  console.log(`✅ Trustline for ${asset.getCode()} established.`);
}

async function mintTestAsset(issuerKeypair: Keypair, destinationPublicKey: string, asset: Asset, amount: string): Promise<void> {
  const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());
  console.log(`🪙 Minting ${amount} ${asset.getCode()} from issuer to ${destinationPublicKey}...`);

  const tx = new TransactionBuilder(issuerAccount, {
    fee: '100',
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(
      Operation.payment({
        destination: destinationPublicKey,
        asset,
        amount
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(issuerKeypair);
  await server.submitTransaction(tx);
  console.log(`✅ Minted ${amount} ${asset.getCode()} successfully.`);
}

async function runSetup() {
  console.log('🚀 Starting Stellar Testnet Setup...');

  // 1. Generate keypairs for demo sender, recipient, and test issuer
  const sender = Keypair.random();
  const recipient = Keypair.random();
  const testIssuer = Keypair.random();

  console.log('\n--- Generated Public Keys ---');
  console.log(`Sender:      ${sender.publicKey()}`);
  console.log(`Recipient:   ${recipient.publicKey()}`);
  console.log(`Test Issuer: ${testIssuer.publicKey()}`);

  // 2. Fund with Friendbot
  await fundWithFriendbot(sender.publicKey());
  await fundWithFriendbot(recipient.publicKey());
  await fundWithFriendbot(testIssuer.publicKey());

  // 3. Define Assets
  const circleUsdcAsset = new Asset(STELLAR_CONFIG.usdc.code, STELLAR_CONFIG.usdc.issuer);
  const testUsdcAsset = new Asset('USDC', testIssuer.publicKey());

  // 4. Add trustlines
  try {
    // Add Circle USDC trustline
    await addTrustline(sender, circleUsdcAsset);
    await addTrustline(recipient, circleUsdcAsset);

    // Add project test-issuer USDC trustline for automated tests
    await addTrustline(sender, testUsdcAsset);
    await addTrustline(recipient, testUsdcAsset);

    // 5. Mint test asset to sender
    await mintTestAsset(testIssuer, sender.publicKey(), testUsdcAsset, '10000.0000000');
  } catch (err) {
    console.warn('Note on trustline/minting:', (err as Error).message);
  }

  // 6. Write secrets to gitignored .env.demo file (NEVER committed to git)
  const envDemoContent = `# ChatPay Demo & Testnet Accounts (Gitignored)
# Generated at ${new Date().toISOString()}

# Sender Account
DEMO_SENDER_PUBLIC_KEY=${sender.publicKey()}
DEMO_SENDER_SECRET_KEY=${sender.secret()}

# Recipient Account
DEMO_RECIPIENT_PUBLIC_KEY=${recipient.publicKey()}
DEMO_RECIPIENT_SECRET_KEY=${recipient.secret()}

# Test Issuer Account
TEST_ISSUER_PUBLIC_KEY=${testIssuer.publicKey()}
TEST_ISSUER_SECRET_KEY=${testIssuer.secret()}

# Circle Testnet USDC Faucet:
# Request 10 Circle Testnet USDC for ${sender.publicKey()} at:
# https://faucet.circle.com/
`;

  const outputPath = path.resolve(process.cwd(), '.env.demo');
  fs.writeFileSync(outputPath, envDemoContent, 'utf8');

  console.log(`\n💾 Test credentials successfully written to: ${outputPath}`);
  console.log('👉 To acquire Circle Testnet USDC for demo accounts, visit: https://faucet.circle.com/');
  console.log(`   Use Sender Address: ${sender.publicKey()}`);
  console.log('✨ Stellar Testnet setup completed successfully!\n');
}

runSetup().catch((err) => {
  console.error('❌ Testnet setup failed:', err);
  process.exit(1);
});
