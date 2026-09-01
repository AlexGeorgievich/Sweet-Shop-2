'use client';

import { useEffect, useState } from 'react';
import { DataMode, modeLabel } from '@/app/lib/data-mode';

type ModeResponse = { dataMode: DataMode; canUseDemo: boolean };

export function CrmDataModeBar() {
  const [mode, setMode] = useState<DataMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/backend/admin/data-mode', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok) throw new Error('Не удалось определить режим CRM.');
        return response.json() as Promise<ModeResponse>;
      })
      .then((data) => { if (data?.canUseDemo) setMode(data.dataMode); })
      .catch((failure) => {
        if ((failure as Error).name !== 'AbortError') setError((failure as Error).message);
      });
    return () => controller.abort();
  }, []);

  async function switchMode(next: DataMode) {
    if (next === mode || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/backend/admin/data-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataMode: next }),
      });
      if (!response.ok) {
        const body = await response.json() as { detail?: string };
        throw new Error(body.detail || 'Не удалось переключить режим.');
      }
      window.location.reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось переключить режим.');
      setBusy(false);
    }
  }

  if (!mode) return null;
  return <aside className={`crm-mode-bar ${mode === 'demo' ? 'crm-mode-demo' : ''}`} role="status">
    <div>
      <strong>{mode === 'demo' ? 'ДЕМО — данные для моделирования' : 'CRM — реальные данные'}</strong>
      <small>Выбранный режим действует только в этой сессии администратора.</small>
    </div>
    <label>
      Контур данных
      <select value={mode} disabled={busy} onChange={(event) => void switchMode(event.target.value as DataMode)}>
        <option value="production">{modeLabel('production')}</option>
        <option value="demo">{modeLabel('demo')}</option>
      </select>
    </label>
    {error && <span className="crm-mode-error">{error}</span>}
  </aside>;
}
