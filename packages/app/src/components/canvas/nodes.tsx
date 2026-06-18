'use client';

import { Handle, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { artifactPathOf } from './model';
import { BRANCH_ROW, SWITCH_HEAD } from './layout';
import type { FlowNodeData, PhaseGroupData } from './layout';
import type { CanvasSkillNode, CanvasSwitchNode } from '@/types/dashboard';

// 画布自定义节点:横向泳道带(phase,背景)+ skill 卡 + switch 卡。
// 自由画布:节点可拖动、pos 落盘;连线左入(t-in)右出(skill 's-out' / switch 'b:<i>')。
// 阶段由所在横带在拖停时写回(CanvasView)。编辑走右侧面板。

// 阶段配色:暖色调,每条泳道一色(规划金 / 执行陶土 / 收尾橄榄),虚线包围 + 半透明底(不挡连线)
const PHASE_TOKEN: Record<string, string> = {
  planning: '--mustard',
  execute: '--terracotta',
  finish: '--sage',
};

// 入口连接点(左):接收上一步的连线
function TargetHandle() {
  return <Handle type="target" position={Position.Left} id="t-in" className="tt-handle tt-handle-in" />;
}

// 阶段泳道:横向背景带(全宽全高由 layout 的 style 给),不拦指针、不可拖/选。
// 虚线包围 + 半透明暖色底(底色透明故不遮连线);带间留间隔,边界一眼可辨。
export function PhaseNode({ data }: { data: PhaseGroupData }) {
  const token = PHASE_TOKEN[data.phaseId] ?? '--ink-soft';

  return (
    <div
      className="pointer-events-none h-full w-full rounded-card"
      style={{
        pointerEvents: 'none',
        background: `color-mix(in srgb, var(${token}) 11%, transparent)`,
        border: `1.5px dashed color-mix(in srgb, var(${token}) 50%, transparent)`,
      }}
    >
      <span
        className="absolute left-3 top-1.5 font-serif text-[13px] font-semibold"
        style={{ color: `color-mix(in srgb, var(${token}) 82%, var(--ink))` }}
      >
        {data.label}
      </span>
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
      <TargetHandle />
      <div className="flex items-center gap-1.5">
        <span className="text-teal">❋</span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-semibold text-ink">
          {node.skill}
        </span>
        {data.entry && <span className={badgeClass('blue')}>{t('entry')}</span>}
        {data.terminal && <span className={badgeClass('teal')}>{t('terminal')}</span>}
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
      {/* 单出口(右):写 node.next */}
      <Handle type="source" position={Position.Right} id="s-out" className="tt-handle tt-handle-out" />
    </div>
  );
}

export function SwitchNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const t = useTranslations('canvas');
  const node = data.node as CanvasSwitchNode;

  return (
    <div className={cardClass(selected)} style={{ minHeight: SWITCH_HEAD + node.branches.length * BRANCH_ROW }}>
      <TargetHandle />
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
