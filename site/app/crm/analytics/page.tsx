'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  analyticsSummary, countBy, filterAnalyticsOrders, funnelCounts, heatmapPeriods, heatmapWeekdays,
  orderHeatmap, revenueByDay,
} from '@/app/lib/crm-analytics';
import type { AnalyticsFilters, AnalyticsPeriod } from '@/app/lib/crm-analytics';
import type { OrderRecord } from '@/app/lib/order-record';

async function fetchCrmOrders() {
  const response = await fetch('/api/crm/orders', { cache: 'no-store' });
  const result = await response.json() as { orders?: OrderRecord[]; error?: string };
  if (!response.ok || !result.orders) throw new Error(result.error || 'Не удалось загрузить заявки.');
  return result.orders;
}

type Insights = { summary: { averageResponseMinutes: number | null; slaBreaches: number; openTasks: number; overdueTasks: number; staleOrders: number }; attention: { number: string; kind: string; label: string; minutes: number }[]; managers: { manager: string; orders: number; paid: number; overdueTasks: number }[] };
async function fetchInsights() {
  const response = await fetch('/api/backend/crm/insights', { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Не удалось загрузить показатели SLA.');
  return result as Insights;
}

const rubles = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', timeZone: 'Europe/Moscow' });
const initialFilters: AnalyticsFilters = { period: '30d', product: '', source: '', day: '' };
const periods: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d', label: '7 дней' }, { value: '30d', label: '30 дней' }, { value: 'all', label: 'Всё время' },
];

function formatDay(day: string) {
  return shortDate.format(new Date(`${day}T12:00:00+04:00`)).replace('.', '');
}

export default function CrmAnalyticsPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState<Insights | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOrders, nextInsights] = await Promise.all([fetchCrmOrders(), fetchInsights()]);
      setOrders(nextOrders); setInsights(nextInsights);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось загрузить заявки.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchCrmOrders(), fetchInsights()])
      .then(([result, nextInsights]) => { if (active) { setOrders(result); setInsights(nextInsights); } })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить заявки.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => filterAnalyticsOrders(orders, filters), [orders, filters]);
  const summary = useMemo(() => analyticsSummary(filtered), [filtered]);
  const products = useMemo(() => countBy(filtered, 'dessert'), [filtered]);
  const channels = useMemo(() => countBy(filtered, 'source'), [filtered]);
  const revenue = useMemo(() => revenueByDay(filtered), [filtered]);
  const funnel = useMemo(() => funnelCounts(filtered), [filtered]);
  const heatmap = useMemo(() => orderHeatmap(filtered), [filtered]);
  const maxProduct = Math.max(1, ...products.map((item) => item.value));
  const maxChannel = Math.max(1, ...channels.map((item) => item.value));
  const maxRevenue = Math.max(1, ...revenue.map((item) => item.value));
  const maxHeat = Math.max(1, ...heatmap.flat());
  const maxFunnel = Math.max(1, ...funnel.map((item) => item.value));

  function toggleFilter(key: 'product' | 'source' | 'day', value: string) {
    setFilters((current) => ({ ...current, [key]: current[key] === value ? '' : value }));
  }

  return (
    <main className="crm-page crm-analytics-page">
      <header className="crm-header">
        <div className="crm-brand"><span className="crm-brand-mark">СИ</span><span><h1>Аналитика</h1><small>Служебная страница · Сладкая история</small></span></div>
        <nav className="crm-nav" aria-label="Разделы CRM"><Link href="/crm">Заявки</Link><Link href="/crm/production">Производство</Link><Link className="active" href="/crm/analytics">Аналитика</Link><Link href="/crm/team">Команда</Link></nav>
        <button className="crm-refresh" type="button" onClick={() => void loadOrders()} disabled={loading}><span aria-hidden="true">↻</span>{loading ? 'Обновляем…' : 'Обновить'}</button>
      </header>

      <section className="analytics-workspace">
        <div className="analytics-topline">
          <div><p className="analytics-kicker">Продажи и спрос</p><h2>Картина заказов <em>без лишнего шума</em></h2><p>Нажмите на товар, канал или столбец даты — весь экран пересчитается.</p></div>
          <div className="analytics-periods" aria-label="Период аналитики">{periods.map((period) => <button type="button" key={period.value} className={filters.period === period.value ? 'active' : ''} onClick={() => setFilters((current) => ({ ...current, period: period.value, day: '' }))}>{period.label}</button>)}</div>
        </div>

        {(filters.product || filters.source || filters.day) && <div className="analytics-active-filters"><span>Активные фильтры:</span>{filters.product && <button onClick={() => toggleFilter('product', filters.product)}>{filters.product} ×</button>}{filters.source && <button onClick={() => toggleFilter('source', filters.source)}>{filters.source} ×</button>}{filters.day && <button onClick={() => toggleFilter('day', filters.day)}>{formatDay(filters.day)} ×</button>}<button className="clear" onClick={() => setFilters((current) => ({ ...current, product: '', source: '', day: '' }))}>Сбросить</button></div>}
        {error && <div className="crm-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void loadOrders()}>Повторить</button></div>}

        <div className="analytics-kpis" aria-label="Ключевые показатели">
          <article><small>Заявки</small><b>{summary.orders}</b><span>в выбранном срезе</span></article>
          <article><small>Оплаченные заказы</small><b>{summary.paid}</b><span>статус «Оплачено»</span></article>
          <article><small>Конверсия</small><b>{(summary.conversion * 100).toFixed(1)}%</b><span>из заявки в оплату</span></article>
          <article className="accent" title="Минимальная оценка по базовым ценам «от»"><small>Выручка</small><b>{rubles.format(summary.revenue)}</b><span>минимальная оценка*</span></article>
          <article title="Минимальная оценка по базовым ценам «от»"><small>Средний чек</small><b>{rubles.format(summary.averageCheck)}</b><span>по оплаченным*</span></article>
        </div>

        {insights && <section className="ops-insights" aria-label="Контроль работы менеджеров">
          <div className="ops-insight-head"><div><p className="analytics-kicker">Требует внимания</p><h2>SLA и следующие действия</h2></div><span>Цель первого ответа: до 15 минут</span></div>
          <div className="ops-kpis"><article><small>Средний ответ</small><b>{insights.summary.averageResponseMinutes == null ? '—' : `${insights.summary.averageResponseMinutes} мин`}</b></article><article className={insights.summary.slaBreaches ? 'warning' : ''}><small>Нарушения SLA</small><b>{insights.summary.slaBreaches}</b></article><article><small>Открытые задачи</small><b>{insights.summary.openTasks}</b></article><article className={insights.summary.overdueTasks ? 'warning' : ''}><small>Просрочено</small><b>{insights.summary.overdueTasks}</b></article><article className={insights.summary.staleOrders ? 'warning' : ''}><small>Без движения 24 ч</small><b>{insights.summary.staleOrders}</b></article></div>
          <div className="ops-columns"><article className="analytics-card"><header><div><small>Очередь</small><h3>Сначала обработать</h3></div></header><div className="ops-attention">{insights.attention.map((item) => <Link href={`/crm?order=${encodeURIComponent(item.number)}`} key={`${item.kind}-${item.number}`}><strong>{item.number}</strong><span>{item.label}</span><small>{Math.floor(item.minutes / 60) ? `${Math.floor(item.minutes / 60)} ч ` : ''}{item.minutes % 60} мин</small></Link>)}{!insights.attention.length && <p>Критичных заявок сейчас нет.</p>}</div></article>
            <article className="analytics-card"><header><div><small>Нагрузка</small><h3>Менеджеры</h3></div></header><div className="ops-managers">{insights.managers.map((item) => <div key={item.manager}><strong>{item.manager}</strong><span>{item.orders} заявок · {item.paid} оплачено</span><b>{item.overdueTasks ? `${item.overdueTasks} просрочено` : 'в срок'}</b></div>)}</div></article></div>
        </section>}

        <div className="analytics-grid">
          <article className="analytics-card analytics-products">
            <header><div><small>Спрос</small><h3>Рейтинг товаров</h3></div><span title="Количество заявок по каждому десерту">Заявки ↘</span></header>
            <div className="rank-list">{products.length ? products.map((item, index) => <button type="button" key={item.label} className={filters.product === item.label ? 'selected' : ''} onClick={() => toggleFilter('product', item.label)} title={`Показать только «${item.label}»: ${item.value} заявок`}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{item.label}</strong><i><em style={{ width: `${item.value / maxProduct * 100}%` }} /></i></span><mark>{item.value}</mark></button>) : <p className="analytics-empty">Нет данных в этом срезе.</p>}</div>
          </article>

          <article className="analytics-card analytics-channels">
            <header><div><small>Источники</small><h3>Сравнение каналов</h3></div><span title="Каналы, из которых пришли заявки">По заявкам</span></header>
            <div className="channel-list">{channels.length ? channels.map((item) => <button type="button" key={item.label} className={filters.source === item.label ? 'selected' : ''} onClick={() => toggleFilter('source', item.label)} title={`Фильтр по каналу «${item.label}»`}><span><strong>{item.label}</strong><small>{item.value} заявок</small></span><i><em style={{ width: `${item.value / maxChannel * 100}%` }} /></i><b>{Math.round(item.value / Math.max(1, filtered.length) * 100)}%</b></button>) : <p className="analytics-empty">Нет данных в этом срезе.</p>}</div>
          </article>

          <article className="analytics-card analytics-revenue">
            <header><div><small>Оплаченные</small><h3>Динамика выручки</h3></div><span title="Минимальная сумма по базовым ценам">Сумма «от», ₽</span></header>
            <div className="revenue-chart" role="img" aria-label="Столбчатый график динамики минимальной выручки">{revenue.length ? revenue.map((item) => <button type="button" key={item.day} className={filters.day === item.day ? 'selected' : ''} onClick={() => toggleFilter('day', item.day)} title={`${formatDay(item.day)}: ${rubles.format(item.value)}`}><span>{item.value > 0 ? rubles.format(item.value) : ''}</span><i style={{ height: `${Math.max(8, item.value / maxRevenue * 100)}%` }} /><small>{formatDay(item.day)}</small></button>) : <p className="analytics-empty">Оплаченных заказов в этом срезе пока нет.</p>}</div>
          </article>

          <article className="analytics-card analytics-heatmap">
            <header><div><small>Активность</small><h3>Когда приходят заявки</h3></div><span title="Московское время">МСК</span></header>
            <div className="heatmap-grid"><span />{heatmapPeriods.map((period) => <b key={period}>{period}</b>)}{heatmap.map((row, rowIndex) => [<strong key={`day-${rowIndex}`}>{heatmapWeekdays[rowIndex]}</strong>, ...row.map((value, columnIndex) => <i key={`${rowIndex}-${columnIndex}`} style={{ backgroundColor: `rgba(168,95,56,${0.1 + value / maxHeat * 0.78})` }} title={`${heatmapWeekdays[rowIndex]}, ${heatmapPeriods[columnIndex]}: ${value} заявок`}><span>{value || ''}</span></i>)])}</div>
            <div className="heatmap-legend"><span>Меньше</span><i /><i /><i /><i /><span>Больше</span></div>
          </article>
        </div>

        <article className="analytics-card analytics-funnel">
          <header><div><small>Путь клиента</small><h3>Воронка по статусам</h3></div><span>Всего {filtered.length}</span></header>
          <div className="funnel-row">{funnel.map((stage) => <div key={stage.status}><span><b>{stage.value}</b><small>{stage.label}</small></span><i><em style={{ width: `${Math.max(5, stage.value / maxFunnel * 100)}%` }} /></i></div>)}</div>
        </article>

        <article className="analytics-card analytics-table-card">
          <header><div><small>Выбранный срез</small><h3>Заявки в расчёте</h3></div><span>{filtered.length} записей</span></header>
          <div className="analytics-table-scroll"><table><thead><tr><th>Номер</th><th>Клиент</th><th>Товар</th><th>Канал</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{filtered.slice(0, 12).map((order) => <tr key={order.id}><td>{order.id}</td><td>{order.name}</td><td>{order.dessert}</td><td>{order.source}</td><td>{order.amountLabel}</td><td>{order.status === 'new' ? 'Новая' : order.status === 'contacted' ? 'Связались' : order.status === 'agreement' ? 'Согласование' : order.status === 'paid' ? 'Оплачено' : 'Отказ'}</td></tr>)}{!loading && !filtered.length && <tr><td colSpan={6}>Нет заявок по выбранным условиям.</td></tr>}</tbody></table></div>
        </article>
        <p className="analytics-note">* Выручка и средний чек рассчитаны по минимальным базовым ценам «от». После добавления фактической суммы заказа показатели станут точными.</p>
      </section>
    </main>
  );
}
