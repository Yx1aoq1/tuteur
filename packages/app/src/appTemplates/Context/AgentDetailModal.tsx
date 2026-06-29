'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MarkdownEditor } from '@/appTemplates/Knowledge/components/MarkdownEditor';
import type { AgentDetailView } from '@/types/agents';

interface AgentDetailModalProps {
  project: string;
  name: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

// 子 agent 角色详情弹窗:遮罩交互镜像看板 TaskDocsModal(Esc / 点背景 / ✕ 关闭),
// 主体嵌可保存的 MarkdownEditor(自动保存)+ 删除按钮。按 name 拉 canonical 正文。
export function AgentDetailModal({ project, name, onClose, onSaved, onDeleted }: AgentDetailModalProps) {
  const t = useTranslations('inject');
  const [detail, setDetail] = useState<AgentDetailView | null>(null);
  const [failed, setFailed] = useState(false); // 取正文失败态(在异步回调里置态,不在 effect 体同步置)
  const [confirming, setConfirming] = useState(false); // 删除二次确认行内态

  // Esc 关闭
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 按 name 拉详情(所有 setState 落在异步回调里)。
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agents/${encodeURIComponent(name)}?project=${encodeURIComponent(project)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok && data.agent) setDetail(data.agent);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [project, name]);

  const saveRole = useCallback(
    async (markdown: string): Promise<boolean> => {
      const res = await fetch(`/api/agents/${encodeURIComponent(name)}?project=${encodeURIComponent(project)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: markdown }),
      });
      const data = await res.json();
      if (data?.ok) onSaved();
      return Boolean(data?.ok);
    },
    [project, name, onSaved],
  );

  const deleteRole = useCallback(async (): Promise<void> => {
    await fetch(`/api/agents/${encodeURIComponent(name)}?project=${encodeURIComponent(project)}`, { method: 'DELETE' });
    onDeleted();
  }, [project, name, onDeleted]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ink)_45%,transparent)] p-6"
    >
      <div
        onClick={event => event.stopPropagation()}
        className="flex h-[min(82vh,720px)] w-[min(860px,92vw)] flex-col overflow-hidden rounded-lg2 border border-line-strong bg-paper shadow-card"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line-strong px-4 py-2.5">
          <span className="font-serif text-[15px] font-semibold text-ink">{name}</span>
          <div className="flex items-center gap-2">
            {confirming ? (
              <>
                <span className="text-[12px] text-ink-soft">{t('deleteConfirm')}</span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-[8px] border border-line-strong px-2.5 py-1 text-[12px] font-semibold text-ink-soft hover:text-ink"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={deleteRole}
                  className="rounded-[8px] border border-terracotta bg-terracotta px-2.5 py-1 text-[12px] font-semibold text-paper hover:opacity-90"
                >
                  {t('confirmDelete')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-[8px] border border-terracotta px-2.5 py-1 text-[12px] font-semibold text-terracotta hover:bg-terracotta-bg"
              >
                {t('deleteRole')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="cursor-pointer rounded-md px-2 py-0.5 text-[16px] leading-none text-ink-soft hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-paper">
          {failed ? (
            <div className="m-auto p-8 text-center text-[13px] text-ink-faint">{t('loadFailed')}</div>
          ) : detail ? (
            <MarkdownEditor
              key={name}
              file={{ relPath: `${name}.md`, readonly: false, body: detail.body }}
              project={project}
              onSave={saveRole}
            />
          ) : (
            <div className="m-auto p-8 text-center text-[13px] text-ink-faint">…</div>
          )}
        </div>
      </div>
    </div>
  );
}
