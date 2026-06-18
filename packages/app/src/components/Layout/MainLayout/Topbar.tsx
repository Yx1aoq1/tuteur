'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { ThemeSwitch } from '../common/ThemeSwitch';
import { LocaleSwitch } from '../common/LocaleSwitch';
import { VIEW_ITEMS, parseRoute } from '@/constants/views';
import type { ProjectCard } from '@/types/dashboard';

interface TopbarProps {
  projects: ProjectCard[];
}

// 顶栏:左=当前作用域上下文,中=功能视图切换(居中),右=主题/语言切换。
// 视图 tab 拼到当前项目名之后(/<name>/<subpath>),切功能保持项目;全局视图不渲染功能 tab。
export function Topbar({ projects }: TopbarProps) {
  const t = useTranslations('topbar');
  const tViews = useTranslations('views');
  const pathname = usePathname();
  const { project: activeName, featureSuffix, isGlobal } = parseRoute(pathname);

  const known = activeName ? projects.find(p => p.name === activeName) : undefined;
  const displayName = isGlobal ? t('global') : (known?.name ?? activeName ?? t('unselected'));

  return (
    <header className="relative flex h-[60px] items-center gap-4 border-b border-line-strong bg-[color-mix(in_srgb,var(--paper)_55%,transparent)] px-5 backdrop-blur-[6px]">
      <div className="flex flex-col leading-[1.15]">
        <span className="font-serif text-[19px] font-semibold">{displayName}</span>
        <span className="text-[11px] font-semibold tracking-[0.5px] text-ink-faint">
          {isGlobal ? t('globalScope') : t('project')}
        </span>
      </div>

      {activeName && !isGlobal && (
        <div className="absolute left-1/2 -translate-x-1/2">
          <nav className="inline-flex gap-0.5 rounded-full border border-line-strong bg-paper p-1 shadow-card">
            {VIEW_ITEMS.map(item => {
              const active = featureSuffix === item.subpath;
              return (
                <Link
                  key={item.key}
                  href={`/${encodeURIComponent(activeName)}${item.subpath}`}
                  className={tabClass(active)}
                >
                  <span className="text-[13px]">{item.icon}</span>
                  {tViews(item.key)}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

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
