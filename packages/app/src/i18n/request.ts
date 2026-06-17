import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { normalizeLocale, LOCALE_COOKIE } from './config';

// next-intl 请求配置(无路由模式):从 cookie 读 locale,加载对应 messages。
// next.config 的 createNextIntlPlugin 默认指向本文件。
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages };
});
