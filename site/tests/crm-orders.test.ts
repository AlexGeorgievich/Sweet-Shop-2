import test from 'node:test';
import assert from 'node:assert/strict';
import { countOrdersByStatus, filterOrders } from '../app/lib/crm-orders.ts';
import type { OrderRecord } from '../app/lib/order-record.ts';

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'SI-20260830-ABC123', createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z',
    name: 'Анна Смирнова', phone: '+7 927 000-00-00', dessert: 'Торты на заказ', eventDate: '2026-09-15', guests: 10,
    details: 'Ягодная начинка', prize: '', consultantSummary: '', source: 'Сайт · форма заявки', amountLabel: 'от 2 700 ₽/кг',
    status: 'new', telegram: { delivered: true, deliveredAt: '2026-08-30T10:00:02.000Z', lastError: null }, ...overrides,
  };
}

test('filters CRM orders by status and case-insensitive searchable fields', () => {
  const orders = [order(), order({ id: 'SI-PAID001', name: 'Борис', phone: '+7 999 111-22-33', status: 'paid' })];
  assert.deepEqual(filterOrders(orders, 'АННА', 'all').map((item) => item.id), ['SI-20260830-ABC123']);
  assert.deepEqual(filterOrders(orders, '111-22', 'paid').map((item) => item.id), ['SI-PAID001']);
  assert.deepEqual(filterOrders(orders, '', 'new').map((item) => item.id), ['SI-20260830-ABC123']);
});

test('counts every CRM status and total', () => {
  const counts = countOrdersByStatus([order(), order({ id: 'SI-PAID001', status: 'paid' })]);
  assert.equal(counts.all, 2);
  assert.equal(counts.new, 1);
  assert.equal(counts.paid, 1);
  assert.equal(counts.rejected, 0);
});

test('combines product, source and customer type facets with status and search', () => {
  const orders = [
    order({ dessert: 'Ягодный торт', source: 'Telegram', customerType: 'repeat', status: 'paid' }),
    order({ id: 'SI-OTHER01', dessert: 'Ягодный торт', source: 'Сайт · форма заявки', customerType: 'new', status: 'paid' }),
    order({ id: 'SI-OTHER02', dessert: 'Детский торт', source: 'Telegram', customerType: 'repeat', status: 'paid' }),
  ];

  assert.deepEqual(filterOrders(orders, 'Анна', 'paid', {
    product: 'Ягодный торт', source: 'Telegram', customerType: 'repeat',
  }).map((item) => item.id), ['SI-20260830-ABC123']);
});
