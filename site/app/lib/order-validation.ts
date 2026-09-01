export type OrderField = 'name' | 'phone' | 'dessert' | 'date' | 'guests' | 'details' | 'consent';
export type OrderFieldErrors = Partial<Record<OrderField, string>>;

type OrderValues = Partial<Record<OrderField, unknown>>;

export function validateOrder(values: OrderValues, today: string): OrderFieldErrors {
  const errors: OrderFieldErrors = {};
  const name = typeof values.name === 'string' ? values.name.trim() : '';
  const phone = typeof values.phone === 'string' ? values.phone.trim() : '';
  const dessert = typeof values.dessert === 'string' ? values.dessert.trim() : '';
  const date = typeof values.date === 'string' ? values.date.trim() : '';
  const guests = Number(values.guests);
  const details = typeof values.details === 'string' ? values.details.trim() : '';
  const consent = values.consent === true || values.consent === 'true' || values.consent === 'on';

  if (name.length < 2) errors.name = 'Укажите имя — минимум 2 символа.';
  if (!/^[+\d][\d\s()\-]{7,29}$/.test(phone)) errors.phone = 'Введите телефон полностью, например +7 927 000-00-00.';
  if (!dessert) errors.dessert = 'Выберите десерт из каталога.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) errors.date = 'Выберите сегодняшнюю или будущую дату.';
  if (!Number.isInteger(guests) || guests < 1 || guests > 500) errors.guests = 'Укажите количество гостей от 1 до 500.';
  if (details.length < 3) errors.details = 'Напишите коротко о начинке или оформлении.';
  if (!consent) errors.consent = 'Подтвердите согласие на обработку данных.';
  return errors;
}
