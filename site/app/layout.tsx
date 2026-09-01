import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Сладкая история — кондитерская в Самаре',
  description: 'Торты, пирожные и десерты ручной работы с доставкой по Самаре.',
  openGraph: {
    title: 'Сладкая история — кондитерская в Самаре',
    description: 'Торты, пирожные и десерты ручной работы для ваших особенных дней.',
    images: [{ url: '/og.png', width: 1680, height: 945, alt: 'Сладкая история — кондитерская ручной работы в Самаре' }],
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Сладкая история — кондитерская в Самаре',
    description: 'Торты, пирожные и десерты ручной работы для ваших особенных дней.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
