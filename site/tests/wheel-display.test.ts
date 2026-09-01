import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowWheelOnPageLoad } from '../app/lib/wheel-display.ts';

test('shows the wheel again after a page reload even when an older session flag exists', () => {
  assert.equal(shouldShowWheelOnPageLoad('1'), true);
});

test('shows the wheel on a first page load', () => {
  assert.equal(shouldShowWheelOnPageLoad(null), true);
});
