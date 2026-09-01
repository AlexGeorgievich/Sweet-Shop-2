export type DataMode = 'production' | 'demo';

export type DemoSummary = {
  seed: number;
  asOf: string;
  generatedAt: string;
  count: number;
  digest: string;
  summary: Record<string, number>;
};

export const modeLabel = (mode: DataMode) => mode === 'demo' ? 'Демо' : 'Реальные данные';

export const demoConfirmation = (count: number) =>
  `Будут заменены только демонстрационные данные (${count} заявок). Реальные данные не изменятся.`;
