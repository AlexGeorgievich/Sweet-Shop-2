'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CONSULTANT_FIRST_DELAY, CONSULTANT_REOPEN_DELAY } from '@/app/lib/consultant-timing';

type Message = { role: 'user' | 'assistant'; content: string };
const greeting = 'Здравствуйте! Я виртуальный менеджер «Сладкой истории». Помогу выбрать десерт, сориентирую по ценам и подготовлю заявку. Что планируете для праздника?';

export default function ConsultantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: greeting }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [closeCount, setCloseCount] = useState(0);
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [latestSummary, setLatestSummary] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleOrderSubmitted = () => { setOrderSubmitted(true); setOpen(false); };
    const handleWheelOpening = () => setOpen(false);
    window.addEventListener('order-submitted', handleOrderSubmitted);
    window.addEventListener('wheel-opening', handleWheelOpening);
    return () => {
      window.removeEventListener('order-submitted', handleOrderSubmitted);
      window.removeEventListener('wheel-opening', handleWheelOpening);
    };
  }, []);
  useEffect(() => {
    if (orderSubmitted) return;
    const timer = window.setTimeout(() => setOpen(true), CONSULTANT_FIRST_DELAY);
    return () => window.clearTimeout(timer);
  }, [orderSubmitted]);
  useEffect(() => {
    if (closeCount === 0 || orderSubmitted) return;
    const timer = window.setTimeout(() => setOpen(true), CONSULTANT_REOPEN_DELAY);
    return () => window.clearTimeout(timer);
  }, [closeCount, orderSubmitted]);
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, sending, error, open]);
  function closeConsultant() {
    setOpen(false);
    setCloseCount((count) => count + 1);
    window.dispatchEvent(new CustomEvent('consultant-closed', { detail: { closeCount: closeCount + 1 } }));
  }
  function toggleConsultant() { if (open) closeConsultant(); else setOpen(true); }
  async function submit(event: FormEvent) {
    event.preventDefault(); const text = input.trim(); if (!text || sending) return;
    const next = [...messages, { role: 'user' as const, content: text }]; setMessages(next); setInput(''); setSending(true); setError('');
    try { const response = await fetch('/api/consultant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: messages.slice(-8) }) }); const body = await response.json() as { answer?: string; error?: string; orderIntent?: boolean; summary?: string }; if (!response.ok || !body.answer) throw new Error(body.error || 'Не удалось получить ответ.'); setMessages([...next, { role: 'assistant', content: body.answer }]); if (body.summary) { setLatestSummary(body.summary); window.dispatchEvent(new CustomEvent('consultant-summary', { detail: { summary: body.summary } })); } if (body.orderIntent) window.setTimeout(() => window.dispatchEvent(new CustomEvent('consultant-order-intent', { detail: { summary: body.summary || '' } })), 700); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось отправить сообщение.'); }
    finally { setSending(false); }
  }
  return <div className="consultant-root">{open && <section className="consultant-panel" aria-label="Чат с консультантом"><header><div><strong>Консультант</strong><small>Онлайн · «Сладкая история»</small></div><button type="button" onClick={closeConsultant} aria-label="Закрыть чат">×</button></header><div className="consultant-messages">{messages.map((item, index) => <div key={`${item.role}-${index}`} className={`consultant-message ${item.role}`}>{item.content}</div>)}{sending && <div className="consultant-message assistant">Печатаю ответ…</div>}{error && <div className="consultant-error">{error}</div>}<div ref={messagesEndRef} /></div><form onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Напишите вопрос…" aria-label="Ваш вопрос" /><button type="submit" disabled={sending || !input.trim()} aria-label="Отправить">→</button></form><button type="button" className="consultant-cta" onClick={() => { if (latestSummary) window.dispatchEvent(new CustomEvent('consultant-summary', { detail: { summary: latestSummary } })); closeConsultant(); window.setTimeout(() => document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>Перейти к форме заказа</button></section>}<button className="consultant-launcher" type="button" onClick={toggleConsultant} aria-expanded={open} aria-label={open ? 'Свернуть консультанта' : 'Открыть консультанта'}>{open ? '×' : '✦'}<span>{open ? '' : 'Помочь выбрать десерт'}</span></button></div>;
}
