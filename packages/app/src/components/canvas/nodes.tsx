'use client';

import { Handle, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { artifactPathOf } from './model';
import { BRANCH_ROW, SWITCH_HEAD } from './layout';
import type { FlowNodeData, PhaseGroupData } from './layout';
import type { CanvasSkillNode, CanvasSwitchNode } from '@/types/dashboard';

// 画布自定义节点:三阶段容器(phase)+ skill 卡 + switch 卡。
// 节点不可拖拽(布局由 next/branches 推导),但出口可连线:左/上=入口,右=出口。
// skill 单出口(handle 's');switch 每条分支一个出口(handle 'b:<i>',按行对齐)。编辑走右侧面板。

const PHASE_TONE: Record<string, string> = {
  planning: 'text-blue',
  execute: 'text-mustard',
  finish: 'text-teal',
};

// 入口连接点(左 + 上):接收上一步/上一阶段的连线
function TargetHandles() {
  return (
    <>
      <Handle type="target" position={Position.Top} id="t-top" className="tt-handle tt-handle-in" />
      <Handle type="target" position={Position.Left} id="t-left" className="tt-handle tt-handle-in" />
    </>
  );
}

// 阶段容器:固定不可删/改名,作为 skill/switch 节点的父框(React Flow Sub Flow)
export function PhaseNode({ data }: { data: PhaseGroupData }) {
  const t = useTranslations('canvas');
  const tone = PHASE_TONE[data.phaseId] ?? 'text-ink-soft';

  return (
    <div className="h-full w-full rounded-card border border-dashed border-line-strong bg-[color-mix(in_srgb,var(--paper)_30%,transparent)]">
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <span className={`font-serif text-[14px] font-semibold ${tone}`}>{data.label}</span>
        {data.empty && <span className="text-[11px] text-ink-faint">· {t('dropHere')}</span>}
      </div>
    </div>
  );
}

export function SkillNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const t = useTranslations('canvas');
  const node = data.node as CanvasSkillNode;
  const gate = node.gate;
  const artifacts = gate?.artifacts ?? [];
  const checks = gate?.checks ?? [];

  return (
    <div className={cardClass(selected)}>
      <TargetHandles />
      <div className="flex items-center gap-1.5">
        <span className="text-teal">❋</span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold text-ink">
          {node.skill}
        </span>
        {data.entry && <span className={badgeClass('blue')}>{t('entry')}</span>}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-ink-faint">{node.id}</div>
      {(artifacts.length > 0 || checks.length > 0 || gate?.approval) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {artifacts.length > 0 && (
            <span className={badgeClass('terracotta')} title={artifacts.map(artifactPathOf).join(', ')}>
              ▤ {artifacts.length}
            </span>
          )}
          {checks.length > 0 && (
            <span className={badgeClass('teal')} title={checks.join(', ')}>
              ✓ {checks.length}
            </span>
          )}
          {gate?.approval && <span className={badgeClass('mustard')}>⚑ {t('approval')}</span>}
        </div>
      )}
      {/* 出口:下(同阶段顺序→下一步)+ 右(跨阶段→下一步),二者都写 node.next */}
      <Handle type="source" position={Position.Bottom} id="s-bottom" className="tt-handle tt-handle-out" />
      <Handle type="source" position={Position.Right} id="s-right" className="tt-handle tt-handle-out" />
    </div>
  );
}

export function SwitchNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const t = useTranslations('canvas');
  const node = data.node as CanvasSwitchNode;

  return (
    <div className={cardClass(selected)} style={{ minHeight: SWITCH_HEAD + node.branches.length * BRANCH_ROW }}>
      <TargetHandles />
      <div className="flex items-center gap-1.5">
        <span className="text-blue">◇</span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold text-ink">
          {t('switch')}
        </span>
        {data.entry && <span className={badgeClass('blue')}>{t('entry')}</span>}
      </div>
      <div className="mb-1 truncate font-mono text-[11px] text-ink-faint">{node.id}</div>
      {/* 每条分支一行,右侧各一个出口连接点(handle 'b:<i>') */}
      {node.branches.map((branch, i) => (
        <div key={i} className="flex h-5 items-center gap-1.5 text-[11.5px]">
          <span className={branch.default ? 'text-teal' : 'text-ink-faint'}>{branch.default ? '●' : '○'}</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-ink-soft">{branch.label}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={`b:${i}`}
            style={{ top: SWITCH_HEAD + i * BRANCH_ROW + BRANCH_ROW / 2 }}
            className="tt-handle tt-handle-out"
          />
        </div>
      ))}
    </div>
  );
}

function cardClass(selected?: boolean): string {
  const base = 'relative w-[208px] rounded-card border bg-paper px-3 py-2.5 shadow-card transition-colors';
  return selected ? `${base} border-teal ring-2 ring-teal` : `${base} border-line-strong hover:border-ink-faint`;
}

function badgeClass(tone: 'teal' | 'terracotta' | 'mustard' | 'blue'): string {
  const map = {
    teal: 'text-teal bg-teal-bg',
    terracotta: 'text-terracotta bg-terracotta-bg',
    mustard: 'text-mustard bg-mustard-bg',
    blue: 'text-blue bg-blue-bg',
  } as const;
  return `inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-bold ${map[tone]}`;
}

export const nodeTypes = {
  phase: PhaseNode as never,
  skill: SkillNode as never,
  switch: SwitchNode as never,
};
