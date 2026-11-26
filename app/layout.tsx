import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from './AuthProvider';
import { APP_NAME, CATCHPHRASE } from '@/lib/config';

export const metadata: Metadata = {
  title: `${APP_NAME}｜${CATCHPHRASE}`,
  description: '困った時、近くの仲間が駆けつける。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <main className="wrap">
          <AuthProvider>{children}</AuthProvider>
        </main>
      </body>
    </html>
  );
}
