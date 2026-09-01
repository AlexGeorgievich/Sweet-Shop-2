import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoOrders } from '../app/lib/demo-orders.ts';

test('generates 1000 complete deterministic confectionery orders for three months', () => {
  const first = generateDemoOrders(1_000, { seed: 20260830, startDate: '2026-06-01', endDate: '2026-08-30' });
  const second = generateDemoOrders(1_000, { seed: 20260830, startDate: '2026-06-01', endDate: '2026-08-30' });

  assert.equal(first.length, 1_000);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((order) => order.id)).size, 1_000);
  for (const order of first) {
    assert.match(order.id, /^SI-DEMO-\d{4}$/);
    assert.ok(order.createdAt.slice(0, 10) >= '2026-06-01' && order.createdAt.slice(0, 10) <= '2026-08-30');
    assert.ok(order.eventDate >= order.createdAt.slice(0, 10));
    assert.ok(order.dessert && order.weightKg && order.decor && order.amountRub);
    assert.ok(order.source && order.name && order.phone && order.status && order.customerType);
    assert.ok(order.details.length > 20);
    assert.ok(order.consultantSummary.length > 20);
    assert.equal(typeof order.responseMinutes === 'number' || order.responseMinutes === null, true);
    assert.equal(order.firstResponseAt === null, order.responseMinutes === null);
    if (order.firstResponseAt) assert.ok(order.firstResponseAt >= order.createdAt);
    assert.equal(order.amountLabel, `${order.amountRub.toLocaleString('ru-RU')} ₽`);
  }

  assert.deepEqual(new Set(first.map((order) => order.status)), new Set(['new', 'contacted', 'agreement', 'paid', 'rejected']));
  assert.ok(new Set(first.map((order) => order.dessert)).size >= 6);
  assert.ok(new Set(first.map((order) => order.source)).size >= 5);
});

test('makes Friday and Saturday pickup load higher than ordinary weekdays', () => {
  const orders = generateDemoOrders(1_000, { seed: 20260830, startDate: '2026-06-01', endDate: '2026-08-30' });
  const counts = Array(7).fill(0) as number[];
  orders.forEach((order) => counts[new Date(`${order.eventDate}T12:00:00Z`).getUTCDay()] += 1);
  const fridaySaturdayAverage = (counts[5] + counts[6]) / 2;
  const weekdayAverage = (counts[1] + counts[2] + counts[3] + counts[4]) / 4;
  assert.ok(fridaySaturdayAverage > weekdayAverage * 1.5, JSON.stringify(counts));
  const repeatShare = orders.filter((order) => order.customerType === 'repeat').length / orders.length;
  assert.ok(repeatShare > 0.2 && repeatShare < 0.35);
});
