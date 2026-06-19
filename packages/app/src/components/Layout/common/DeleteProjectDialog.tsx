'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface DeleteProjectDialogProps {
  name: string;
  active: boolean; // 是否当前正打开的项目;删后需离开其路由
  onClose: () => void;
}

// 删项目确认弹窗:可勾选「同时卸载 withy 文件」(走 withy uninstall)。
// 仅摘表时磁盘不动;卸载失败保留项目并展示 CLI 输出。成功后 router.refresh() 刷新侧栏,
// 删的是当前项目则跳回全局设置页避免停留在失效路由。
export function DeleteProjectDialog({ name, active, onClose }: DeleteProjectDialogProps) {
  const t = useTranslations('deleteProject');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uninstall, setUninstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    setLog(null);
    startTransition(async () => {
      const res = await fetch('/api/projects/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, uninstall }),
      });
      const data = await res.json();
      if (res.ok) {
        if (active) router.push('/settings');
        router.refresh();
        onClose();
        return;
      }
      setError(typeof data.code === 'number' ? t('uninstallFailed', { code: data.code }) : (data.error ?? 'error'));
      setLog([data.stdout, data.stderr].filter(Boolean).join('\n') || null);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,26,44,0.45)] p-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-[420px] max-w-full rounded-[14px] border border-line-strong bg-paper p-4 shadow-[0_24px_60px_-20px_rgba(20,26,44,0.6)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-[17px] font-semibold">{t('title')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-[26px] w-[26px] cursor-pointer rounded-lg border border-line-strong bg-paper-sunken text-[13px] text-ink-soft"
          >
            ×
          </button>
        </div>

        <p className="mb-3 text-[13px] leading-relaxed text-ink-soft">{t('body', { name })}</p>

        <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-line-strong bg-paper-sunken px-2.5 py-2">
          <input
            type="checkbox"
            checked={uninstall}
            onChange={e => setUninstall(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block text-[12px] font-semibold text-ink">{t('uninstallLabel')}</span>
            <span className="block text-[11px] text-ink-faint">{t('uninstallHint')}</span>
          </span>
        </label>

        {error && <p className="mb-2 text-[12px] font-semibold text-terracotta">{error}</p>}
        {log && (
          <pre className="mb-2 max-h-32 overflow-auto rounded-lg border border-line bg-paper-sunken p-2 font-mono text-[11px] whitespace-pre-wrap text-ink-soft">
            {log}
          </pre>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={ghostBtn}>
            {t('cancel')}
          </button>
          <button type="button" onClick={submit} disabled={pending} className={dangerBtn}>
            {pending ? t('deleting') : uninstall ? t('confirmUninstall') : t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

const ghostBtn =
  'cursor-pointer rounded-lg border border-line-strong bg-paper-sunken px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:text-ink disabled:opacity-50';
const dangerBtn =
  'cursor-pointer rounded-lg bg-terracotta px-3.5 py-2 text-[13px] font-semibold text-brand-ink disabled:opacity-50';
