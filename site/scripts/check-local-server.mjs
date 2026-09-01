import { assertCrmSurface } from './local-runtime.mjs';

const baseUrl = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function load(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}

try {
  const pages = [];
  for (const path of ['/', '/crm', '/crm/analytics']) {
    pages.push(await (await load(`${path}?health=${Date.now()}`)).text());
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const crmHtml = await (await load(`/crm?health=${Date.now()}-${attempt}`)).text();
    assertCrmSurface(crmHtml);
  }
  if (!pages[2].includes('href="/crm"')) throw new Error('На странице аналитики нет обратного перехода в заявки.');

  const scripts = [...new Set(
    [...pages.join('\n').matchAll(/\/?_next\/static\/chunks\/[A-Za-z0-9_./-]+\.js/g)]
      .map((match) => match[0].startsWith('/') ? match[0] : `/${match[0]}`),
  )];

  if (!scripts.length) throw new Error('В HTML не найдены клиентские JS-файлы.');

  for (const script of scripts) {
    const response = await load(script);
    const bytes = (await response.arrayBuffer()).byteLength;
    if (!bytes) throw new Error(`${script}: получен пустой файл.`);
  }

  const ordersResponse = await load('/api/crm/orders');
  const payload = await ordersResponse.json();
  if (!Array.isArray(payload.orders)) throw new Error('API CRM вернул некорректный список заявок.');
  console.log(`[health] OK: ${scripts.length} клиентских scripts, стабильная CRM и ${payload.orders.length} заявок.`);
} catch (error) {
  console.error(`[health] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
