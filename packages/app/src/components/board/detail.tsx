'use client';

import { useTranslations } from 'next-intl';
import { PHASE_ORDER } from './phase';
import type { Phase } from '@/types/dashboard';

// 详情面板的共享展示子件(活跃 ViewDetail 与归档 ArchivedDetail 共用):带标题的分层块 + 主体阶段步进器。
// 纯展示、无写操作、无 core 依赖。

// 带小标题的分层容器
export function Layer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-bold text-ink-faint">{label}</div>
      {children}
    </div>
  );
}

// 主体阶段步进器:已过=✓(teal)、当前=●(mustard)、未到=○(中性);current 为 null 时全部视作未到。
// completed=true(任务已完成):三阶段都走完 → 全绿,不把终点节点所在阶段误标为「进行中」。
export function PhaseStepper({ current, completed = false }: { current: Phase | null; completed?: boolean }) {
  const tPhase = useTranslations('phase');
  const currentIdx = completed ? PHASE_ORDER.length : current ? PHASE_ORDER.indexOf(current) : -1;

  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((phase, i) => {
        const state = currentIdx < 0 ? 'todo' : i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo';
        return (
          <div key={phase} className="flex items-center gap-1">
            {i > 0 && <span className="h-px w-3 bg-line-strong" />}
            <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${stepTextClass(state)}`}>
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] ${stepMarkClass(state)}`}
              >
                {state === 'done' ? '✓' : state === 'active' ? '●' : '○'}
              </span>
              {tPhase(phase)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function stepTextClass(state: 'done' | 'active' | 'todo'): string {
  if (state === 'done') return 'text-teal';
  if (state === 'active') return 'text-mustard';
  return 'text-ink-soft';
}

function stepMarkClass(state: 'done' | 'active' | 'todo'): string {
  if (state === 'done') return 'bg-teal border-teal text-brand-ink border-[1.5px]';
  if (state === 'active') return 'bg-mustard border-mustard text-brand-ink border-[1.5px]';
  return 'bg-paper-sunken border-line-strong text-ink-faint border-[1.5px]';
}
