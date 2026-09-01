'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { countOrdersByStatus, filterOrders } from '@/app/lib/crm-orders';
import type { CrmFilter } from '@/app/lib/crm-orders';
import { orderStatuses } from '@/app/lib/order-record';
import type { OrderRecord, OrderStatus } from '@/app/lib/order-record';
import OrderWorkPanel from './order-work-panel';

const pageSize = 50;

async function fetchCrmOrders() {
  const response = await fetch('/api/crm/orders', { cache: 'no-store' });
  if (response.status === 401) {
    window.location.assign('/crm/login');
    throw new Error('Сессия завершена. Выполните вход.');
  }
  const result = await response.json() as { orders?: OrderRecord[]; error?: string };
  if (!response.ok || !result.orders) throw new Error(result.error || 'Не удалось загрузить заявки.');
  return result.orders;
}

const statusLabels: Record<OrderStatus, string> = {
  new: 'Новая', contacted: 'Связались', agreement: 'Согласование', paid: 'Оплачено', rejected: 'Отказ',
};

const filters: { value: CrmFilter; label: string }[] = [
  { value: 'all', label: 'Все' }, ...orderStatuses.map((value) => ({ value, label: statusLabels[value] })),
];

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const eventDateFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' });

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date).replace(',', ',');
}

function formatEventDate(value: string) {
  const date = new Date(`${value}T12:00:00+04:00`);
  return Number.isNaN(date.getTime()) ? value : eventDateFormatter.format(date);
}

function responseLabel(order: OrderRecord) {
  if (order.responseMinutes == null) return 'Ещё не ответили';
  if (order.responseMinutes < 60) return `${order.responseMinutes} мин.`;
  const hours = Math.floor(order.responseMinutes / 60);
  const minutes = order.responseMinutes % 60;
  return `${hours} ч${minutes ? ` ${minutes} мин.` : ''}`;
}

