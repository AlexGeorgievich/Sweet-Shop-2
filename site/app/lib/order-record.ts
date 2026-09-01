export const orderStatuses = ['new', 'contacted', 'agreement', 'paid', 'rejected'] as const;
export type OrderStatus = typeof orderStatuses[number];

export type OrderRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  phone: string;
  dessert: string;
  eventDate: string;
  guests: number;
  details: string;
  prize: string;
  consultantSummary: string;
  source: string;
  amountLabel: string;
  amountRub?: number;
  weightKg?: number;
  decor?: string;
  customerType?: 'new' | 'repeat';
  firstResponseAt?: string | null;
  responseMinutes?: number | null;
  status: OrderStatus;
  telegram: { delivered: boolean; deliveredAt: string | null; lastError: string | null };
};

const amountByDessert: Record<string, string> = {
  'Торты на заказ': 'от 2 700 ₽/кг',
  'Воздушное безе': 'от 180 ₽/шт.',
  'Заварные пирожные': 'от 260 ₽/шт.',
  'Пончики и сладости': 'от 220 ₽/шт.',
  'Порционные торты': 'от 350 ₽/шт.',
  'Круассаны с кремом': 'от 290 ₽/шт.',
};

type CreateOrderRecordInput = Omit<OrderRecord, 'updatedAt' | 'source' | 'amountLabel' | 'status' | 'telegram'>;

export function createOrderRecord(input: CreateOrderRecordInput): OrderRecord {
  return {
    ...input,
    updatedAt: input.createdAt,
    source: input.prize ? 'Сайт · колесо подарков' : 'Сайт · форма заявки',
    amountLabel: amountByDessert[input.dessert] ?? 'по расчёту менеджера',
    status: 'new',
    telegram: { delivered: false, deliveredAt: null, lastError: null },
  };
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && orderStatuses.includes(value as OrderStatus);
}
