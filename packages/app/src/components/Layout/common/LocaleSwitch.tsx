'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from '@/i18n/locale';
import { LOCALES } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

const LABELS: Record<Locale, string> = { zh: '中', en: 'EN' };

// 语言切换:写 locale cookie(server action)后 router.refresh() 让 RSC 用新语言重渲染。
export function LocaleSwitch() {
  const t = useTranslations('topbar');
  const active = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (next: Locale) => {
    if (next === active) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex overflow-hidden rounded-full border border-line-strong" title={t('language')}>
      {LOCALES.map(locale => (
        <button
          key={locale}
          type="button"
          disabled={pending}
          onClick={() => select(locale)}
          className={segClass(locale === active)}
        >
          {LABELS[locale]}
        </button>
      ))}
    </span>
  );
}

function segClass(active: boolean): string {
  const base = 'cursor-pointer px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50';
  return active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft`;
}
