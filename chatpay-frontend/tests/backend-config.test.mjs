import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackendBaseUrl } from '../lib/backend-config.ts';
test('local development uses the local API',()=>assert.equal(resolveBackendBaseUrl(undefined,'development'),'http://localhost:4000'));
test('deployed production defaults to the Render API',()=>assert.equal(resolveBackendBaseUrl(undefined,'production'),'https://chatpay-7anj.onrender.com'));
test('an explicit backend target overrides the environment default',()=>assert.equal(resolveBackendBaseUrl(' https://staging.example/api/ ','production'),'https://staging.example/api'));
test('a blank override preserves the environment default',()=>assert.equal(resolveBackendBaseUrl('  ','production'),'https://chatpay-7anj.onrender.com'));
test('non-HTTP backend URLs are rejected',()=>assert.throws(()=>resolveBackendBaseUrl('file:///tmp/api','production'),/HTTP/));
