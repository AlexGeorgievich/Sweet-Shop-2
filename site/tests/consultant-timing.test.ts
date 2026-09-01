import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSULTANT_FIRST_DELAY, CONSULTANT_REOPEN_DELAY, ORDER_RELOAD_DELAY, shouldScheduleWheel, WHEEL_AFTER_CONSULTANT_DELAY } from '../app/lib/consultant-timing.ts';

test('uses the requested staged engagement delays', () => {
  assert.equal(CONSULTANT_FIRST_DELAY, 5_000);
  assert.equal(CONSULTANT_REOPEN_DELAY, 10_000);
  assert.equal(WHEEL_AFTER_CONSULTANT_DELAY, 5_000);
  assert.equal(ORDER_RELOAD_DELAY, 5_000);
});

test('schedules the wheel after the first consultant close', () => {
  assert.equal(shouldScheduleWheel(1), true);
  assert.equal(shouldScheduleWheel(0), false);
});
