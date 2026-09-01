import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder } from '../app/lib/order-validation.ts';

const validOrder = {
  name: 'Анна',
  phone: '+7 927 000-00-00',
  dessert: 'Торты на заказ',
  date: '2026-09-10',
  guests: '10',
  details: 'Клубничная начинка и светлое оформление',
  consent: true,
};

test('accepts an order when every visible field is filled correctly', () => {
  assert.deepEqual(validateOrder(validOrder, '2026-08-29'), {});
});

test('returns a message for every missing or invalid order field', () => {
  const errors = validateOrder({ name: '', phone: '123', dessert: '', date: '2026-08-20', guests: '0', details: '', consent: false }, '2026-08-29');
  assert.deepEqual(Object.keys(errors).sort(), ['consent', 'date', 'dessert', 'details', 'guests', 'name', 'phone']);
});
