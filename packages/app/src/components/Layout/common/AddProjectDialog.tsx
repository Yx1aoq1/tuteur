'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface AddProjectDialogProps {
  onClose: () => void;
}

interface AgentChoice {
  id: string;
  name: string;
  defaultChecked: boolean;
}

type Stage = 'detect' | 'init';

// 加项目对话框:① 输入路径检测/登记;② 未初始化时弹 init 表单 → spawn withy init。
// 成功后 router.refresh() 刷新侧栏项目列表。
export function AddProjectDialog({ onClose }: AddProjectDialogProps) {
  const t = useTranslations('addProject');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [stage, setStage] = useState<Stage>('detect');
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [nameDirty, setNameDirty] = useState(false); // 用户手改过名称后,选路径不再覆盖
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentChoice[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [skills, setSkills] = useState<'link' | 'copy'>('link');
  const [user, setUser] = useState('');

  // 选/填路径后自动用末段目录名回填名称(用户未手改过才覆盖),可编辑。
  const applyPath = (next: string) => {
    setPath(next);
    if (!nameDirty) setName(baseName(next));
  };

  // 调起系统原生目录对话框回填路径;非 mac(501 unsupported)时提示手填。
  const pickDir = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/projects/pick', { method: 'POST' });
      const data = await res.json();
      if (res.status === 501) {
        setError(t('pickUnsupported'));
        return;
      }
      if (data.ok && data.path) applyPath(data.path);
    });
  };

  const detect = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data.error;
        setError(
          code === 'invalidPath'
            ? t('invalidPath')
            : code === 'nameTaken'
              ? t('nameTaken')
              : code === 'nameReserved'
                ? t('nameReserved')
                : code === 'nameRequired'
                  ? t('nameRequired')
                  : typeof code === 'string'
                    ? code
                    : 'error',
        );
        return;
      }
      if (data.status === 'needInit') {
        const choices: AgentChoice[] = (await (await fetch('/api/projects/init')).json()).agents;
        setAgents(choices);
        setSelected(new Set(choices.filter(c => c.defaultChecked).map(c => c.id)));
        setError(t('needInit'));
        setStage('init');
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const runInit = () => {
    if (selected.size === 0) {
      setError(t('selectAgent'));
      return;
    }
    setError(null);
    setLog(null);
    startTransition(async () => {
      const res = await fetch('/api/projects/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, name, agents: [...selected], skills, user }),
      });
      const data = await res.json();
      if (res.ok) {
        router.refresh();
        onClose();
        return;
      }
      if (res.status === 409 && (data.error === 'nameTaken' || data.error === 'nameReserved')) {
        setError(data.error === 'nameReserved' ? t('nameReserved') : t('nameTaken'));
        setStage('detect'); // 回到第一步改名
        return;
      }
      setError(typeof data.code === 'number' ? t('initFailed', { code: data.code }) : (data.error ?? 'init failed'));
      setLog([data.stdout, data.stderr].filter(Boolean).join('\n') || null);
    });
  };

  const toggleAgent = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          <h3 className="font-serif text-[17px] font-semibold">{stage === 'init' ? t('initTitle') : t('title')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-[26px] w-[26px] cursor-pointer rounded-lg border border-line-strong bg-paper-sunken text-[13px] text-ink-soft"
          >
            ×
          </button>
        </div>

        <label className="mb-1 block text-[12px] font-semibold text-ink-soft">{t('nameLabel')}</label>
        <input
          value={name}
          onChange={e => {
            setName(e.target.value);
            setNameDirty(true);
          }}
          placeholder={t('namePlaceholder')}
          className="mb-3 w-full rounded-lg border border-line-strong bg-paper-sunken px-2.5 py-2 text-[12px] text-ink outline-none focus:border-brand"
        />

        <label className="mb-1 block text-[12px] font-semibold text-ink-soft">{t('pathLabel')}</label>
        <div className="mb-3 flex gap-2">
          <input
            value={path}
            onChange={e => applyPath(e.target.value)}
            placeholder={t('pathPlaceholder')}
            disabled={stage === 'init'}
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-paper-sunken px-2.5 py-2 font-mono text-[12px] text-ink outline-none focus:border-brand disabled:opacity-60"
          />
          <button
            type="button"
            onClick={pickDir}
            disabled={pending || stage === 'init'}
            className="shrink-0 cursor-pointer rounded-lg border border-line-strong bg-paper-sunken px-2.5 py-2 text-[12px] font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
          >
            {t('pick')}
          </button>
        </div>

        {stage === 'init' && (
          <div className="mb-3 flex flex-col gap-3 border-t border-line pt-3">
            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-ink-soft">{t('agents')}</div>
              <div className="flex flex-wrap gap-2">
                {agents.map(agent => (
                  <label
                    key={agent.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                      selected.has(agent.id)
                        ? 'border-brand bg-brand text-brand-ink'
                        : 'border-line-strong text-ink-soft'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(agent.id)}
                      onChange={() => toggleAgent(agent.id)}
                      className="hidden"
                    />
                    {agent.name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[12px] font-semibold text-ink-soft">{t('skills')}</div>
              <span className="inline-flex overflow-hidden rounded-full border border-line-strong">
                <button type="button" onClick={() => setSkills('link')} className={segClass(skills === 'link')}>
                  {t('skillLink')}
                </button>
                <button type="button" onClick={() => setSkills('copy')} className={segClass(skills === 'copy')}>
                  {t('skillCopy')}
                </button>
              </span>
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-semibold text-ink-soft">{t('user')}</label>
              <input
                value={user}
                onChange={e => setUser(e.target.value)}
                placeholder={t('userPlaceholder')}
                className="w-full rounded-lg border border-line-strong bg-paper-sunken px-2.5 py-2 text-[12px] text-ink outline-none focus:border-brand"
              />
            </div>
          </div>
        )}

        {error && <p className="mb-2 text-[12px] font-semibold text-terracotta">{error}</p>}
        {log && (
          <pre className="mb-2 max-h-32 overflow-auto rounded-lg border border-line bg-paper-sunken p-2 font-mono text-[11px] text-ink-soft whitespace-pre-wrap">
            {log}
          </pre>
        )}

        <div className="flex justify-end gap-2">
          {stage === 'detect' ? (
            <button
              type="button"
              disabled={pending || !path.trim() || !name.trim()}
              onClick={detect}
              className={primaryBtn}
            >
              {pending ? t('detecting') : t('detect')}
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={runInit} className={primaryBtn}>
              {pending ? t('running') : t('runInit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const primaryBtn =
  'cursor-pointer rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-brand-ink disabled:opacity-50';

// 取路径末段目录名作为项目名建议(去尾斜杠,兼容 win 反斜杠)。
function baseName(path: string): string {
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] ?? '';
}

function segClass(active: boolean): string {
  const base = 'cursor-pointer px-2.5 py-1 text-[12px] font-semibold';
  return active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft`;
}
