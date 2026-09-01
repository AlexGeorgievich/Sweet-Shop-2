import type { OrderRecord, OrderStatus } from './order-record.ts';

type DemoOptions = { seed: number; startDate: string; endDate: string };
export type DemoOrderRecord = OrderRecord & {
  amountRub: number;
  weightKg: number;
  decor: string;
  customerType: 'new' | 'repeat';
  firstResponseAt: string | null;
  responseMinutes: number | null;
};

type CakeProfile = { name: string; rate: number; minWeight: number; maxWeight: number; decors: string[] };
const cakeProfiles: CakeProfile[] = [
  { name: 'Бенто-торт', rate: 2_700, minWeight: 0.8, maxWeight: 1.5, decors: ['Минималистичная надпись', 'Ягоды и крем', 'Рисунок по эскизу'] },
  { name: 'Праздничный торт', rate: 3_000, minWeight: 2, maxWeight: 5.5, decors: ['Ягоды и шоколад', 'Кремовые цветы', 'Золотые акценты', 'Минимализм'] },
  { name: 'Детский торт', rate: 3_200, minWeight: 2, maxWeight: 5, decors: ['Фигурки героев', 'Пряники и леденцы', 'Фотопечать', 'Радужный декор'] },
  { name: 'Свадебный торт', rate: 3_900, minWeight: 5, maxWeight: 12, decors: ['Живые цветы', 'Каскад ягод', 'Белый минимализм', 'Золотые акценты'] },
  { name: 'Шоколадный торт', rate: 2_900, minWeight: 1.5, maxWeight: 6, decors: ['Шоколадные сферы', 'Ганаш и ягоды', 'Орехи и карамель', 'Без сложного декора'] },
  { name: 'Ягодный торт', rate: 3_100, minWeight: 1.5, maxWeight: 6, decors: ['Свежие ягоды', 'Ягодный венок', 'Кремовые цветы', 'Минимализм'] },
];
const firstNames = ['Анна', 'Мария', 'Елена', 'Ольга', 'Ирина', 'Наталья', 'Виктория', 'Алина', 'Дарья', 'Светлана', 'Дмитрий', 'Алексей', 'Сергей', 'Артём', 'Игорь', 'Михаил'];
const lastNames = ['Соколова', 'Кузнецова', 'Смирнова', 'Попова', 'Волкова', 'Орлова', 'Морозова', 'Лебедева', 'Петрова', 'Новикова', 'Иванов', 'Петров', 'Смирнов', 'Кузнецов', 'Волков', 'Орлов'];
const decorSurcharge: Record<string, number> = {
  'Без сложного декора': 0, 'Минимализм': 300, 'Минималистичная надпись': 350, 'Ягоды и крем': 500,
  'Свежие ягоды': 700, 'Ягодный венок': 900, 'Ягоды и шоколад': 800, 'Ганаш и ягоды': 800,
  'Орехи и карамель': 650, 'Кремовые цветы': 900, 'Шоколадные сферы': 1_100, 'Рисунок по эскизу': 700,
  'Фигурки героев': 1_400, 'Пряники и леденцы': 1_000, 'Фотопечать': 850, 'Радужный декор': 1_100,
  'Живые цветы': 1_500, 'Каскад ягод': 1_800, 'Белый минимализм': 900, 'Золотые акценты': 1_200,
};
const prizes = ['Скидка 10%', 'Скидка 15%', 'Праздничный декор', 'Бесплатная доставка'];
const wishes = [
  'Важно, чтобы торт был не слишком сладким; оформление можно адаптировать под выбранную палитру праздника.',
  'Нужна аккуратная поздравительная надпись и спокойные оттенки без яркой мастики.',
  'Есть аллергия на арахис, поэтому клиент просит отдельно подтвердить состав начинки.',
  'Хотят лёгкую ягодную начинку и декор, который хорошо перенесёт дорогу до площадки.',
  'Референс оформления отправлен консультанту; допустимы небольшие изменения по сезону.',
  'Выдача нужна строго к указанному времени, так как после неё заказ сразу везут на праздник.',
];

