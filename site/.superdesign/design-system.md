# Сладкая история — design system

## Product context

Russian confectionery landing page for custom cakes and desserts in Samara. The new `/crm` route is a hidden local service workspace for a small sales team: fast scanning, calling customers, and moving orders through five statuses.

## Visual identity

- Milk background `#fbf5e9`, paper panels `#fffaf1`, cream separators `#f2e6d3`.
- Cocoa text/actions `#3b2118`, caramel accent `#a85f38`, restrained berry `#b7484f`, secondary ink `#654d42`, borders `#ddcbb7`.
- Georgia for brand/display only; Arial/Helvetica for compact operational UI.
- Soft warm shadows, 1px warm borders, generous outer whitespace, 14–18px panel radii, pill filters.
- No gradients, neon, cold blue, generic SaaS purple, glass-heavy styling, or invented public navigation.

## CRM layout

- Desktop-first page with a slim brand header, title “Заявки”, service subtitle, and a cocoa/caramel refresh action.
- Search row plus status pills with live counts.
- One warm paper table/card: number, date, client, phone, product, source, amount, status.
- Two-line cells where secondary event date, guest count, prize, or Telegram delivery warning add context.
- Status selector is a compact pill whose background changes by status.
- Responsive behavior: preserve data access on narrow screens using horizontal table scroll; controls wrap cleanly.
- Loading, error, and empty states belong inside the table surface.

## Interaction

- Search matches order number, customer name, phone, and product.
- Filters are immediate and mutually exclusive: all/new/contacted/agreement/paid/rejected.
- Refresh shows progress without moving layout.
- Status updates optimistically lock the row, then reconcile from server; failures remain visible and recoverable.
- Respect reduced motion; keep transitions below 200ms.
