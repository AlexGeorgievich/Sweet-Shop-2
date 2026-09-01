# Page dependency trees

## `/`

- `app/layout.tsx`
  - `app/globals.css`
  - `app/page.tsx`
    - `next/image`
    - `app/components/consultant-widget.tsx`
    - order validation/detail/wheel helpers

## `/crm` (new target)

- `app/layout.tsx`
  - `app/globals.css`
  - `app/crm/page.tsx` (to be created)
    - reads `/api/crm/orders`
