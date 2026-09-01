import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderRecord } from '../app/lib/order-record.ts';

test('creates a CRM record with source, base amount, and pending Telegram state', () => {
  const record = createOrderRecord({
    id: 'SI-20260830-ABC123',
    createdAt: '2026-08-30T10:00:00.000Z',
    name: 'Анна', phone: '+7 927 000-00-00', dessert: 'Торты на заказ',
    eventDate: '2026-09-15', guests: 20, details: 'Светлое оформление',
    prize: 'Скидка 10%', consultantSummary: 'Свадебный торт на 20 гостей.',
  });

  assert.equal(record.status, 'new');
  assert.equal(record.source, 'Сайт · колесо подарков');
  assert.equal(record.amountLabel, 'от 2 700 ₽/кг');
  assert.deepEqual(record.telegram, { delivered: false, deliveredAt: null, lastError: null });
});

