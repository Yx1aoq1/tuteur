'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MarkdownEditor } from '@/appTemplates/Knowledge/components/MarkdownEditor';
import { AgentDetailModal } from './AgentDetailModal';
import type { AgentSummaryView } from '@/types/agents';

interface InjectionManagerProps {
  project: string;
  guideBody: string;
  agents: AgentSummaryView[];
}

type InnerTab = 'context' | 'agents';

// 注入管理页(取代旧 /p/context 空壳):内层左侧功能导航 + 右侧内容区。
// context 功能编辑 .withy/guide.md(复用知识库 MarkdownEditor,保存走 /api/guide);
// agents 功能管理子 agent 角色(canonical CRUD + 各工具投递态)— design §6。
export function InjectionManager({ project, guideBody, agents: initialAgents }: InjectionManagerProps) {
  const t = useTranslations('inject');
  const [tab, setTab] = useState<InnerTab>('context');

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-[230px] shrink-0 flex-col gap-1 border-r border-line-strong bg-canvas-tint p-3">
        <NavItem active={tab === 'context'} icon="⇲" label={t('context')} onClick={() => setTab('context')} />
        <NavItem active={tab === 'agents'} icon="❋" label={t('agents')} onClick={() => setTab('agents')} />
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tab === 'context' ? (
          <ContextPanel project={project} guideBody={guideBody} />
        ) : (
          <AgentsPanel project={project} initialAgents={initialAgents} />
        )}
      </div>
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const base = 'flex items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold cursor-pointer';
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft hover:bg-paper-sunken`}
    >
      <span className="text-[13px]">{icon}</span>
      {label}
    </button>
  );
}

// ── context 功能:编辑 .withy/guide.md ────────────────────────────────────────

function ContextPanel({ project, guideBody }: { project: string; guideBody: string }) {
  const t = useTranslations('inject');

  const saveGuide = useCallback(
    async (markdown: string): Promise<boolean> => {
      const res = await fetch(`/api/guide?project=${encodeURIComponent(project)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: markdown }),
      });
      const data = await res.json();
      return Boolean(data?.ok);
    },
    [project],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-paper">
      <p className="shrink-0 border-b border-line px-4 py-2.5 text-[12px] text-ink-faint">{t('contextHint')}</p>
      <MarkdownEditor
        file={{ relPath: 'guide.md', readonly: false, body: guideBody }}
        project={project}
        onSave={saveGuide}
      />
    </div>
  );
}

// ── agents 功能:角色 CRUD + 投递态 ──────────────────────────────────────────

const NEW_ROLE_BODY = `---\nname: ROLE\ndescription: One-line role summary.\n---\n\n# ROLE (subagent role)\n\nYou are a focused subagent. Start by reading the Active task's \`dispatch.json\` and \`design.md\`, then do the work and return a compact summary.\n`;

