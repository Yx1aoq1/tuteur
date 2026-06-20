'use client';

import { useTranslations } from 'next-intl';
import { PHASE_META } from './phase';
import type { BoardCard } from '@/types/dashboard';

interface TaskCardProps {
  card: BoardCard;
  selected: boolean;
  onSelect: () => void;
}

export function TaskCard({ card, selected, onSelect }: TaskCardProps) {
  const t = useTranslations('taskCard');
  const tPhase = useTranslations('phase');
  const meta = card.phase ? PHASE_META[card.phase] : null;
  const isDone = card.column === 'done';
  const { done, total } = card.implementation;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // 已完成卡片始终使用 teal;其余卡片按卡住状态或阶段取强调色。
  const accent = isDone
    ? { strip: 'bg-teal', border: 'border-teal', ring: 'ring-teal' }
    : card.stuck
      ? { strip: 'bg-terracotta', border: 'border-terracotta', ring: 'ring-terracotta' }
      : (meta ?? { strip: 'bg-line', border: 'border-line', ring: 'ring-line' });

  return (
    <article
      onClick={onSelect}
      className={`relative cursor-pointer overflow-hidden rounded-xl border bg-paper p-3 shadow-card transition-transform hover:-translate-y-0.5 ${
        isDone || selected ? accent.border : 'border-line'
      } ${selected ? `ring-1 ${accent.ring}` : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${accent.strip}`} />

      <div className="mb-2 flex items-center justify-between">
        {meta ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-bold ${meta.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {tPhase(card.phase!)}
          </span>
        ) : isDone ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-bg px-2.5 py-[3px] text-[11px] font-bold text-teal">
            {t('done')}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-ink-faint">{t('notStarted')}</span>
        )}
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-brand-ink">
          {card.owner.slice(0, 1)}
        </span>
      </div>

      <h4 className="mb-2 font-serif text-[16px] font-semibold leading-tight">{card.title}</h4>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {card.node && (
          <span className="text-[12px] text-ink-soft">
            {t('node')} <b className="text-ink">{card.node}</b>
          </span>
        )}
        {card.stuck && <Badge tone="fail">{t('stuck')}</Badge>}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-line bg-paper-sunken">
          <span className={`block h-full ${card.stuck ? 'bg-terracotta' : 'bg-teal'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="whitespace-nowrap text-[11px] font-semibold text-ink-soft">
          {done}/{total}
        </span>
      </div>

      {card.stuck && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-dashed border-terracotta/40 pt-2 text-[11px] font-bold text-terracotta">
          {t('stuckFooter')}
        </div>
      )}
    </article>
  );
}

function Badge({ tone, children }: { tone: 'ok' | 'fail' | 'warn'; children: React.ReactNode }) {
  const map = {
    ok: 'text-teal bg-teal-bg',
    fail: 'text-terracotta bg-terracotta-bg',
    warn: 'text-mustard bg-mustard-bg',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}
