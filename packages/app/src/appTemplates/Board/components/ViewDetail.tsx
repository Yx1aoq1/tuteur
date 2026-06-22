'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TaskDetailBody } from './detail';
import type { BoardCard } from '@/types/dashboard';

interface ViewDetailProps {
  card: BoardCard;
  project: string;
}

// 活跃任务详情:复用 TaskDetailBody 渲染主体(阶段/节点/实施/时间线/产物),仅在末尾注入归档按钮。
// 归档为写操作 —— 仅「已完成」任务可归档,写后 router.refresh + SSE 回灌。常驻不可关闭。
export function ViewDetail({ card, project }: ViewDetailProps) {
  const t = useTranslations('viewDetail');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const canArchive = card.column === 'done';
  const query = `?project=${encodeURIComponent(project)}`;

  const archive = () => {
    startTransition(async () => {
      await fetch(`/api/tasks/${encodeURIComponent(card.id)}/archive${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // 仅完成任务可归档,默认不改状态
      });
      setConfirmArchive(false);
      router.refresh();
    });
  };

  const footer = canArchive ? (
    confirmArchive ? (
      <div className="rounded-[10px] border border-line-strong bg-paper p-3">
        <p className="mb-2.5 text-[12px] text-ink-soft">{t('archiveDoneConfirm')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={archive}
            className="cursor-pointer rounded-lg bg-terracotta px-3 py-1.5 text-[12px] font-semibold text-brand-ink disabled:opacity-50"
          >
            {pending ? t('archiving') : t('archive')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmArchive(false)}
            className="cursor-pointer rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink-soft"
          >
            {tCommon('cancel')}
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setConfirmArchive(true)}
        className="cursor-pointer rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink"
      >
        {t('archive')}
      </button>
    )
  ) : undefined;

  return (
    <TaskDetailBody
      panelTitle={t('title')}
      taskId={card.id}
      project={project}
      title={card.title}
      phase={card.phase}
      completed={card.column === 'done'}
      node={card.node}
      stuck={card.stuck}
      implementation={card.implementation}
      timeline={card.timeline}
      footer={footer}
    />
  );
}
