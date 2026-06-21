'use client';

import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useTheme } from '@/hooks/useTheme';

interface ScrollerProps {
  className?: string;
  children: React.ReactNode;
}

// OverlayScrollbars 封装:滚动条悬浮覆盖,不占布局宽度、可滚/不可滚切换不重排;默认隐藏,
// hover/滚动才显示。主题依 useTheme 取 os-theme-dark(亮底深色条)/os-theme-light(墨底浅色条)。
// 用于详情 aside、看板列、弹窗窄栏等容器;markdown 正文保持原生滚动(.doc-scroll),不被此接管。
export function Scroller({ className, children }: ScrollerProps) {
  const { theme } = useTheme();

  return (
    <OverlayScrollbarsComponent
      defer
      className={className}
      options={{
        scrollbars: {
          theme: theme === 'dark' ? 'os-theme-light' : 'os-theme-dark',
          autoHide: 'leave',
          autoHideDelay: 200,
        },
        overflow: { x: 'hidden' },
      }}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}