function AgentsPanel({ project, initialAgents }: { project: string; initialAgents: AgentSummaryView[] }) {
  const t = useTranslations('inject');
  const [agents, setAgents] = useState<AgentSummaryView[]>(initialAgents);
  const [openName, setOpenName] = useState<string | null>(null); // 当前打开详情弹窗的角色

  const refresh = useCallback(async (): Promise<AgentSummaryView[]> => {
    const res = await fetch(`/api/agents?project=${encodeURIComponent(project)}`);
    const data = await res.json();
    const list: AgentSummaryView[] = data?.agents ?? [];
    setAgents(list);
    return list;
  }, [project]);

  // 创建角色:成功返回 null 并打开编辑弹窗,失败返回错误文案(供卡片内联展示)。
  const createRole = useCallback(
    async (name: string): Promise<string | null> => {
      const res = await fetch(`/api/agents/${encodeURIComponent(name)}?project=${encodeURIComponent(project)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: NEW_ROLE_BODY.replaceAll('ROLE', name) }),
      });
      const data = await res.json();
      if (!data?.ok) return typeof data?.error === 'string' ? data.error : t('createFailed');
      await refresh();
      setOpenName(name);
      return null;
    },
    [project, refresh, t],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(195px,1fr))] gap-3">
        <NewRoleCard onCreate={createRole} />
        {agents.map(agent => (
          <AgentCard key={agent.name} agent={agent} onClick={() => setOpenName(agent.name)} />
        ))}
      </div>
      {agents.length === 0 && <p className="mt-3 text-[12px] text-ink-faint">{t('noRoles')}</p>}

      {openName && (
        <AgentDetailModal
          project={project}
          name={openName}
          onClose={() => setOpenName(null)}
          onSaved={refresh}
          onDeleted={() => {
            setOpenName(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

// 新建角色卡片:点击就地变输入框(Enter 提交 / Esc 或失焦空值取消),失败时行内显示错误。
// onCreate 成功返回 null(父层已打开编辑弹窗),失败返回错误文案。
function NewRoleCard({ onCreate }: { onCreate: (name: string) => Promise<string | null> }) {
  const t = useTranslations('inject');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setEditing(false);
    setValue('');
    setError(null);
  };

  const submit = async () => {
    const name = value.trim();
    if (!name || pending) return;
    setPending(true);
    const err = await onCreate(name);
    setPending(false);
    if (err) setError(err);
    else reset();
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-[132px] items-center justify-center rounded-[12px] border border-dashed border-line-strong text-[13px] font-semibold text-ink-soft transition duration-150 ease-out hover:-translate-y-0.5 hover:border-ink-faint hover:text-ink"
      >
        + {t('newRole')}
      </button>
    );
  }

  return (
    <div className="flex h-[132px] flex-col justify-center gap-1.5 rounded-[12px] border border-brand bg-paper p-3">
      <input
        autoFocus
        value={value}
        disabled={pending}
        placeholder={t('newRolePrompt')}
        onChange={event => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            reset();
          }
        }}
        onBlur={() => {
          if (!value.trim() && !pending) reset();
        }}
        className="w-full rounded-lg border border-line-strong bg-paper-sunken px-2.5 py-2 text-[12px] text-ink outline-none focus:border-brand"
      />
      {error && <span className="text-[11px] text-terracotta">{error}</span>}
    </div>
  );
}

// 角色工卡(横向):正面=左侧彩色条(挂绳+圆形像素头像)+ 右侧上方姓名、右下角平台圆标;
// 悬停 3D 翻转,背面=描述简介。点击仍打开编辑弹窗(翻转仅悬停预览,不拦截点击)。
function AgentCard({ agent, onClick }: { agent: AgentSummaryView; onClick: () => void }) {
  const t = useTranslations('inject');
  const { palette, cells } = roleVisual(agent.name);

  const face = 'absolute inset-0 flex overflow-hidden rounded-[14px] border border-line bg-paper shadow-card';
  const footer =
    'shrink-0 border-t border-line px-3 py-1 text-center text-[9px] font-bold tracking-[0.14em] text-ink-faint uppercase';

  return (
    <button type="button" onClick={onClick} className="group h-[132px] text-left [perspective:1200px]">
      <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
        {/* 正面:左彩色条 + 右白区,头像骑在两者交界处;正面=姓名 + 描述摘要 */}
        <div className={`${face} [backface-visibility:hidden]`}>
          <div className={`w-[64px] shrink-0 ${palette.solid}`} />
          <div className="relative flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 pr-3 pl-8">
            <span className="truncate text-[13.5px] font-semibold text-ink">{agent.name}</span>
            <span className="line-clamp-2 text-[11px] leading-snug text-ink-faint">
              {agent.description || t('noDescription')}
            </span>
            {agent.delivery.length > 0 && (
              <span className="absolute right-2.5 bottom-2.5 flex gap-1.5">
                {agent.delivery.map(d => (
                  <PlatformIcon key={d.platform} platform={d.platform} state={d.state} />
                ))}
              </span>
            )}
          </div>
          <span className="absolute top-1/2 left-[64px] z-10 flex h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full border-2 border-paper bg-paper shadow-card">
            <RoleAvatar cells={cells} palette={palette} cell="h-1 w-1" />
          </span>
        </div>

        {/* 背面:正文摘要预览 */}
        <div className={`${face} flex-col [transform:rotateY(180deg)] [backface-visibility:hidden]`}>
          <div className={`flex h-7 shrink-0 items-center px-3 ${palette.solid}`}>
            <span className="text-[10px] font-bold tracking-[0.14em] text-paper uppercase">{t('profile')}</span>
          </div>
          <div className="min-h-0 flex-1 px-3 py-2">
            <p className="line-clamp-3 text-[11px] leading-snug text-ink-soft">{agent.excerpt || t('noDescription')}</p>
          </div>
          <div className={footer}>{agent.name}</div>
        </div>
      </div>
    </button>
  );
}

// identicon 调色板:实色头部 / 软底 / 前景点阵色(均为既有语义 token,字面量以便 tree-shake)。
const AVATAR_PALETTES = [
  { solid: 'bg-teal', soft: 'bg-teal-bg', ink: 'text-teal' },
  { solid: 'bg-terracotta', soft: 'bg-terracotta-bg', ink: 'text-terracotta' },
  { solid: 'bg-mustard', soft: 'bg-mustard-bg', ink: 'text-mustard' },
  { solid: 'bg-blue', soft: 'bg-blue-bg', ink: 'text-blue' },
];

type AvatarPalette = (typeof AVATAR_PALETTES)[number];

// 角色名 → 32 位无符号哈希(确定性:同名同图同色)。
function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
  return h;
}

// 角色名 → 调色板 + 5×5 左右对称点阵(左半 3 列取哈希位,镜像到右半)。
function roleVisual(name: string): { palette: AvatarPalette; cells: boolean[] } {
  const hash = hashName(name);
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const mirrored = col < 3 ? col : 4 - col;
      cells.push(((hash >> (row * 3 + mirrored)) & 1) === 1);
    }
  }

  return { palette: AVATAR_PALETTES[hash % AVATAR_PALETTES.length], cells };
}

// 像素头像:渲染 roleVisual 给出的点阵,软底 + 前景点阵色。
function RoleAvatar({ cells, palette, cell }: { cells: boolean[]; palette: AvatarPalette; cell: string }) {
  return (
    <span aria-hidden className={`grid grid-cols-5 gap-px rounded-[6px] p-1 ${palette.soft} ${palette.ink}`}>
      {cells.map((on, i) => (
        <span key={i} className={`${cell} rounded-[1px] ${on ? 'bg-current' : 'bg-transparent'}`} />
      ))}
    </span>
  );
}

// 平台圆标的自绘几何字形(非官方商标复刻):Codex=终端提示符,Claude=光芒星,未知=首字母。
const PLATFORM_ICONS: Record<string, { circle: string; glyph: React.ReactNode }> = {
  codex: {
    circle: 'bg-ink text-paper',
    glyph: (
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 5l3 3-3 3" />
        <path d="M9 11h3" />
      </svg>
    ),
  },
  claude: {
    circle: 'bg-terracotta text-paper',
    glyph: (
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M8 2v12M2 8h12M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8" />
      </svg>
    ),
  },
};

// 平台圆标:右下角展示该角色投递到的工具,底色按平台,投递态用透明度区分(stale 偏淡、missing 最淡)。
function PlatformIcon({ platform, state }: { platform: string; state: string }) {
  const conf = PLATFORM_ICONS[platform] ?? {
    circle: 'bg-ink-faint text-paper',
    glyph: <span className="text-[9px] font-bold uppercase">{platform.slice(0, 1)}</span>,
  };
  const dim = state === 'missing' ? 'opacity-35' : state === 'stale' ? 'opacity-60' : '';

  return (
    <span
      title={`${platform} · ${state}`}
      className={`flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-paper ${conf.circle} ${dim}`}
    >
      {conf.glyph}
    </span>
  );
}
