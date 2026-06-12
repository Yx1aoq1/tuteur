import type { Metadata } from 'next';
import { PRODUCT_DISPLAY_NAME } from '../product';
import './globals.css';

export const metadata: Metadata = {
  title: `${PRODUCT_DISPLAY_NAME} Dashboard`,
  description: 'Local workflow dashboard for AI coding agents',
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
