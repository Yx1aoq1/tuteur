'use server';

import { cookies } from 'next/headers';
import { normalizeLocale, LOCALE_COOKIE } from './config';
import type { Locale } from './config';

// 切换界面语言:写 locale cookie;客户端随后 router.refresh() 让 RSC 重渲染。
// 一年有效期,SameSite=Lax(本地单实例,无跨站需求)。
export async function setLocale(next: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, normalizeLocale(next), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
