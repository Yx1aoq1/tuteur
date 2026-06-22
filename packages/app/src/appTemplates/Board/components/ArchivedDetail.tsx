'use client';

import { useTranslations } from 'next-intl';
import { TaskDetailBody } from './detail';
import { ARCHIVED_STATUS_META, formatArchivedDate } from './archived';
import type { ArchivedCard } from '@/types/dashboard';

interface ArchivedDetailProps {
  card: ArchivedCard;
  project: string;
}

// 归档任务详情:复用 TaskDetailBody 渲染主体(与活跃同构),标题下注入终态徽章、末尾注入生命周期时间。
// 进度/时间线/产物经 core 的归档回退按 id 读出;本面板无写操作(节点恒 ✓ 绿,无卡住态、无归档按钮)。
export function ArchivedDetail({ card, project }: ArchivedDetailProps) {
  const t = useTranslations('archived');
  const meta = ARCHIVED_STATUS_META[card.finalStatus];

  const header = (
    <span
      className={`mb-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-bold ${meta.pill}`}
    >
      {meta.icon} {t(`status.${card.finalStatus}`)}
    </span>
  );

  const footer = (
    <div className="mt-1 border-t border-dashed border-line pt-3 text-[11px] text-ink-faint">
      <p suppressHydrationWarning>{t('createdAt', { date: formatArchivedDate(card.createdAt) })}</p>
      {card.completedAt && (
        <p suppressHydrationWarning className="mt-1">
          {t('completedAt', { date: formatArchivedDate(card.completedAt) })}
        </p>
      )}
      <p suppressHydrationWarning className="mt-1">
        {t('archivedAt', { date: formatArchivedDate(card.archivedAt) })}
      </p>
      <p className="mt-1">{t('ownerLine', { owner: card.owner })}</p>
    </div>
  );

  return (
    <TaskDetailBody
      panelTitle={t('detailTitle')}
      taskId={card.id}
      project={project}
      title={card.title}
      phase={card.phase}
      completed={card.finalStatus === 'completed'}
      node={card.node}
      stuck={false}
      implementation={card.implementation}
      timeline={card.timeline}
      header={header}
      footer={footer}
    />
  );
}
