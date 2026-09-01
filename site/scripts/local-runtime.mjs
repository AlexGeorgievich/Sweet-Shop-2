import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseListenerPids(output, port) {
  const pids = new Set();
  for (const line of String(output).split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns[0] !== 'TCP' || columns[3] !== 'LISTENING') continue;
    const localPort = Number(columns[1]?.match(/:(\d+)$/)?.[1]);
    const pid = Number(columns[4]);
    if (localPort === port && Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

export function assertCrmSurface(html) {
  const required = ['href="/crm/analytics"', 'crm-facets', 'crm-table-footer'];
  if (required.some((marker) => !String(html).includes(marker))) {
    throw new Error('Сервер отдаёт устаревшую CRM без новых интерактивных элементов.');
  }
}

function listenerPids(port) {
  return parseListenerPids(execFileSync('netstat', ['-ano'], { encoding: 'utf8' }), port);
}

function processName(pid) {
  const output = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).trim();
  return output.match(/^"([^"]+)"/)?.[1] ?? '';
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export async function stopNodeListeners(port) {
  const pids = listenerPids(port);
  const unsafe = pids.map((pid) => ({ pid, name: processName(pid) })).filter(({ name }) => name && name.toLowerCase() !== 'node.exe');
  if (unsafe.length) throw new Error(`Порт ${port} занят не Node.js: ${unsafe.map(({ pid, name }) => `${name} (${pid})`).join(', ')}`);
  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      if (listenerPids(port).includes(pid)) throw new Error(`Не удалось остановить сервер PID ${pid}.`);
    }
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!listenerPids(port).length) return pids;
    await wait(150);
  }
  throw new Error(`Порт ${port} не освободился после остановки серверов.`);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = Number(process.argv[2] || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Укажите корректный TCP-порт.');
  const stopped = await stopNodeListeners(port);
  console.log(stopped.length ? `[runtime] Остановлены процессы: ${stopped.join(', ')}.` : `[runtime] Порт ${port} свободен.`);
}
