'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DataMode, DemoSummary, demoConfirmation } from '@/app/lib/data-mode';

type Employee = { id: string; email: string; fullName: string; role: string; isActive: boolean; lastLoginAt?: string | null };
type AuditEvent = { id: string; action: string; actor: string; createdAt: string; changes: Record<string, unknown> };
type ModeResponse = { dataMode: DataMode; canUseDemo: boolean };
const roleLabels: Record<string, string> = { admin: 'Администратор', lead: 'Руководитель', manager: 'Менеджер', viewer: 'Наблюдатель' };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json();
  if (response.status === 401) { window.location.assign('/crm/login'); throw new Error('Требуется вход.'); }
  if (!response.ok) throw new Error(data.detail || data.error || 'Операция не выполнена.');
  return data as T;
}

export default function TeamPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ModeResponse | null>(null);
  const [demo, setDemo] = useState<DemoSummary | null>(null);
  const [seed, setSeed] = useState('20260831');
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const load = useCallback(async () => {
    try {
      const [team, audit, currentMode] = await Promise.all([api<{ employees: Employee[] }>('admin/employees'), api<{ events: AuditEvent[] }>('admin/audit'), api<ModeResponse>('admin/data-mode')]);
      setEmployees(team.employees); setEvents(audit.events); setMode(currentMode);
      const response = await fetch('/api/backend/admin/demo', { cache: 'no-store' });
      if (response.ok) setDemo(await response.json() as DemoSummary);
      else if (response.status === 404) setDemo(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось загрузить данные.'); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('admin/employees', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      event.currentTarget.reset(); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось создать сотрудника.'); }
    finally { setBusy(false); }
  }

  async function update(employee: Employee, changes: Record<string, unknown>) {
    setError('');
    try { await api(`admin/employees/${employee.id}`, { method: 'PATCH', body: JSON.stringify(changes) }); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось обновить сотрудника.'); }
  }

  async function generateDemo() {
    if (!window.confirm(demoConfirmation(1000))) return;
    setBusy(true); setError('');
    try {
      const generated = await api<DemoSummary>('admin/demo/generate', {
        method: 'POST',
        body: JSON.stringify({ count: 1000, seed: Number(seed), asOf }),
      });
      setDemo(generated);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось создать демоданные.'); }
    finally { setBusy(false); }
  }

  return <main className="crm-page">
    <header className="crm-header"><div className="crm-brand"><span className="crm-brand-mark">СИ</span><span><h1>Команда</h1><small>Сотрудники, роли и журнал действий</small></span></div><nav className="crm-nav"><Link href="/crm">Заявки</Link><Link href="/crm/production">Производство</Link><Link href="/crm/analytics">Аналитика</Link><Link className="active" href="/crm/team">Команда</Link></nav></header>
    <section className="crm-workspace team-grid">
      {error && <div className="crm-alert" role="alert">{error}</div>}
      {mode?.canUseDemo && <section className="team-card demo-admin-card">
        <div><p className="analytics-kicker">Изолированный контур</p><h2>Демонстрационные данные</h2><p>Воспроизводимый набор для проверки CRM и аналитики. Production не изменяется.</p></div>
        <div className="demo-admin-fields"><label>Seed<input value={seed} inputMode="numeric" onChange={(event) => setSeed(event.target.value)} /></label><label>Контрольная дата<input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label></div>
        <button disabled={busy || !seed || !asOf} onClick={() => void generateDemo()}>{busy ? 'Генерируем…' : 'Создать / пересоздать 1000 заявок'}</button>
        {demo && <div className="demo-summary-grid"><span><small>Заявки</small><b>{demo.summary.orders}</b></span><span><small>Клиенты</small><b>{demo.summary.customers}</b></span><span><small>Задачи</small><b>{demo.summary.tasks}</b></span><span><small>Seed</small><b>{demo.seed}</b></span><span><small>Дата</small><b>{demo.asOf}</b></span><span><small>Digest</small><code title={demo.digest}>{demo.digest.slice(0, 10)}…</code></span></div>}
      </section>}
      <section className="team-card"><h2>Добавить сотрудника</h2><form className="team-form" onSubmit={create}>
        <label>Имя<input name="full_name" required minLength={2} /></label><label>Email<input name="email" type="email" required /></label>
        <label>Роль<select name="role" defaultValue="manager">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Временный пароль<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><button disabled={busy}>{busy ? 'Создаём…' : 'Создать сотрудника'}</button>
      </form></section>
      <section className="team-card"><h2>Сотрудники</h2><div className="team-list">{employees.map((employee) => <article key={employee.id}><div><strong>{employee.fullName}</strong><small>{employee.email}</small></div><select value={employee.role} onChange={(e) => void update(employee, { role: e.target.value })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className={employee.isActive ? 'danger-soft' : ''} onClick={() => void update(employee, { is_active: !employee.isActive })}>{employee.isActive ? 'Отключить' : 'Включить'}</button></article>)}</div></section>
      <section className="team-card team-audit"><h2>Последние действия</h2><div className="audit-list">{events.map((item) => <article key={item.id}><strong>{item.actor}</strong><span>{item.action}</span><small>{new Date(item.createdAt).toLocaleString('ru-RU')}</small></article>)}{events.length === 0 && <p>Действий пока нет.</p>}</div></section>
    </section>
  </main>;
}
