import { salesManagerInstructions } from '@/app/lib/bakery-knowledge';

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: { is_bot?: boolean; first_name?: string };
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type LlmRouterResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

const conversations = new Map<number, { updatedAt: number; messages: ChatMessage[] }>();
const processedUpdates = new Map<number, number>();
const chatRequests = new Map<number, number[]>();
const HISTORY_TTL_MS = 30 * 60_000;
const UPDATE_TTL_MS = 10 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 12;

function cleanup(now: number) {
  for (const [chatId, conversation] of conversations) {
    if (now - conversation.updatedAt > HISTORY_TTL_MS) conversations.delete(chatId);
  }
  for (const [updateId, createdAt] of processedUpdates) {
    if (now - createdAt > UPDATE_TTL_MS) processedUpdates.delete(updateId);
  }
  for (const [chatId, requests] of chatRequests) {
    const recent = requests.filter((createdAt) => now - createdAt < RATE_LIMIT_WINDOW_MS);
    if (recent.length) chatRequests.set(chatId, recent);
    else chatRequests.delete(chatId);
  }
}

function isRateLimited(chatId: number, now: number) {
  const recent = (chatRequests.get(chatId) ?? []).filter(
    (createdAt) => now - createdAt < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_REQUESTS) return true;
  recent.push(now);
  chatRequests.set(chatId, recent);
  return false;
}

function ensureSalesQuestion(answer: string) {
  const normalized = answer.trim().slice(0, 3_800);
  if (!normalized) {
    return 'Я помогу подобрать десерт по информации нашей кондитерской. Какой праздник и на какую дату вы планируете?';
  }
  return normalized.endsWith('?')
    ? normalized
    : `${normalized}\n\nПодскажите, на какую дату и для какого события вы выбираете десерт?`;
}

async function telegramCall(token: string, method: string, payload: object) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram ${method} failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

async function askSalesManager(userText: string, history: ChatMessage[]) {
  const apiKey = process.env.LLM_ROUTER_API_KEY;
  const baseUrl = (process.env.LLM_ROUTER_BASE_URL || 'https://llm-router.org/v1').replace(/\/$/, '');
  const model = process.env.LLM_ROUTER_MODEL || 'gemini-3-flash';
  const siteUrl = process.env.SITE_URL || 'https://sladkaya-istoria-samara.browererwin.chatgpt.site';

  if (!apiKey) throw new Error('LLM_ROUTER_API_KEY is not configured.');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `${salesManagerInstructions}\n\nСсылка на форму заявки: ${siteUrl}` },
        ...history,
        { role: 'user', content: userText },
      ],
      max_tokens: 500,
      temperature: 0.45,
      stream: false,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  const body = await response.json() as LlmRouterResponse;
  if (!response.ok) {
    throw new Error(`LLM Router failed (${response.status}): ${body.error?.message || 'unknown error'}`);
  }

  return ensureSalesQuestion(body.choices?.[0]?.message?.content || '');
}

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const suppliedSecret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!webhookSecret || suppliedSecret !== webhookSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const now = Date.now();
  cleanup(now);
  if (processedUpdates.has(update.update_id)) return Response.json({ ok: true });

  const message = update.message;
  const userText = message?.text?.trim().slice(0, 2_000);
  if (!message || !userText || message.from?.is_bot) {
    processedUpdates.set(update.update_id, now);
    return Response.json({ ok: true });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Telegram webhook cannot reply: TELEGRAM_BOT_TOKEN is missing.');
    return Response.json({ ok: false }, { status: 503 });
  }

  if (isRateLimited(message.chat.id, now)) {
    try {
      await telegramCall(token, 'sendMessage', {
        chat_id: message.chat.id,
        text: 'Сообщений слишком много — давайте продолжим через минуту. Какой главный вопрос по заказу вы хотите уточнить первым?',
        reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return Response.json({ ok: false }, { status: 502 });
    }
    processedUpdates.set(update.update_id, now);
    return Response.json({ ok: true });
  }

  if (userText === '/start' || userText === '/help') {
    const siteUrl = process.env.SITE_URL || 'https://sladkaya-istoria-samara.browererwin.chatgpt.site';
    try {
      await telegramCall(token, 'sendMessage', {
        chat_id: message.chat.id,
        text: `Здравствуйте! Я виртуальный менеджер кондитерской «Сладкая история» в Самаре. Помогу выбрать десерт, расскажу о ценах и подготовлю вас к заявке: ${siteUrl}\n\nЧто вы планируете — торт к празднику или порционные десерты?`,
        reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return Response.json({ ok: false }, { status: 502 });
    }
    processedUpdates.set(update.update_id, now);
    return Response.json({ ok: true });
  }

  if (userText === '/reset') {
    conversations.delete(message.chat.id);
    try {
      await telegramCall(token, 'sendMessage', {
        chat_id: message.chat.id,
        text: 'Начинаем подбор заново. Для какого события и на какую дату нужен десерт?',
        reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return Response.json({ ok: false }, { status: 502 });
    }
    processedUpdates.set(update.update_id, now);
    return Response.json({ ok: true });
  }

  const existing = conversations.get(message.chat.id);
  const history = existing && now - existing.updatedAt <= HISTORY_TTL_MS
    ? existing.messages
    : [];

  await telegramCall(token, 'sendChatAction', {
    chat_id: message.chat.id,
    action: 'typing',
  }).catch(() => undefined);

  let answer: string;
  try {
    answer = await askSalesManager(userText, history);
  } catch (error) {
    console.error('Sales manager reply failed:', error instanceof Error ? error.message : error);
    answer = 'Сейчас мне не удалось подготовить точный ответ. Вы можете оставить заявку на сайте, и живой менеджер уточнит детали. Какой десерт и на какую дату вы рассматриваете?';
  }

  try {
    await telegramCall(token, 'sendMessage', {
      chat_id: message.chat.id,
      text: answer,
      reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return Response.json({ ok: false }, { status: 502 });
  }

  const appendedHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: userText },
    { role: 'assistant', content: answer },
  ];
  const updatedHistory = appendedHistory.slice(-8);
  conversations.set(message.chat.id, {
    updatedAt: now,
    messages: updatedHistory,
  });
  processedUpdates.set(update.update_id, now);

  return Response.json({ ok: true });
}
