import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { redis } from '../../src/redis.js';

after(async () => { await redis.quit(); });

test('Redis is reachable', async () => {
  assert.equal(await redis.ping(), 'PONG');
});