function randomFactory(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) / 4_294_967_296);
}

function weightedPick<T>(items: T[], weight: (item: T) => number, random: () => number) {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let point = random() * total;
  for (const item of items) {
    point -= weight(item);
    if (point <= 0) return item;
  }
  return items.at(-1)!;
}

function dateUtc(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function dateRange(start: Date, end: Date) {
  const dates: Date[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function busyDayWeight(date: Date) {
  const day = date.getUTCDay();
  if (day === 6) return 3.2;
  if (day === 5) return 2.8;
  if (day === 0) return 1.05;
  return 0.62;
}

function pickStatus(created: Date, end: Date, responseMinutes: number | null, repeat: boolean, source: string, random: () => number): OrderStatus {
  const age = Math.floor((end.getTime() - created.getTime()) / 86_400_000);
  const weights: Record<OrderStatus, number> = age <= 7
    ? { new: 35, contacted: 30, agreement: 20, paid: 10, rejected: 5 }
    : age <= 21
      ? { new: 13, contacted: 24, agreement: 25, paid: 28, rejected: 10 }
      : { new: 4, contacted: 8, agreement: 12, paid: 64, rejected: 12 };
  if (responseMinutes !== null && responseMinutes <= 18) weights.paid *= 1.45;
  if (responseMinutes !== null && responseMinutes >= 90) weights.rejected *= 1.7;
  if (repeat) weights.paid *= 1.35;
  if (source === 'Рекомендация') weights.paid *= 1.2;
  return weightedPick(Object.keys(weights) as OrderStatus[], (status) => weights[status], random);
}

function responseFor(source: string, createdHour: number, createdDate: Date, random: () => number) {
  const baseBySource: Record<string, number> = {
    Telegram: 9, WhatsApp: 12, 'Повторный заказ': 8, 'Сайт · форма заявки': 22,
    'Сайт · колесо подарков': 29, Рекомендация: 18,
  };
  const outsideHours = createdHour < 10 || createdHour >= 19;
  const weekend = [0, 6].includes(createdDate.getUTCDay());
  return Math.max(3, Math.round((baseBySource[source] ?? 20) * (outsideHours ? 2.2 : 1) * (weekend ? 1.35 : 1) + random() * 24));
}

function summaryFor(status: OrderStatus, decor: string, eventDate: string) {
  const byStatus: Record<OrderStatus, string> = {
    new: `Заявка ожидает первого контакта. Уточнить начинку, бюджет и возможность декора «${decor}».`,
    contacted: `Связались с клиентом, основные пожелания записаны. Следующий шаг — подтвердить вес и дату выдачи ${eventDate}.`,
    agreement: `Клиент выбирает финальное оформление. Подготовить расчёт и согласовать детали декора «${decor}».`,
    paid: `Заказ подтверждён и оплачен. Передать параметры в производство и проконтролировать готовность к ${eventDate}.`,
    rejected: 'Заказ закрыт после обсуждения условий. Сохранить контакт для бережного повторного предложения без давления.',
  };
  return byStatus[status];
}

function phone(customerNumber: number) {
  const digits = String(customerNumber).padStart(7, '0');
  return `+7 900 ${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
}

export function generateDemoOrders(count: number, options: DemoOptions): DemoOrderRecord[] {
  const random = randomFactory(options.seed);
  const start = dateUtc(options.startDate);
  const end = dateUtc(options.endDate);
  const orderDates = dateRange(start, end);
  const customers: { name: string; phone: string }[] = [];
  const result: DemoOrderRecord[] = [];

  for (let index = 0; index < count; index += 1) {
    const repeat = customers.length > 12 && random() < 0.27;
    const customer = repeat
      ? customers[Math.floor(random() * customers.length)]
      : {
          name: `${firstNames[Math.floor(random() * firstNames.length)]} ${lastNames[Math.floor(random() * lastNames.length)]}`,
          phone: phone(customers.length + 1),
        };
    if (!repeat) customers.push(customer);

    const createdDate = weightedPick(orderDates, busyDayWeight, random);
    const pickupCandidates = Array.from({ length: 19 }, (_, lead) => addDays(createdDate, lead + 3));
    const pickupDate = weightedPick(pickupCandidates, busyDayWeight, random);
    const profile = weightedPick(cakeProfiles, (item) => item.name === 'Праздничный торт' ? 24 : item.name === 'Свадебный торт' ? 8 : 14, random);
    const weightKg = Math.round((profile.minWeight + random() * (profile.maxWeight - profile.minWeight)) * 10) / 10;
    const decor = profile.decors[Math.floor(random() * profile.decors.length)];
    const amountRub = Math.round((profile.rate * weightKg + (decorSurcharge[decor] ?? 0)) / 100) * 100;
    const regularSources = ['Сайт · форма заявки', 'Сайт · колесо подарков', 'Telegram', 'WhatsApp', 'Рекомендация'];
    const repeatSources = ['Повторный заказ', 'Telegram', 'WhatsApp', 'Сайт · форма заявки'];
    const source = weightedPick(repeat ? repeatSources : regularSources, (item) => {
      const weights: Record<string, number> = repeat
        ? { 'Повторный заказ': 45, Telegram: 25, WhatsApp: 18, 'Сайт · форма заявки': 12 }
        : { 'Сайт · форма заявки': 42, 'Сайт · колесо подарков': 20, Telegram: 17, WhatsApp: 12, 'Рекомендация': 9 };
      return weights[item] ?? 1;
    }, random);
    const createdHour = 8 + Math.floor(random() * 14);
    const createdMinute = Math.floor(random() * 60);
    const createdAt = new Date(Date.UTC(createdDate.getUTCFullYear(), createdDate.getUTCMonth(), createdDate.getUTCDate(), createdHour - 3, createdMinute)).toISOString();
    const provisionalResponse = responseFor(source, createdHour, createdDate, random);
    const responseMinutes = random() < 0.035 ? null : provisionalResponse;
    const status = pickStatus(createdDate, end, responseMinutes, repeat, source, random);
    const effectiveResponse = status === 'new' && random() < 0.58 ? null : responseMinutes;
    const firstResponseAt = effectiveResponse === null ? null : new Date(new Date(createdAt).getTime() + effectiveResponse * 60_000).toISOString();
    const prize = source === 'Сайт · колесо подарков' ? prizes[Math.floor(random() * prizes.length)] : '';
    const guests = Math.max(2, Math.round(weightKg * 7));

    result.push({
      id: `SI-DEMO-${String(index + 1).padStart(4, '0')}`,
      createdAt,
      updatedAt: createdAt,
      name: customer.name,
      phone: customer.phone,
      dessert: profile.name,
      eventDate: dateKey(pickupDate),
      guests,
      details: `${wishes[Math.floor(random() * wishes.length)]} Выбранный декор: ${decor}, вес ${weightKg.toLocaleString('ru-RU')} кг.`,
      prize,
      consultantSummary: summaryFor(status, decor, dateKey(pickupDate)),
      source,
      amountLabel: `${amountRub.toLocaleString('ru-RU')} ₽`,
      amountRub,
      weightKg,
      decor,
      customerType: repeat ? 'repeat' : 'new',
      firstResponseAt,
      responseMinutes: effectiveResponse,
      status,
      telegram: random() < 0.018
        ? { delivered: false, deliveredAt: null, lastError: 'Временная ошибка Telegram; заявка сохранена локально.' }
        : { delivered: true, deliveredAt: createdAt, lastError: null },
    });
  }
  return result.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
