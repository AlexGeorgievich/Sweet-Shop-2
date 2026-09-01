import { isOrderStatus } from '@/app/lib/order-record';
import { listOrders, updateOrderStatus } from '@/app/lib/order-store';

export const runtime = 'nodejs';

async function forwardCrm(method: 'GET' | 'PATCH', request?: Request) {
  const apiUrl = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const cookie = request?.headers.get('cookie');
  const headers: HeadersInit = {
    ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  };
  try {
    const response = await fetch(`${apiUrl}/api/v1/crm/orders`, {
      method,
      headers,
      body: method === 'PATCH' && request ? await request.text() : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('FastAPI CRM service is unavailable:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Сервис CRM временно недоступен.' }, { status: 503 });
  }
}

export async function GET(request: Request) {
  if (process.env.CRM_BACKEND === 'fastapi') return forwardCrm('GET', request);
  try {
    return Response.json({ orders: await listOrders() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Cannot list CRM orders:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Не удалось прочитать локальные заявки.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) {
    return Response.json({ error: 'Запрос отклонён проверкой источника.' }, { status: 403 });
  }
  if (process.env.CRM_BACKEND === 'fastapi') return forwardCrm('PATCH', request);
  let payload: { id?: unknown; status?: unknown };
  try {
    payload = await request.json() as { id?: unknown; status?: unknown };
  } catch {
    return Response.json({ error: 'Не удалось прочитать изменение статуса.' }, { status: 400 });
  }

  if (typeof payload.id !== 'string' || !isOrderStatus(payload.status)) {
    return Response.json({ error: 'Укажите корректные номер заявки и статус.' }, { status: 400 });
  }

  try {
    return Response.json({ order: await updateOrderStatus(payload.id, payload.status) });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ORDER_NOT_FOUND') {
      return Response.json({ error: 'Заявка не найдена.' }, { status: 404 });
    }
    console.error('Cannot update CRM order:', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Не удалось изменить статус заявки.' }, { status: 500 });
  }
}
