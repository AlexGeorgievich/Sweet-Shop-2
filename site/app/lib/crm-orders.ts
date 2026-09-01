import type { OrderRecord, OrderStatus } from './order-record.ts';

export type CrmFilter = 'all' | OrderStatus;
export type CrmFacets = { product?: string; source?: string; customerType?: 'all' | 'new' | 'repeat' };

function searchableOrderText(order: OrderRecord) {
  return [order.id, order.name, order.phone, order.dessert, order.source, order.details, order.prize]
    .join(' ')
    .toLocaleLowerCase('ru-RU');
}

export function filterOrders(orders: OrderRecord[], search: string, filter: CrmFilter, facets: CrmFacets = {}) {
  const query = search.trim().toLocaleLowerCase('ru-RU');
  return orders.filter((order) => {
    const matchesStatus = filter === 'all' || order.status === filter;
    const matchesProduct = !facets.product || order.dessert === facets.product;
    const matchesSource = !facets.source || order.source === facets.source;
    const matchesCustomer = !facets.customerType || facets.customerType === 'all' || order.customerType === facets.customerType;
    return matchesStatus && matchesProduct && matchesSource && matchesCustomer
      && (!query || searchableOrderText(order).includes(query));
  });
}

export function countOrdersByStatus(orders: OrderRecord[]) {
  return orders.reduce<Record<CrmFilter, number>>((counts, order) => {
    counts.all += 1;
    counts[order.status] += 1;
    return counts;
  }, { all: 0, new: 0, contacted: 0, agreement: 0, paid: 0, rejected: 0 });
}
