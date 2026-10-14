import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';

describe('Health Check Endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with service status and horizon url', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.2.0');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('database');
    expect(body.stellarHorizon).toContain('horizon-testnet.stellar.org');
  });

  it('GET /docs returns 200 with Swagger UI documentation', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs'
    });

    // 200 or 302 redirect to /docs/
    expect([200, 302]).toContain(response.statusCode);
  });
});
