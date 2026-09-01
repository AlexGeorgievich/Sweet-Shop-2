# Layouts

`app/layout.tsx` is the only shared layout. It loads `app/globals.css`, sets Russian metadata and renders route children directly:

```tsx
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
```

The public route builds its own 1240px header. The new `/crm` target should use an isolated service-page shell and must not add a link to the public navigation.
