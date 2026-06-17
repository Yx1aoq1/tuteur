// 受支持语言与默认值;无路由模式下 locale 存于 cookie(LOCALE_COOKIE)。
export const LOCALES = ['zh', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh';

export const LOCALE_COOKIE = 'locale';

// 收窄任意字符串到受支持 locale,非法值回退默认。
export function normalizeLocale(value: string | undefined): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}
