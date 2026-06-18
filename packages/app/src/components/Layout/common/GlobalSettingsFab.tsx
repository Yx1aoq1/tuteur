'use client';

import { useTranslations } from 'next-intl';
import { useDraggable } from '@/hooks/useDraggable';

// 悬浮可拖动的全局设置入口(小号)。设置面板暂未放出:本版仅占位 + 可拖动定位,
// 主题/语言切换已移至顶栏右上(见 Topbar)。
export function GlobalSettingsFab() {
  const t = useTranslations('common');
  const { position, dragging, onPointerDown } = useDraggable();
  const fabStyle = position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined;

  return (
    <button
      type="button"
      title={t('globalSettings')}
      onPointerDown={onPointerDown}
      style={fabStyle}
      className={`fixed bottom-5 right-5 z-[60] flex h-9 w-9 touch-none select-none items-center justify-center rounded-full border border-line-strong bg-paper text-[15px] text-ink-soft shadow-card ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <span className="pointer-events-none">⚙</span>
    </button>
  );
}
