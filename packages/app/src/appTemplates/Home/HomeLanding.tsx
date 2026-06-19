'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/EmptyState';
import { AddProjectDialog } from '@/components/Layout/common/AddProjectDialog';

// 无项目时的落地页:空态 + 加项目按钮(根布局无侧栏,onboarding 入口在此)。
export function HomeLanding() {
  const t = useTranslations('empty');
  const tSidebar = useTranslations('sidebar');
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <EmptyState title={t('unselectedTitle')} hint={t('unselectedHint')} />
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="cursor-pointer rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-ink"
        >
          {tSidebar('addProject')}
        </button>
      </div>
      {addOpen && <AddProjectDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}
