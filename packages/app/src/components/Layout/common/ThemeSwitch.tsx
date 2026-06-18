'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/hooks/useTheme';

// 主题切换(亮/暗):写 <html data-theme> 并持久化;原先在全局设置面板,现移至顶栏右上。
export function ThemeSwitch() {
  const t = useTranslations('topbar');
  const { theme, setTheme } = useTheme();

  return (
    <span className="inline-flex overflow-hidden rounded-full border border-line-strong" title={t('theme')}>
      <button type="button" onClick={() => setTheme('light')} className={segClass(theme === 'light')}>
        {t('themeLight')}
      </button>
      <button type="button" onClick={() => setTheme('dark')} className={segClass(theme === 'dark')}>
        {t('themeDark')}
      </button>
    </span>
  );
}

function segClass(active: boolean): string {
  const base = 'cursor-pointer px-2.5 py-1 text-[12px] font-semibold';
  return active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft`;
}
