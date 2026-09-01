# Shared components

- `app/components/consultant-widget.tsx` — fixed bottom-right sales consultant. It owns the chat launcher, expanding conversation panel, name capture, question/order actions, wheel trigger, and order-form handoff. It is public-site-only and must not render on `/crm`.
- The public landing page is otherwise intentionally self-contained in `app/page.tsx`; it has no reusable navigation or table primitives.
