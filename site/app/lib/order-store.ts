import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isOrderStatus } from './order-record.ts';
import type { OrderRecord, OrderStatus } from './order-record.ts';

export function ordersDirectory() {
  return process.env.ORDER_DATA_DIR || join(process.cwd(), '.data', 'orders');
}

function safeOrderId(id: string) {
  if (!/^SI-[A-Z0-9-]{3,80}$/.test(id)) throw new Error('Недопустимый номер заявки.');
  return id;
}

async function atomicWrite(record: OrderRecord, directory: string) {
  await mkdir(directory, { recursive: true });
  const id = safeOrderId(record.id);
  const target = join(directory, `${id}.json`);
  const temporary = join(directory, `.${id}.${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, target);
}

export async function saveOrder(record: OrderRecord, directory = ordersDirectory()) {
  await atomicWrite(record, directory);
  return record;
}

export async function listOrders(directory = ordersDirectory()): Promise<OrderRecord[]> {
  await mkdir(directory, { recursive: true });
  const names = await readdir(directory);
  const orders: OrderRecord[] = [];
  for (const name of names.filter((item) => /^SI-[A-Z0-9-]+\.json$/.test(item))) {
    try {
      const parsed = JSON.parse(await readFile(join(directory, name), 'utf8')) as OrderRecord;
      if (parsed?.id && parsed.createdAt) orders.push(parsed);
    } catch (error) {
      console.error(`Cannot read order file ${name}:`, error instanceof Error ? error.message : error);
    }
  }
  return orders.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function updateOrderStatus(id: string, status: OrderStatus, directory = ordersDirectory()) {
  if (!isOrderStatus(status)) throw new Error('Недопустимый статус заявки.');
  const safeId = safeOrderId(id);
  let record: OrderRecord;
  try {
    record = JSON.parse(await readFile(join(directory, `${safeId}.json`), 'utf8')) as OrderRecord;
  } catch {
    const failure = new Error('Заявка не найдена.') as Error & { code?: string };
    failure.code = 'ORDER_NOT_FOUND';
    throw failure;
  }
  const updated = { ...record, status, updatedAt: new Date().toISOString() };
  await atomicWrite(updated, directory);
  return updated;
}
