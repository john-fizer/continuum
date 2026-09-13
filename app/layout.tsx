import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Continuum — Brain framework',
  description:
    'Independent brains, connected evidence, and continuous inquiry.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
