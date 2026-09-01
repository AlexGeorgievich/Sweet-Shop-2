export function telegramApiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramRequest(fetchImpl, token, method, payload, signal) {
  let response;
  try {
    response = await fetchImpl(telegramApiUrl(token, method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (cause) {
    throw new Error(`Telegram ${method}: сеть недоступна.`, { cause });
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Telegram ${method}: некорректный ответ HTTP ${response.status}.`);
  }
  if (!response.ok || body?.ok !== true) {
    const code = Number(body?.error_code || response.status || 0);
    const error = new Error(`Telegram ${method}: ошибка ${code || 'API'}${body?.description ? ` (${String(body.description).slice(0, 160)})` : ''}.`);
    if (code === 409) error.code = 'TELEGRAM_CONFLICT';
    throw error;
  }
  return body.result;
}

export async function getUpdates(fetchImpl, { token, offset, timeout = 25, signal }) {
  const result = await telegramRequest(fetchImpl, token, 'getUpdates', {
    offset, timeout, allowed_updates: ['message'],
  }, signal);
  if (!Array.isArray(result)) throw new Error('Telegram getUpdates: поле result не является массивом.');
  return result.filter((update) => Number.isInteger(update?.update_id));
}

export async function deleteWebhook(fetchImpl, token, signal) {
  return telegramRequest(fetchImpl, token, 'deleteWebhook', { drop_pending_updates: false }, signal);
}

export async function forwardUpdate(fetchImpl, { url, secret, update, signal }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
      body: JSON.stringify(update),
      signal,
    });
  } catch (cause) {
    throw new Error('Локальный обработчик Telegram недоступен.', { cause });
  }
  if (!response.ok) throw new Error(`Локальный обработчик Telegram вернул HTTP ${response.status}.`);
}

export async function processUpdateBatch(updates, offset, forward) {
  let nextOffset = offset;
  for (const update of updates) {
    if (update.update_id < nextOffset) continue;
    try {
      await forward(update);
      nextOffset = update.update_id + 1;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      error.nextOffset = nextOffset;
      throw error;
    }
  }
  return nextOffset;
}

export function retryDelay(attempt) {
  return [1000, 2000, 5000, 10000][Math.min(Math.max(0, attempt), 3)];
}
