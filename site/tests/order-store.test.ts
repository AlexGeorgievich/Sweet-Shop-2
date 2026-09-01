import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listOrders, saveOrder, updateOrderStatus } from '../app/lib/order-store.ts';
import type { OrderRecord } from '../app/lib/order-record.ts';

function record(id: string, createdAt: string): OrderRecord {
  return {
    id, createdAt, updatedAt: createdAt, name: 'Анна', phone: '+7 927 000-00-00',
    dessert: 'Торты на заказ', eventDate: '2026-09-15', guests: 10,
    details: 'Ягодная начинка', prize: '', consultantSummary: '',
    source: 'Сайт · форма заявки', amountLabel: 'от 2 700 ₽/кг', status: 'new',
    telegram: { delivered: false, deliveredAt: null, lastError: null },
  };
}

test('persists one JSON file per order and lists newest first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweet-story-orders-'));
  try {
    await saveOrder(record('SI-OLD001', '2026-08-29T10:00:00.000Z'), directory);
    await saveOrder(record('SI-NEW001', '2026-08-30T10:00:00.000Z'), directory);
    const stored = JSON.parse(await readFile(join(directory, 'SI-NEW001.json'), 'utf8')) as OrderRecord;
    assert.equal(stored.id, 'SI-NEW001');
    assert.deepEqual((await listOrders(directory)).map((item) => item.id), ['SI-NEW001', 'SI-OLD001']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('updates a valid status and rejects an invalid status', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sweet-story-orders-'));
  try {
    await saveOrder(record('SI-STATUS1', '2026-08-30T10:00:00.000Z'), directory);
    assert.equal((await updateOrderStatus('SI-STATUS1', 'contacted', directory)).status, 'contacted');
    await assert.rejects(() => updateOrderStatus('SI-STATUS1', 'unknown' as never, directory), /Недопустимый статус/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

