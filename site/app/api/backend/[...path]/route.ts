export const runtime = 'nodejs';

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host')) {
      return Response.json({ error: 'Запрос отклонён проверкой источника.' }, { status: 403 });
    }
  }
  const { path } = await context.params;
  const base = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const cookie = request.headers.get('cookie');
  const contentType = request.headers.get('content-type');
  const timeoutMs = path.join('/') === 'admin/demo/generate' ? 120_000 : 15_000;
  const response = await fetch(`${base}/api/v1/${path.join('/')}`, {
    method: request.method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(contentType ? { 'Content-Type': contentType } : {}) },
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return new Response(await response.text(), { status: response.status, headers: {
    'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store',
  } });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
