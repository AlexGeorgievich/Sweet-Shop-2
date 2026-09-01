import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCrmSurface, parseListenerPids } from '../scripts/local-runtime.mjs';

test('finds every unique listener bound to the requested port', () => {
  const output = `
  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    6596
  TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    42848
  TCP    [::]:3000       [::]:0       LISTENING    6596
  TCP    127.0.0.1:51000 127.0.0.1:3000 TIME_WAIT   0
`;
  assert.deepEqual(parseListenerPids(output, 3000), [6596, 42848]);
});

test('rejects a stale CRM surface without the interactive controls', () => {
  assert.throws(() => assertCrmSurface('<main><h1>Заявки</h1></main>'), /устаревшую CRM/);
  assert.doesNotThrow(() => assertCrmSurface('<nav><a href="/crm/analytics">Аналитика</a></nav><div class="crm-facets"></div><div class="crm-table-footer"></div>'));
});
