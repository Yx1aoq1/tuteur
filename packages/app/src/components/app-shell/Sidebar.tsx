'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { AddProjectDialog } from './AddProjectDialog';
import type { ProjectCard } from '@/types/dashboard';

interface SidebarProps {
  projects: ProjectCard[];
  productName: string;
}

// 左栏:品牌 + 全局 scope + 项目列表(含 git 分支)。项目切换走 ?project= URL 态。
// 客户端组件不可 import @tuteur/core(会把 node:fs 带进浏览器包),品牌名由上层 prop 传入。
export function Sidebar({ projects, productName }: SidebarProps) {
  const t = useTranslations('sidebar');
  const params = useSearchParams();
  const isGlobal = params.get('scope') === 'global';
  const activeProject = params.get('project') ?? (isGlobal ? null : (projects[0]?.path ?? null));
  const [addOpen, setAddOpen] = useState(false);

  return (
    <aside className="flex flex-col gap-4 overflow-hidden border-r border-line-strong bg-canvas-tint p-3">
      <div className="flex items-baseline px-1.5 font-serif text-[22px] font-semibold text-brand">
        <span className="mr-[7px] text-[17px] text-teal">⌇</span>
        {productName.slice(0, 2).toLowerCase()}
        <em className="italic text-terracotta">{productName.slice(2).toLowerCase()}</em>
      </div>

      <Link href="/?scope=global" className={scopeClass(isGlobal)}>
        <span className="flex shrink-0 text-teal">
          <GlobeIcon />
        </span>
        <span className="leading-tight">
          <b className="block text-[13.5px] font-semibold">{t('global')}</b>
          <small className="text-[11px] text-ink-faint">{t('globalSub')}</small>
        </span>
      </Link>

      <p className="-mb-1 px-1.5 text-[10px] font-bold uppercase tracking-[1.5px] text-ink-faint">{t('projects')}</p>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {projects.length === 0 && <p className="px-2.5 py-2 text-[12px] text-ink-faint">{t('empty')}</p>}
        {projects.map(project => (
          <Link
            key={project.path}
            href={`/?project=${encodeURIComponent(project.path)}`}
            className={projectClass(!isGlobal && activeProject === project.path)}
          >
            <span className="flex items-center gap-2.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${dotClass(!isGlobal && activeProject === project.path)}`}
              />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold">
                {project.name}
              </span>
              <span className="ml-auto text-[11px] text-ink-faint">{project.taskCount}</span>
            </span>
            {project.branch && (
              <span className="flex items-center gap-1.5 pl-[17px] font-mono text-[11px] text-ink-faint">
                <BranchIcon />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{project.branch}</span>
              </span>
            )}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mt-0.5 cursor-pointer rounded-[10px] border border-dashed border-line-strong px-2.5 py-2 text-left text-[13px] font-semibold text-ink-soft hover:border-ink-faint hover:text-ink"
        >
          {t('addProject')}
        </button>
      </div>
      {addOpen && <AddProjectDialog onClose={() => setAddOpen(false)} />}
    </aside>
  );
}

function scopeClass(active: boolean): string {
  const base = 'flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2.5 no-underline';
  return active
    ? `${base} border-line-strong bg-paper text-ink shadow-card`
    : `${base} border-transparent text-ink-soft hover:bg-paper-sunken`;
}

function projectClass(active: boolean): string {
  const base = 'flex flex-col gap-1 rounded-[10px] border px-2.5 py-2.5 no-underline';
  return active
    ? `${base} border-line-strong bg-paper text-ink shadow-card`
    : `${base} border-transparent text-ink-soft hover:bg-paper-sunken`;
}

function dotClass(active: boolean): string {
  return active ? 'bg-teal' : 'bg-ink-faint';
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.3" />
      <path d="M1.7 8h12.6M8 1.7c2.1 2.3 2.1 10.3 0 12.6M8 1.7c-2.1 2.3-2.1 10.3 0 12.6" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="4.5" r="1.5" />
      <path d="M4 5v6M12 6v1.5a3 3 0 0 1-3 3H4" />
    </svg>
  );
}
