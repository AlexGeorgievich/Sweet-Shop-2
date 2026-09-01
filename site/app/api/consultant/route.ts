import { salesManagerInstructions } from '@/app/lib/bakery-knowledge';
import { normalizeConversation, parseConsultantResponse, ConsultantMessage } from '@/app/lib/consultant';

type LlmResponse = { choices?: Array<{ message?: { content?: string | null } }>; error?: { message?: string } };
const requests = new Map<string, number[]>();

function limited(ip: string, now: number) {
  const recent = (requests.get(ip) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 15) return true;
  recent.push(now);
  requests.set(ip, recent);
  return false;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (limited(ip, Date.now())) return Response.json({ error: 'Слишком много сообщений. Попробуйте через минуту.' }, { status: 429 });

  let payload: { message?: unknown; history?: unknown };
  try { payload = await request.json() as typeof payload; } catch { return Response.json({ error: 'Некорректный запрос.' }, { status: 400 }); }
  const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 2_000) : '';
  if (!message) return Response.json({ error: 'Напишите вопрос консультанту.' }, { status: 400 });

  const apiKey = process.env.LLM_ROUTER_API_KEY;
  if (!apiKey) return Response.json({ error: 'Консультант временно недоступен.' }, { status: 503 });
  const baseUrl = (process.env.LLM_ROUTER_BASE_URL || 'https://llm-router.org/v1').replace(/\/$/, '');
  const model = process.env.LLM_ROUTER_MODEL || 'gemini-3-flash';
  const history = normalizeConversation(payload.history);
  const messages: ConsultantMessage[] = [...history, { role: 'user', content: message }];
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: `${salesManagerInstructions}

Ты работаешь внутри сайта кондитерской. Никогда не предлагай перейти на сайт или открывать ссылку. Когда человек готов оформлять заказ, направляй его к форме заказа ниже на этой же странице.

После видимого ответа обязательно добавь отдельной последней строкой служебный блок:
<consultant_meta>{"orderIntent":false,"summary":""}</consultant_meta>

Поставь orderIntent=true, если из диалога видно намерение оформить заказ: человек прямо соглашается заказать, выбрал десерт и обсуждает детали, либо сообщил минимум два существенных параметра заказа (событие, дата, гости, начинка, оформление, доставка). Summary заполни кратким резюме только известных фактов заказа и нерешённых вопросов, без выдумок, до 600 символов. Если намерения ещё нет, оставь false и пустой summary. Служебный блок пользователь не увидит.` }, ...messages], max_tokens: 650, temperature: 0.4, stream: false }),
      signal: AbortSignal.timeout(25_000),
    });
    const body = await response.json() as LlmResponse;
    if (!response.ok) throw new Error(body.error?.message || `LLM Router ${response.status}`);
    return Response.json(parseConsultantResponse(body.choices?.[0]?.message?.content || ''));
  } catch (error) {
    console.error('Consultant reply failed:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Сейчас не удалось получить ответ. Оставьте заявку — менеджер уточнит детали. Какой десерт и на какую дату вы рассматриваете?' }, { status: 502 });
  }
}
