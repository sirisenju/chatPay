import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { Keypair } from '@stellar/stellar-sdk';
import { buildApp } from '../../src/app.js';
import { formatChallengeMessage } from '../../src/modules/auth/service.js';

describe('Recipient Management & Address Book Tests (FR-R1 to FR-R4)', () => {
  let app: FastifyInstance;
  let userAToken: string;
  let userBToken: string;
  const userAKeypair = Keypair.random();
  const userBKeypair = Keypair.random();
  const alexKeypair = Keypair.random();
  const bobKeypair = Keypair.random();

  async function authenticateUser(keypair: Keypair): Promise<string> {
    const chRes = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload: { publicKey: keypair.publicKey() }
    });
    const { nonce, expiresAt } = JSON.parse(chRes.body);
    const msg = formatChallengeMessage(keypair.publicKey(), nonce, new Date(expiresAt));
    const signature = keypair.sign(Buffer.from(msg, 'utf8')).toString('base64');
    const vRes = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: {
        publicKey: keypair.publicKey(),
        signature,
        nonce
      }
    });
    return JSON.parse(vRes.body).token;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    userAToken = await authenticateUser(userAKeypair);
    userBToken = await authenticateUser(userBKeypair);
  });

  afterAll(async () => {
    await app.close();
  });

  it('user A can add a recipient with an alias and Stellar address', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        alias: 'Alex',
        address: alexKeypair.publicKey()
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.alias).toBe('Alex');
    expect(body.address).toBe(alexKeypair.publicKey());
    expect(body).toHaveProperty('id');
  });

  it('rejects duplicate recipient alias for the same user (case-insensitive)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        alias: 'alex', // lowercase duplicate of 'Alex'
        address: bobKeypair.publicKey()
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('CONFLICT');
  });

  it('allows user B to have the same alias in their own address book (tenant isolation)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/recipients',
      headers: { authorization: `Bearer ${userBToken}` },
      payload: {
        alias: 'Alex',
        address: alexKeypair.publicKey()
      }
    });

    expect(res.statusCode).toBe(201);
  });

  it('rejects adding your own wallet address as a recipient', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` },
      payload: {
        alias: 'Myself',
        address: userAKeypair.publicKey()
      }
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('SELF_TRANSFER_NOT_ALLOWED');
  });

  it('lists recipients scoped only to the authenticated user', async () => {
    const resA = await app.inject({
      method: 'GET',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` }
    });
    const listA = JSON.parse(resA.body);
    expect(listA.length).toBe(1);
    expect(listA[0].alias).toBe('Alex');

    const resB = await app.inject({
      method: 'GET',
      url: '/recipients',
      headers: { authorization: `Bearer ${userBToken}` }
    });
    const listB = JSON.parse(resB.body);
    expect(listB.length).toBe(1);
  });

  it('user A can update their recipient alias', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` }
    });
    const recipient = JSON.parse(listRes.body)[0];

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/recipients/${recipient.id}`,
      headers: { authorization: `Bearer ${userAToken}` },
      payload: { alias: 'Alexander' }
    });

    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).alias).toBe('Alexander');
  });

  it('user B cannot edit or delete user A recipient (cross-user isolation)', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` }
    });
    const recipientA = JSON.parse(listRes.body)[0];

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/recipients/${recipientA.id}`,
      headers: { authorization: `Bearer ${userBToken}` },
      payload: { alias: 'Hacked' }
    });
    expect(patchRes.statusCode).toBe(404);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/recipients/${recipientA.id}`,
      headers: { authorization: `Bearer ${userBToken}` }
    });
    expect(deleteRes.statusCode).toBe(404);
  });

  it('user A can delete their recipient', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` }
    });
    const recipient = JSON.parse(listRes.body)[0];

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/recipients/${recipient.id}`,
      headers: { authorization: `Bearer ${userAToken}` }
    });
    expect(delRes.statusCode).toBe(204);

    const checkRes = await app.inject({
      method: 'GET',
      url: '/recipients',
      headers: { authorization: `Bearer ${userAToken}` }
    });
    expect(JSON.parse(checkRes.body).length).toBe(0);
  });
});
