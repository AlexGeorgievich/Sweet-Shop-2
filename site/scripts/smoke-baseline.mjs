const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(5_000),
  });
  return response;
}

async function expectOkPage(path, marker) {
  const response = await request(path);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  const body = await response.text();
  if (!body.includes(marker)) throw new Error(`${path} does not contain baseline marker: ${marker}`);
}

await expectOkPage('/', 'Сладкая история');
await expectOkPage('/crm', 'Заявки');
await expectOkPage('/crm/analytics', 'Аналитика');

const invalidOrder = await request('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});

if (invalidOrder.status !== 400) {
  throw new Error(`Invalid order returned HTTP ${invalidOrder.status}, expected 400`);
}

console.log('[smoke] Baseline storefront, CRM, analytics and validation contract are available.');

