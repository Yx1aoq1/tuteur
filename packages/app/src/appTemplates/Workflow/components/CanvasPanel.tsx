'use client';

import { useTranslations } from 'next-intl';
import { NodeForm } from './NodeForm';
import { DRAG_MIME } from './model-constants';
import type { CanvasNode, CanvasSkill } from '@/types/dashboard';
import type { DragPayload } from './model';

interface CanvasPanelProps {
  skills: CanvasSkill[];
  agents: string[];
  selectedNode: CanvasNode | null;
  onChange: (next: CanvasNode) => void;
  onDelete: () => void;
  onBack: () => void;
}

// 右侧固定面板(宽度对齐看板详情):未选中=可拖入的节点列表(分支 + 各 skill);
// 选中=该节点的配置表单,顶部「← 返回」回到列表。
export function CanvasPanel({ skills, agents, selectedNode, onChange, onDelete, onBack }: CanvasPanelProps) {
  const t = useTranslations('canvas');

  return (
    <aside className="flex w-[336px] shrink-0 flex-col overflow-hidden border-l border-line-strong bg-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
      {selectedNode ? (
        <>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 border-b border-line px-4 py-3 text-left hover:bg-paper-sunken"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-soft">
              <BackIcon />
            </span>
            <span className="font-serif text-[15px] font-semibold">
              {selectedNode.type === 'switch' ? t('switch') : t('skillNode')}
            </span>
            <span className="truncate font-mono text-[11px] text-ink-faint">{selectedNode.id}</span>
          </button>
          <div className="flex-1 overflow-y-auto pt-3.5">
            <NodeForm node={selectedNode} agents={agents} onChange={onChange} onDelete={onDelete} />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2 px-4 pt-3.5 pb-1">
            <span className="font-serif text-[15px] font-semibold">{t('palette')}</span>
            <span className="text-[11px] text-ink-faint">{t('dragHint')}</span>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
            <DragItem payload={{ kind: 'switch' }} icon="◇" title={t('switch')} description={t('switchPaletteDesc')} />
            <div className="mt-1.5 mb-0.5 px-1 text-[10px] font-bold tracking-[1px] text-ink-faint uppercase">
              {t('skills')}
            </div>
            {skills.length === 0 && <p className="px-1 py-2 text-[12px] text-ink-faint">{t('noSkills')}</p>}
            {skills.map(skill => (
              <DragItem
                key={`${skill.source}:${skill.name}`}
                payload={{ kind: 'skill', name: skill.name }}
                icon="❋"
                title={skill.name}
                description={skill.description}
                tag={skill.source.slice(0, 4)}
              />
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

// 返回列表的图标(细描边折角箭头,放进圆形按钮里,比裸 ← 更克制)
function BackIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 3.5 5 8l4.5 4.5" />
    </svg>
  );
}

// 可拖入画布的列表项(分支节点 / skill)。拖拽载荷 = DRAG_MIME 上的 JSON payload。
function DragItem({
  payload,
  icon,
  title,
  description,
  tag,
}: {
  payload: DragPayload;
  icon: string;
  title: string;
  description?: string;
  tag?: string;
}) {
  return (
    <div
      draggable
      onDragStart={event => {
        event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
        event.dataTransfer.effectAllowed = 'copy';
      }}
      className="cursor-grab rounded-[10px] border border-line-strong bg-paper px-2.5 py-2 shadow-card active:cursor-grabbing"
      title={description}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-teal">{icon}</span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold text-ink">
          {title}
        </span>
        {tag && <span className="text-[10px] font-bold text-ink-faint uppercase">{tag}</span>}
      </div>
      {description && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-faint">{description}</p>}
    </div>
  );
}
