import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteWebhook, getUpdates, forwardUpdate, processUpdateBatch, retryDelay,
} from '../scripts/telegram-polling-core.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('getUpdates sends offset, timeout and only message updates', async () => {
  let captured;
  const updates = await getUpdates(async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return jsonResponse({ ok: true, result: [{ update_id: 40 }] });
  }, { token: 'secret-token', offset: 39, timeout: 25 });
  assert.equal(captured.url, 'https://api.telegram.org/botsecret-token/getUpdates');
  assert.deepEqual(captured.body, { offset: 39, timeout: 25, allowed_updates: ['message'] });
  assert.equal(updates[0].update_id, 40);
});

test('Telegram ok false is an error without exposing the token', async () => {
  await assert.rejects(
    () => getUpdates(async () => jsonResponse({ ok: false, error_code: 409, description: 'Conflict' }), { token: 'very-secret', offset: 0 }),
    (error) => error instanceof Error && /409/.test(error.message) && !error.message.includes('very-secret'),
  );
});

test('forwards update to local webhook with protected JSON request', async () => {
  let captured;
  await forwardUpdate(async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return jsonResponse({ ok: true });
  }, { url: 'http://127.0.0.1:3000/api/telegram/webhook', secret: 'local-secret', update: { update_id: 7 } });
  assert.equal(captured.url, 'http://127.0.0.1:3000/api/telegram/webhook');
  assert.equal(captured.init.headers['x-telegram-bot-api-secret-token'], 'local-secret');
  assert.deepEqual(captured.body, { update_id: 7 });
});

test('batch advances offset only through successfully forwarded updates', async () => {
  const seen = [];
  await assert.rejects(() => processUpdateBatch([{ update_id: 4 }, { update_id: 5 }, { update_id: 6 }], 4, async (update) => {
    seen.push(update.update_id);
    if (update.update_id === 5) throw new Error('site unavailable');
  }), /site unavailable/);
  assert.deepEqual(seen, [4, 5]);
  assert.equal(await processUpdateBatch([{ update_id: 8 }, { update_id: 9 }], 8, async () => undefined), 10);
});

test('deleteWebhook keeps pending updates and retry delay caps at ten seconds', async () => {
  let body;
  await deleteWebhook(async (_url, init) => { body = JSON.parse(init.body); return jsonResponse({ ok: true, result: true }); }, 'token');
  assert.deepEqual(body, { drop_pending_updates: false });
  assert.deepEqual([0, 1, 2, 7].map(retryDelay), [1000, 2000, 5000, 10000]);
});
