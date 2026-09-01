import { deleteWebhook, forwardUpdate, getUpdates, processUpdateBatch, retryDelay } from './telegram-polling-core.mjs';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const localWebhookUrl = process.env.LOCAL_TELEGRAM_WEBHOOK_URL || 'http://127.0.0.1:3000/api/telegram/webhook';

if (!token || !secret) {
  console.error('[bot] Не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_WEBHOOK_SECRET.');
  process.exit(1);
}

const controller = new AbortController();
let stopping = false;
for (const signalName of ['SIGINT', 'SIGTERM']) {
  process.on(signalName, () => {
    if (stopping) return;
    stopping = true;
    console.log('[bot] Завершаю long polling…');
    controller.abort();
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  await deleteWebhook(fetch, token, controller.signal);
  console.log(`[bot] Webhook отключён, long polling запущен. Локальный мост: ${localWebhookUrl}`);
  let offset = 0;
  let attempt = 0;

  while (!stopping) {
    try {
      const updates = await getUpdates(fetch, { token, offset, timeout: 25, signal: controller.signal });
      offset = await processUpdateBatch(updates, offset, (update) => forwardUpdate(fetch, {
        url: localWebhookUrl, secret, update, signal: controller.signal,
      }));
      if (updates.length) console.log(`[bot] Обработано обновлений: ${updates.length}; следующий offset: ${offset}.`);
      attempt = 0;
    } catch (error) {
      if (stopping || error?.name === 'AbortError') break;
      if (Number.isInteger(error?.nextOffset)) offset = error.nextOffset;
      if (error?.code === 'TELEGRAM_CONFLICT') {
        console.error('[bot] Telegram сообщает 409 Conflict: уже работает другой экземпляр long polling. Этот процесс остановлен.');
        process.exitCode = 1;
        break;
      }
      const delay = retryDelay(attempt++);
      console.error(`[bot] ${error instanceof Error ? error.message : 'Временная ошибка.'} Повтор через ${delay / 1000} с.`);
      await wait(delay);
    }
  }
}

main().catch((error) => {
  console.error(`[bot] Не удалось запустить: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  process.exitCode = 1;
});
