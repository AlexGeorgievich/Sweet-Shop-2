'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

export default function CrmLoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(result.detail || 'Не удалось войти.');
      window.location.assign('/crm');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось войти.');
      setLoading(false);
    }
  }

  return (
    <main className="crm-login-page">
      <form className="crm-login-card" onSubmit={submit}>
        <span className="crm-brand-mark">СИ</span>
        <div>
          <p className="eyebrow">Служебный вход</p>
          <h1>CRM «Сладкой истории»</h1>
          <p>Введите данные сотрудника. Доступ к заявкам проверяется сервером.</p>
        </div>
        <label>
          <span>Email</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          <span>Пароль</span>
          <input name="password" type="password" autoComplete="current-password" minLength={8} required />
        </label>
        {error && <p className="crm-login-error" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Входим…' : 'Войти'}</button>
        <Link href="/">← Вернуться на сайт</Link>
      </form>
    </main>
  );
}
