import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GreenOps | Digital sustainability control plane',
  description:
    'Review sustainability findings, inspect agent evidence, record human decisions and verify supported improvements in one local workspace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
