'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Comment = { id: string; body: string; author: string; createdAt: string };
type Task = { id: string; title: string; dueAt: string; status: string; assignee: string };
type Employee = { id: string; fullName: string };
type Commercial = { amountRubles: number | null; assigneeId: string | null; assigneeName: string | null; priority: number; weightGrams: number | null; decor: string; eventDate: string };
const messageTemplates = [
  { title: 'Первый ответ', text: 'Здравствуйте! Получили вашу заявку. Уточню несколько деталей и подготовлю расчёт. Подскажите, пожалуйста, удобное время для связи?' },
  { title: 'Отправка расчёта', text: 'Подготовили расчёт по вашему заказу. Всё ли подходит по составу, оформлению и стоимости? Могу сразу зафиксировать дату.' },
  { title: 'Мягкое напоминание', text: 'Здравствуйте! Возвращаюсь к вашему заказу — дата пока доступна. Подсказать по выбору или закрепить её за вами?' },
  { title: 'Подтверждение оплаты', text: 'Оплату получили, спасибо! Заказ подтверждён и передан в работу. Ближе к дате дополнительно свяжемся для финального подтверждения.' },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Операция не выполнена.');
  return data as T;
}

export default function OrderWorkPanel({ orderNumber }: { orderNumber: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [commercial, setCommercial] = useState<Commercial | null>(null);
  const load = useCallback(async () => {
    try {
      const encoded = encodeURIComponent(orderNumber);
      const [commentData, taskData, commercialData, staffData] = await Promise.all([
        api<{ comments: Comment[] }>(`crm/orders/${encoded}/comments`),
        api<{ tasks: Task[] }>(`crm/orders/${encoded}/tasks`),
        api<{ commercial: Commercial }>(`crm/orders/${encoded}/commercial`),
        api<{ employees: Employee[] }>('crm/staff'),
      ]);
      setComments(commentData.comments); setTasks(taskData.tasks); setCommercial(commercialData.commercial); setEmployees(staffData.employees);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось загрузить работу по заявке.'); }
  }, [orderNumber]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const body = new FormData(form).get('body');
    try { await api(`crm/orders/${encodeURIComponent(orderNumber)}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); form.reset(); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось добавить комментарий.'); }
  }
  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    data.due_at = new Date(String(data.due_at)).toISOString();
    try { await api(`crm/orders/${encodeURIComponent(orderNumber)}/tasks`, { method: 'POST', body: JSON.stringify(data) }); form.reset(); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось добавить задачу.'); }
  }
  async function finish(id: string) { try { await api(`crm/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) }); await load(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось завершить задачу.'); } }
  async function saveCommercial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const raw = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { amount_rubles: raw.amount_rubles === '' ? null : Number(raw.amount_rubles), assignee_id: raw.assignee_id || null, priority: Number(raw.priority), weight_grams: raw.weight_grams === '' ? null : Number(raw.weight_grams), decor: raw.decor, event_date: raw.event_date };
    try { const result = await api<{ commercial: Commercial }>(`crm/orders/${encodeURIComponent(orderNumber)}/commercial`, { method: 'PATCH', body: JSON.stringify(payload) }); setCommercial(result.commercial); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить параметры заказа.'); }
  }

  return <section className="order-work"><h3>Работа менеджера</h3>{error && <p className="order-work-error">{error}</p>}
    {commercial && <form className="commercial-form" key={`${orderNumber}-${commercial.assigneeId}-${commercial.amountRubles}`} onSubmit={saveCommercial}><h4>Стоимость и производство</h4><label>Фактическая сумма, ₽<input name="amount_rubles" type="number" min="0" defaultValue={commercial.amountRubles ?? ''} /></label><label>Ответственный<select name="assignee_id" defaultValue={commercial.assigneeId ?? ''}><option value="">Не назначен</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label><label>Приоритет<select name="priority" defaultValue={commercial.priority}><option value="0">Обычный</option><option value="1">Повышенный</option><option value="2">Высокий</option><option value="3">Срочный</option></select></label><label>Дата выдачи<input name="event_date" type="date" required defaultValue={commercial.eventDate} /></label><label>Вес, г<input name="weight_grams" type="number" min="1" defaultValue={commercial.weightGrams ?? ''} /></label><label>Декор<input name="decor" maxLength={200} defaultValue={commercial.decor} /></label><button>Сохранить параметры</button></form>}
    <div className="order-work-columns"><div><h4>Внутренние комментарии</h4><div className="order-work-list">{comments.map((item) => <article key={item.id}><p>{item.body}</p><small>{item.author} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small></article>)}{comments.length === 0 && <small>Комментариев пока нет.</small>}</div><form onSubmit={addComment}><textarea name="body" required maxLength={4000} placeholder="Результат звонка, договорённость…" /><button>Добавить</button></form></div>
      <div><h4>Задачи</h4><div className="order-work-list">{tasks.map((item) => <article key={item.id}><p>{item.title}</p><small>{item.assignee} · {new Date(item.dueAt).toLocaleString('ru-RU')}</small>{item.status === 'open' && <button onClick={() => void finish(item.id)}>Выполнено</button>}</article>)}{tasks.length === 0 && <small>Задач пока нет.</small>}</div><form onSubmit={addTask}><input name="title" required placeholder="Например, позвонить клиенту" /><input name="due_at" type="datetime-local" required /><button>Создать задачу</button></form></div></div>
    <div className="message-templates"><h4>Быстрые шаблоны</h4><p>Скопируйте, персонализируйте и отправьте клиенту в удобном канале.</p><div>{messageTemplates.map((item) => <button type="button" key={item.title} onClick={async () => { await navigator.clipboard.writeText(item.text); setCopied(item.title); window.setTimeout(() => setCopied(''), 1600); }}><strong>{item.title}</strong><span>{item.text}</span><small>{copied === item.title ? 'Скопировано ✓' : 'Скопировать'}</small></button>)}</div></div>
  </section>;
}
