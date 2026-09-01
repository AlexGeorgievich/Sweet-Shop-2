import assert from 'node:assert/strict';
import test from 'node:test';

import { demoConfirmation, modeLabel } from '../app/lib/data-mode.ts';

test('labels both isolated CRM modes', () => {
  assert.equal(modeLabel('production'), 'Реальные данные');
  assert.equal(modeLabel('demo'), 'Демо');
});

test('confirmation states that only demo data is replaced', () => {
  const text = demoConfirmation(1000);
  assert.match(text, /1000/);
  assert.match(text, /только демонстрационные/i);
  assert.match(text, /реальные данные не изменятся/i);
});
