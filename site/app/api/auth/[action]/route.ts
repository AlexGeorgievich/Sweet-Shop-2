const allowedActions = new Set(['login', 'logout', 'me']);

async function forward(request: Request, action: string) {
  if (!allowedActions.has(action)) {
    return Response.json({ error: 'Неизвестная операция.' }, { status: 404 });
  }
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host')) {
      return Response.json({ error: 'Запрос отклонён проверкой источника.' }, { status: 403 });
    }
  }
  const apiUrl = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const response = await fetch(`${apiUrl}/api/v1/auth/${action}`, {
    method: request.method,
    headers: {
      ...(request.headers.get('content-type')
        ? { 'Content-Type': request.headers.get('content-type')! }
        : {}),
      ...(request.headers.get('cookie') ? { Cookie: request.headers.get('cookie')! } : {}),
    },
    body: request.method === 'GET' ? undefined : await request.text(),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  const headers = new Headers({
    'Content-Type': response.headers.get('content-type') || 'application/json',
    'Cache-Control': 'no-store',
  });
  const cookie = response.headers.get('set-cookie');
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(response.status === 204 ? null : await response.text(), {
    status: response.status,
    headers,
  });
}

type Context = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Context) {
  return forward(request, (await context.params).action);
}

export async function POST(request: Request, context: Context) {
  return forward(request, (await context.params).action);
}
