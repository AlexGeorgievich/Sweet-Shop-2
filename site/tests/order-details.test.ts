import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOrderDetails } from '../app/lib/order-details.ts';

test('includes the guest count in the order details sent to the manager', () => {
  assert.equal(
    formatOrderDetails('Клубничная начинка', 10),
    'Клубничная начинка\nКоличество гостей: 10',
  );
});

test('keeps an empty comment useful when only guest count is provided', () => {
  assert.equal(formatOrderDetails('', 4), 'Количество гостей: 4');
});
