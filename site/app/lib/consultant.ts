export type ConsultantMessage = { role: 'user' | 'assistant'; content: string };

export function normalizeConversation(value: unknown): ConsultantMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { role: string; content: string } => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string';
    })
    .map((item) => ({ role: item.role as ConsultantMessage['role'], content: item.content.trim().slice(0, 1200) }))
    .filter((item) => item.content.length > 0)
    .slice(-8);
}

export function ensureSalesQuestion(answer: string): string {
  const normalized = answer.trim().slice(0, 3_800);
  if (!normalized) return 'Я помогу подобрать десерт по информации нашей кондитерской. Какой праздник и на какую дату вы планируете?';
  return normalized.endsWith('?') ? normalized : `${normalized}\n\nПодскажите, на какую дату и для какого события вы выбираете десерт?`;
}

export function parseConsultantResponse(raw: string) {
  const metaMatch = raw.match(/<consultant_meta>([\s\S]*?)<\/consultant_meta>/i);
  const visibleAnswer = raw.replace(/<consultant_meta>[\s\S]*?(?:<\/consultant_meta>|$)/gi, '').trim();
  let orderIntent = false;
  let summary = '';
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]) as { orderIntent?: unknown; summary?: unknown };
      orderIntent = meta.orderIntent === true;
      summary = typeof meta.summary === 'string' ? meta.summary.trim().slice(0, 600) : '';
    } catch {
      // A malformed service block must never leak into the visible dialogue.
    }
  }
  return { answer: ensureSalesQuestion(visibleAnswer), orderIntent, summary };
}
