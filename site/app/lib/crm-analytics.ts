import type { OrderRecord, OrderStatus } from './order-record.ts';

export type AnalyticsPeriod = '7d' | '30d' | 'all';
export type AnalyticsFilters = { period: AnalyticsPeriod; product: string; source: string; day: string };

const moscowDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
});
const moscowPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Moscow', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
});

export function orderDayKey(createdAt: string) {
  return moscowDayFormatter.format(new Date(createdAt));
}

export function minimumAmountRub(amountLabel: string) {
  const match = amountLabel.match(/([\d\s]+)\s*₽/);
  return match ? Number(match[1].replace(/\s/g, '')) || 0 : 0;
}

export function filterAnalyticsOrders(orders: OrderRecord[], filters: AnalyticsFilters, now = new Date()) {
  const dayMs = 86_400_000;
  const cutoff = filters.period === 'all' ? Number.NEGATIVE_INFINITY : now.getTime() - Number.parseInt(filters.period, 10) * dayMs;
  return orders.filter((order) => {
    const created = new Date(order.createdAt).getTime();
    return created >= cutoff
      && (!filters.product || order.dessert === filters.product)
      && (!filters.source || order.source === filters.source)
      && (!filters.day || orderDayKey(order.createdAt) === filters.day);
  });
}

export function analyticsSummary(orders: OrderRecord[]) {
  const paid = orders.filter((order) => order.status === 'paid');
  const revenue = paid.reduce((sum, order) => sum + (order.amountRub ?? minimumAmountRub(order.amountLabel)), 0);
  return {
    orders: orders.length,
    paid: paid.length,
    conversion: orders.length ? paid.length / orders.length : 0,
    revenue,
    averageCheck: paid.length ? Math.round(revenue / paid.length) : 0,
  };
}

export function countBy(orders: OrderRecord[], key: 'dessert' | 'source') {
  const counts = new Map<string, number>();
  orders.forEach((order) => counts.set(order[key], (counts.get(order[key]) ?? 0) + 1));
  return [...counts].map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'ru'));
}

export function revenueByDay(orders: OrderRecord[]) {
  const totals = new Map<string, number>();
  orders.filter((order) => order.status === 'paid').forEach((order) => {
    const day = orderDayKey(order.createdAt);
    totals.set(day, (totals.get(day) ?? 0) + (order.amountRub ?? minimumAmountRub(order.amountLabel)));
  });
  return [...totals].map(([day, value]) => ({ day, value })).sort((left, right) => left.day.localeCompare(right.day));
}

export function funnelCounts(orders: OrderRecord[]) {
  const stages: { status: OrderStatus; label: string }[] = [
    { status: 'new', label: 'Новые' }, { status: 'contacted', label: 'Связались' },
    { status: 'agreement', label: 'Согласование' }, { status: 'paid', label: 'Оплачено' },
    { status: 'rejected', label: 'Отказ' },
  ];
  return stages.map((stage) => ({ ...stage, value: orders.filter((order) => order.status === stage.status).length }));
}

const weekdayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const heatmapWeekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const heatmapPeriods = ['Ночь', 'Утро', 'День', 'Вечер'];

export function orderHeatmap(orders: OrderRecord[]) {
  const matrix = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  orders.forEach((order) => {
    const parts = moscowPartsFormatter.formatToParts(new Date(order.createdAt));
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const weekdayIndex = Math.max(0, weekdayKeys.indexOf(weekday));
    const periodIndex = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    matrix[weekdayIndex][periodIndex] += 1;
  });
  return matrix;
}
