export function formatOrderDetails(details: string, guests: number) {
  const note = details.trim();
  const guestLine = `Количество гостей: ${guests}`;
  return note ? `${note}\n${guestLine}` : guestLine;
}