export default function CrmPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CrmFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [product, setProduct] = useState('');
  const [source, setSource] = useState('');
  const [customerType, setCustomerType] = useState<'all' | 'new' | 'repeat'>('all');
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOrders(await fetchCrmOrders());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось загрузить заявки.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchCrmOrders()
      .then((result) => { if (active) setOrders(result); })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить заявки.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('order');
    const order = requested ? orders.find((item) => item.id === requested) : undefined;
    if (!order) return;
    const timer = window.setTimeout(() => setSelectedOrder(order), 0);
    return () => window.clearTimeout(timer);
  }, [orders]);

  const counts = useMemo(() => countOrdersByStatus(orders), [orders]);
  const products = useMemo(() => [...new Set(orders.map((order) => order.dessert))].sort((a, b) => a.localeCompare(b, 'ru')), [orders]);
  const sources = useMemo(() => [...new Set(orders.map((order) => order.source))].sort((a, b) => a.localeCompare(b, 'ru')), [orders]);
  const visibleOrders = useMemo(() => filterOrders(orders, search, filter, { product, source, customerType }), [orders, search, filter, product, source, customerType]);
  const pageCount = Math.max(1, Math.ceil(visibleOrders.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = visibleOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (!selectedOrder) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedOrder(null); };
    document.addEventListener('keydown', close);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', close); document.body.style.overflow = ''; };
  }, [selectedOrder]);

  async function changeStatus(id: string, status: OrderStatus) {
    setUpdatingId(id);
    setError('');
    try {
      const response = await fetch('/api/crm/orders', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }),
      });
      const result = await response.json() as { order?: OrderRecord; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error || 'Не удалось изменить статус.');
      setOrders((current) => current.map((order) => order.id === id ? result.order! : order));
      setSelectedOrder((current) => current?.id === id ? result.order! : current);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось изменить статус.');
    } finally {
      setUpdatingId('');
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/crm/login');
  }

  return (
    <main className="crm-page">
      <header className="crm-header">
        <div className="crm-brand"><span className="crm-brand-mark">СИ</span><span><h1>Заявки</h1><small>Служебная страница · Сладкая история</small></span></div>
        <nav className="crm-nav" aria-label="Разделы CRM"><Link className="active" href="/crm">Заявки</Link><Link href="/crm/production">Производство</Link><Link href="/crm/analytics">Аналитика</Link><Link href="/crm/team">Команда</Link></nav>
        <div className="crm-header-actions"><button className="crm-refresh" type="button" onClick={() => void loadOrders()} disabled={loading}><span aria-hidden="true">↻</span>{loading ? 'Обновляем…' : 'Обновить'}</button><button className="crm-refresh" type="button" onClick={() => void logout()}>Выйти</button></div>
      </header>

      <section className="crm-workspace" aria-label="Управление заявками">
        <div className="crm-toolbar">
          <label className="crm-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Поиск по номеру, имени, телефону или торту" aria-label="Поиск заявок" /></label>
          <div className="crm-filters" aria-label="Фильтр по статусу">
            {filters.map((item) => <button key={item.value} type="button" className={filter === item.value ? 'active' : ''} aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPage(1); }}><span>{item.label}</span><b>{counts[item.value]}</b></button>)}
          </div>
        </div>

        <div className="crm-facets" aria-label="Дополнительные фильтры">
          <label><span>Товар</span><select value={product} onChange={(event) => { setProduct(event.target.value); setPage(1); }}><option value="">Все товары</option>{products.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Источник</span><select value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }}><option value="">Все источники</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Клиент</span><select value={customerType} onChange={(event) => { setCustomerType(event.target.value as 'all' | 'new' | 'repeat'); setPage(1); }}><option value="all">Все клиенты</option><option value="new">Новые</option><option value="repeat">Повторные</option></select></label>
          {(product || source || customerType !== 'all') && <button type="button" onClick={() => { setProduct(''); setSource(''); setCustomerType('all'); setPage(1); }}>Сбросить параметры</button>}
        </div>

        {error && <div className="crm-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void loadOrders()}>Повторить</button></div>}

        <div className="crm-table-card">
          <div className="crm-table-scroll">
            <table className="crm-table">
              <thead><tr><th>Номер</th><th>Дата</th><th>Клиент</th><th>Телефон</th><th>Товар</th><th>Источник</th><th>Сумма</th><th>Статус</th></tr></thead>
              <tbody>
                {pageOrders.map((order) => (
                  <tr key={order.id} tabIndex={0} aria-label={`Открыть заявку ${order.id}`} onClick={() => setSelectedOrder(order)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedOrder(order); } }}>
                    <td><strong className="crm-order-id">{order.id}</strong>{!order.telegram.delivered && <span className="crm-telegram-warning" title={order.telegram.lastError ?? undefined}>⚠ уведомление не доставлено</span>}</td>
                    <td><span>{formatCreatedAt(order.createdAt)}</span><small>праздник {formatEventDate(order.eventDate)}</small></td>
                    <td><span>{order.name}</span><small>{order.customerType === 'repeat' ? 'повторный' : 'новый'} · гостей: {order.guests}</small></td>
                    <td><a className="crm-phone" href={`tel:${order.phone.replace(/[^+\d]/g, '')}`} onClick={(event) => event.stopPropagation()}>{order.phone}</a></td>
                    <td><span>{order.dessert}</span>{order.weightKg && <small>{order.weightKg.toLocaleString('ru-RU')} кг · {order.decor}</small>}{order.prize && <small className="crm-prize">♙ {order.prize}</small>}</td>
                    <td>{order.source}</td>
                    <td>{order.amountLabel}</td>
                    <td><select className={`crm-status crm-status-${order.status}`} value={order.status} disabled={updatingId === order.id} aria-label={`Статус заявки ${order.id}`} onClick={(event) => event.stopPropagation()} onChange={(event) => void changeStatus(order.id, event.target.value as OrderStatus)}>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></td>
                  </tr>
                ))}
                {!loading && visibleOrders.length === 0 && <tr><td className="crm-empty" colSpan={8}>{orders.length === 0 ? 'Заявок пока нет. Новая заявка с сайта появится здесь автоматически.' : 'По выбранному фильтру заявки не найдены.'}</td></tr>}
                {loading && orders.length === 0 && <tr><td className="crm-empty" colSpan={8}>Загружаем локальные заявки…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="crm-table-footer"><p className="crm-footnote">Найдено: {visibleOrders.length} из {orders.length}. На странице: {pageOrders.length}.</p>{pageCount > 1 && <nav className="crm-pagination" aria-label="Страницы заявок"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>← Назад</button><span>Страница {currentPage} из {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Вперёд →</button></nav>}</div>
      </section>

      {selectedOrder && <div className="crm-drawer-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrder(null); }}>
        <aside className="crm-order-drawer" role="dialog" aria-modal="true" aria-labelledby="crm-drawer-title">
          <header><div><small>Детали заявки</small><h2 id="crm-drawer-title">{selectedOrder.id}</h2><span className={`crm-detail-status crm-status-${selectedOrder.status}`}>{statusLabels[selectedOrder.status]}</span></div><button type="button" autoFocus aria-label="Закрыть детали заявки" onClick={() => setSelectedOrder(null)}>×</button></header>
          <div className="crm-drawer-content">
            <section><h3>Клиент</h3><dl className="crm-detail-grid"><div><dt>Имя</dt><dd>{selectedOrder.name}</dd></div><div><dt>Тип клиента</dt><dd>{selectedOrder.customerType === 'repeat' ? 'Повторный' : 'Новый'}</dd></div><div><dt>Телефон</dt><dd><a className="crm-phone" href={`tel:${selectedOrder.phone.replace(/[^+\d]/g, '')}`}>{selectedOrder.phone}</a></dd></div><div><dt>Гостей</dt><dd>{selectedOrder.guests}</dd></div></dl></section>
            <section><h3>Сроки и контакт</h3><dl className="crm-detail-grid"><div><dt>Дата заказа</dt><dd>{formatCreatedAt(selectedOrder.createdAt)}</dd></div><div><dt>Дата выдачи</dt><dd>{formatEventDate(selectedOrder.eventDate)}</dd></div><div><dt>Первый ответ</dt><dd>{responseLabel(selectedOrder)}</dd></div><div><dt>Источник</dt><dd>{selectedOrder.source}</dd></div></dl></section>
            <section><h3>Состав заказа</h3><dl className="crm-detail-grid"><div><dt>Товар</dt><dd><strong>{selectedOrder.dessert}</strong></dd></div><div><dt>Сумма</dt><dd><strong>{selectedOrder.amountLabel}</strong></dd></div><div><dt>Вес</dt><dd>{selectedOrder.weightKg ? `${selectedOrder.weightKg.toLocaleString('ru-RU')} кг` : 'Уточняется'}</dd></div><div><dt>Декор</dt><dd>{selectedOrder.decor || 'Уточняется'}</dd></div><div><dt>Подарок</dt><dd>{selectedOrder.prize || 'Нет'}</dd></div><div><dt>Telegram</dt><dd className={selectedOrder.telegram.delivered ? 'crm-delivered' : 'crm-undelivered'}>{selectedOrder.telegram.delivered ? 'Уведомление доставлено' : 'Не доставлено'}</dd></div></dl></section>
            <section><h3>Пожелания клиента</h3><p className="crm-detail-comment">{selectedOrder.details || 'Пожелания не указаны.'}</p></section>
            <section><h3>Комментарий консультанта</h3><p className="crm-detail-comment">{selectedOrder.consultantSummary || 'Комментария пока нет.'}</p></section>
            <OrderWorkPanel orderNumber={selectedOrder.id} />
          </div>
        </aside>
      </div>}
    </main>
  );
}
