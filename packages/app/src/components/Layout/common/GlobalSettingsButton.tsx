'use client';

import { useTranslations } from 'next-intl';

// 全局设置入口(占位):设置面板暂未放出,本版仅占位按钮。
// 原为悬浮可拖动 FAB,现固定在侧栏底部栏靠右,不再悬浮。
export function GlobalSettingsButton() {
  const t = useTranslations('common');

  return (
    <button
      type="button"
      title={t('globalSettings')}
      aria-label={t('globalSettings')}
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-paper text-[13px] text-ink-soft hover:text-ink"
    >
      <span className="pointer-events-none">⚙</span>
    </button>
  );
}
