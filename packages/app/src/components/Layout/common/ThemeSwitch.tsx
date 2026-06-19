'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/hooks/useTheme';

// 主题切换(亮/暗):单个图标按钮,点击在两种主题间切换;写 <html data-theme> 并持久化。
// 放在侧栏 logo 旁(窄栏省空间),显示「将切换到」的目标图标:亮色显示 ☾、暗色显示 ☀。
export function ThemeSwitch() {
  const t = useTranslations('topbar');
  const { theme, setTheme } = useTheme();

  return (
    <button
      type="button"
      title={t('theme')}
      aria-label={t('theme')}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-paper text-[13px] text-ink-soft hover:text-ink"
    >
      <span className="pointer-events-none">{theme === 'light' ? '☾' : '☀'}</span>
    </button>
  );
}
