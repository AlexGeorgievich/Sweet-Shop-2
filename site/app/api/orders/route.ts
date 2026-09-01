import { validateOrder } from '@/app/lib/order-validation';
import { createOrderRecord } from '@/app/lib/order-record';
import type { OrderRecord } from '@/app/lib/order-record';
import { saveOrder } from '@/app/lib/order-store';

const allowedDesserts = new Set([
  'Торты на заказ',
  'Воздушное безе',
  'Заварные пирожные',
  'Пончики и сладости',
  'Порционные торты',
  'Круассаны с кремом',
]);

const requestLog = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 4;

type OrderPayload = {
  name?: unknown;
  phone?: unknown;
  dessert?: unknown;
  date?: unknown;
  guests?: unknown;
  details?: unknown;
  consent?: unknown;
  consultantSummary?: unknown;
  prize?: unknown;
  website?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function createOrderId() {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replaceAll('-', '');
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
  return `SI-${date}-${suffix}`;
}

function isRateLimited(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientId = request.headers.get('cf-connecting-ip') ?? forwardedFor ?? 'local';
  const now = Date.now();
  const recent = (requestLog.get(clientId) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_REQUESTS) return true;

  recent.push(now);
  requestLog.set(clientId, recent);

  if (requestLog.size > 1_000) {
    for (const [key, times] of requestLog) {
      if (times.every((time) => now - time >= RATE_LIMIT_WINDOW_MS)) requestLog.delete(key);
    }
  }

  return false;
}

async function forwardOrderToFastApi(request: Request) {
  const apiUrl = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  try {
    const response = await fetch(`${apiUrl}/api/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': request.headers.get('idempotency-key') || crypto.randomUUID(),
      },
      body: await request.text(),
      signal: AbortSignal.timeout(8_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
    });
  } catch (error) {
    console.error('FastAPI order service is unavailable:', error instanceof Error ? error.message : error);
    return Response.json(
      { error: 'Сервис заявок временно недоступен. Введённые данные сохранены в форме.' },
      { status: 503 },
    );
  }
}

async function recordTelegramResult(record: OrderRecord, delivered: boolean, lastError: string | null) {
  const updated: OrderRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
    telegram: {
      delivered,
      deliveredAt: delivered ? new Date().toISOString() : null,
      lastError: lastError?.slice(0, 500) ?? null,
    },
  };
  try {
    await saveOrder(updated);
  } catch (error) {
    console.error('Cannot update Telegram state in saved order:', error instanceof Error ? error.message : error);
  }
  return updated;
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return Response.json(
      { error: 'Слишком много попыток. Подождите минуту и попробуйте снова.' },
      { status: 429 },
    );
  }

  if (process.env.ORDER_BACKEND === 'fastapi') {
    return forwardOrderToFastApi(request);
  }

  let payload: OrderPayload;
  try {
    payload = await request.json() as OrderPayload;
  } catch {
    return Response.json({ error: 'Не удалось прочитать данные заявки.' }, { status: 400 });
  }

  if (text(payload.website, 200)) {
    return Response.json({ ok: true, orderId: createOrderId() });
  }

  const order = {
    name: text(payload.name, 80),
    phone: text(payload.phone, 30),
    dessert: text(payload.dessert, 80),
    date: text(payload.date, 10),
    guests: text(payload.guests, 3),
    details: text(payload.details, 1_000),
    prize: text(payload.prize, 100),
    consent: payload.consent,
    consultantSummary: text(payload.consultantSummary, 1_200),
  };

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const fieldErrors = validateOrder(order, today);
  if (!allowedDesserts.has(order.dessert)) fieldErrors.dessert = 'Выберите десерт из каталога.';
  if (Object.keys(fieldErrors).length > 0) {
    return Response.json({ error: 'Проверьте обязательные поля заявки.', fields: fieldErrors }, { status: 400 });
  }

  const orderId = createOrderId();
  const createdAt = new Date().toISOString();
  const orderRecord = createOrderRecord({
    id: orderId,
    createdAt,
    name: order.name,
    phone: order.phone,
    dessert: order.dessert,
    eventDate: order.date,
    guests: Number(order.guests),
    details: order.details,
    prize: order.prize,
    consultantSummary: order.consultantSummary,
  });
  try {
    await saveOrder(orderRecord);
  } catch (error) {
    console.error('Cannot persist order:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Не удалось надёжно сохранить заявку. Попробуйте ещё раз.' }, { status: 500 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const threadId = process.env.TELEGRAM_MESSAGE_THREAD_ID;

  if (!token || !chatId) {
    const reason = 'Telegram delivery is not configured: missing bot token or chat ID.';
    console.error(reason);
    await recordTelegramResult(orderRecord, false, reason);
    return Response.json({ ok: true, orderId, notificationDelivered: false });
  }

  const eventDate = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'long',
  }).format(new Date(`${order.date}T12:00:00+04:00`));
  const receivedAt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  const message = [
    `🍰 <b>Новая заявка № ${orderId}</b>`,
    '',
    `👤 <b>Имя:</b> ${escapeHtml(order.name)}`,
    `📞 <b>Телефон:</b> ${escapeHtml(order.phone)}`,
    `🎂 <b>Десерт:</b> ${escapeHtml(order.dessert)}`,
    `📅 <b>Дата праздника:</b> ${escapeHtml(eventDate)}`,
    `👥 <b>Количество гостей:</b> ${escapeHtml(order.guests)}`,
    order.prize ? `🎁 <b>Подарок:</b> ${escapeHtml(order.prize)}` : '',
    '',
    '<b>Комментарий покупателя:</b>',
    escapeHtml(order.details || 'Не указан'),
    order.consultantSummary ? '<b>Итоги консультации:</b>' : '',
    order.consultantSummary ? escapeHtml(order.consultantSummary) : '',
    '',
    `🕒 Получена: ${escapeHtml(receivedAt)} (МСК)`,
  ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n');

  const telegramPayload: Record<string, string | number> = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
  };
  if (threadId) telegramPayload.message_thread_id = Number(threadId);

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramPayload),
      signal: AbortSignal.timeout(8_000),
    });

    if (!telegramResponse.ok) {
      const errorBody = await telegramResponse.text();
      const reason = `Telegram sendMessage failed (${telegramResponse.status}): ${errorBody.slice(0, 500)}`;
      console.error(reason);
      await recordTelegramResult(orderRecord, false, reason);
      return Response.json({ ok: true, orderId, notificationDelivered: false });
    }
  } catch (error) {
    const reason = `Telegram sendMessage request failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(reason);
    await recordTelegramResult(orderRecord, false, reason);
    return Response.json({ ok: true, orderId, notificationDelivered: false });
  }

  await recordTelegramResult(orderRecord, true, null);
  return Response.json({ ok: true, orderId, notificationDelivered: true });
}
