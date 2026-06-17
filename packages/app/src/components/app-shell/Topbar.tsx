'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { ThemeSwitch } from './ThemeSwitch';
import { LocaleSwitch } from './LocaleSwitch';
import { VIEW_ITEMS } from '@/constants/views';
import type { ProjectCard } from '@/types/dashboard';

interface TopbarProps {
  projects: ProjectCard[];
}

// 顶栏:左=当前作用域上下文,中=功能视图切换(居中),右=主题/语言切换。
export function Topbar({ projects }: TopbarProps) {
  const t = useTranslations('topbar');
  const tViews = useTranslations('views');
  const pathname = usePathname();
  const params = useSearchParams();
  const isGlobal = params.get('scope') === 'global';
  const activePath = params.get('project') ?? (isGlobal ? null : (projects[0]?.path ?? null));
  const activeName = isGlobal ? t('global') : (projects.find(p => p.path === activePath)?.name ?? t('unselected'));

  const query = isGlobal ? '?scope=global' : activePath ? `?project=${encodeURIComponent(activePath)}` : '';

  return (
    <header className="relative flex h-[60px] items-center gap-4 border-b border-line-strong bg-[color-mix(in_srgb,var(--paper)_55%,transparent)] px-5 backdrop-blur-[6px]">
      <div className="flex flex-col leading-[1.15]">
        <span className="font-serif text-[19px] font-semibold">{activeName}</span>
        <span className="text-[11px] font-semibold tracking-[0.5px] text-ink-faint">
          {isGlobal ? t('globalScope') : t('project')}
        </span>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <nav className="inline-flex gap-0.5 rounded-full border border-line-strong bg-paper p-1 shadow-card">
          {VIEW_ITEMS.map(item => {
            const active = pathname === item.href;
            return (
              <Link key={item.key} href={`${item.href}${query}`} className={tabClass(active)}>
                <span className="text-[13px]">{item.icon}</span>
                {tViews(item.key)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="ml-auto inline-flex items-center gap-2.5">
        <LocaleSwitch />
        <ThemeSwitch />
      </div>
    </header>
  );
}

function tabClass(active: boolean): string {
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-[15px] py-1.5 text-[13px] font-semibold no-underline cursor-pointer';
  return active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft hover:text-ink`;
}
