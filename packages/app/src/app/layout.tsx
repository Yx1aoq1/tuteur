import type { Metadata } from 'next';
import { JetBrains_Mono, Fraunces, Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { PRODUCT_DISPLAY_NAME } from '@/product';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  style: ['normal', 'italic'],
});
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: `${PRODUCT_DISPLAY_NAME} Dashboard`,
  description: 'Local workflow dashboard for AI coding agents',
};

// 首屏防闪烁:渲染前依据 localStorage 设好 data-theme(默认 light)
const themeScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

// 根布局只提供 html/body/字体/intl/主题;具体布局壳(项目侧栏/全局)由各路由段自带。
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      data-theme="light"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
