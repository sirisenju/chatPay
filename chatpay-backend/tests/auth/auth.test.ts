import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Keypair } from '@stellar/stellar-sdk';
import { buildApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { formatChallengeMessage } from '../../src/modules/auth/service.js';

describe('Auth Module & Tenant Isolation Tests (FR-A1 to FR-A4)', () => {
  let app: FastifyInstance;
  const userAKeypair = Keypair.random();
  const userBKeypair = Keypair.random();

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests to protected routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/recipients'
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('generates a valid authentication challenge for a public key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: {
        publicKey: userAKeypair.publicKey()
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('challenge');
    expect(body).toHaveProperty('nonce');
    expect(body).toHaveProperty('expiresAt');
    expect(body.challenge).toContain(userAKeypair.publicKey());
  });

  it('rejects an invalid ed25519 public key format on challenge request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: {
        publicKey: 'not_a_valid_stellar_key'
      }
    });

    expect(res.statusCode).toBe(400);
  });

  it('verifies wallet ed25519 signature and returns a valid session JWT token', async () => {
    // 1. Request challenge
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: {
        publicKey: userBKeypair.publicKey()
      }
    });
    const { nonce, expiresAt } = JSON.parse(challengeRes.body);

    // 2. Sign message using keypair
    const message = formatChallengeMessage(userBKeypair.publicKey(), nonce, new Date(expiresAt));
    const signature = userBKeypair.sign(Buffer.from(message, 'utf8')).toString('base64');

    // 3. Verify
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: {
        publicKey: userBKeypair.publicKey(),
        signature,
        nonce
      }
    });

    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.body);
    expect(verifyBody).toHaveProperty('token');
    expect(verifyBody.user.publicKey).toBe(userBKeypair.publicKey());

    // 4. Test that challenge cannot be reused (FR-A3 single-use)
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: {
        publicKey: userBKeypair.publicKey(),
        signature,
        nonce
      }
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(JSON.parse(reuseRes.body).code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid signature with 401 UNAUTHORIZED', async () => {
    const challengeRes = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: {
        publicKey: userAKeypair.publicKey()
      }
    });
    const { nonce } = JSON.parse(challengeRes.body);

    const badSignature = Buffer.from('invalid_signature_bytes').toString('base64');
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: {
        publicKey: userAKeypair.publicKey(),
        signature: badSignature,
        nonce
      }
    });

    expect(verifyRes.statusCode).toBe(401);
  });
});
