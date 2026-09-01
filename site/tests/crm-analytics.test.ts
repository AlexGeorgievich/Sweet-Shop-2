import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsSummary, filterAnalyticsOrders, minimumAmountRub } from '../app/lib/crm-analytics.ts';
import type { OrderRecord } from '../app/lib/order-record.ts';

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'SI-ONE001', createdAt: '2026-08-28T10:00:00.000Z', updatedAt: '2026-08-28T10:00:00.000Z', name: 'Анна', phone: '+7 900 000-00-00',
    dessert: 'Торты на заказ', eventDate: '2026-09-10', guests: 10, details: 'Ягоды', prize: '', consultantSummary: '',
    source: 'Сайт · форма заявки', amountLabel: 'от 2 700 ₽/кг', status: 'new', telegram: { delivered: true, deliveredAt: null, lastError: null }, ...overrides,
  };
}

test('calculates paid minimum revenue, conversion and average check', () => {
  const summary = analyticsSummary([order({ status: 'paid' }), order({ id: 'SI-TWO002', status: 'rejected', amountLabel: 'от 900 ₽' })]);
  assert.deepEqual(summary, { orders: 2, paid: 1, conversion: 0.5, revenue: 2700, averageCheck: 2700 });
  assert.equal(minimumAmountRub('от 12 500 ₽'), 12500);
});

test('applies period, product, source and exact-day filters together', () => {
  const orders = [order(), order({ id: 'SI-TWO002', createdAt: '2026-08-01T10:00:00.000Z', dessert: 'Воздушное безе' })];
  const filtered = filterAnalyticsOrders(orders, { period: '7d', product: 'Торты на заказ', source: 'Сайт · форма заявки', day: '2026-08-28' }, new Date('2026-08-30T10:00:00.000Z'));
  assert.deepEqual(filtered.map((item) => item.id), ['SI-ONE001']);
});
