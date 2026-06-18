'use client';

import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'withy-theme';

// 读取 <html data-theme>(首屏由 layout 内联脚本依 localStorage 设好);SSR 无 document 时回退 light。
function readTheme(): Theme {
  if (typeof document !== 'undefined') {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark' || current === 'light') return current;
  }
  return 'light';
}

/**
 * 读写 <html data-theme> 并持久化到 localStorage。
 * 惰性初始化直接读 DOM(客户端组件首渲染即得真实主题),无需 effect 同步。
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage 不可用时忽略,主题仍在本次会话生效
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
