import { generateDemoOrders } from '../app/lib/demo-orders.ts';
import { saveOrder } from '../app/lib/order-store.ts';

const countArgument = process.argv.find((value) => value.startsWith('--count='));
const count = countArgument ? Number(countArgument.split('=')[1]) : 1_000;
if (!Number.isInteger(count) || count < 1 || count > 10_000) throw new Error('Параметр --count должен быть целым числом от 1 до 10000.');

const orders = generateDemoOrders(count, { seed: 20260830, startDate: '2026-06-01', endDate: '2026-08-30' });
for (let index = 0; index < orders.length; index += 50) {
  await Promise.all(orders.slice(index, index + 50).map((order) => saveOrder(order)));
}

const weekdayCounts = Array(7).fill(0) as number[];
orders.forEach((order) => weekdayCounts[new Date(`${order.eventDate}T12:00:00Z`).getUTCDay()] += 1);
const repeat = orders.filter((order) => order.customerType === 'repeat').length;
console.log(JSON.stringify({ generated: orders.length, period: ['2026-06-01', '2026-08-30'], pickupByWeekday: { sun: weekdayCounts[0], mon: weekdayCounts[1], tue: weekdayCounts[2], wed: weekdayCounts[3], thu: weekdayCounts[4], fri: weekdayCounts[5], sat: weekdayCounts[6] }, newCustomers: orders.length - repeat, repeatCustomers: repeat }));
