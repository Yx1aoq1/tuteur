import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { CanvasNode, CanvasWorkflow } from '@/types/dashboard';

// workflow(纯数据图)→ React Flow 节点/边。自由画布 + 横向软泳道(web §3.3):
// 三条横带(按 phase 划分,带名取 phase.label,缺省回退 phase id)按 phases 顺序自上而下平铺为背景,**按内容自动长高**、首尾相接无缝隙。
// 节点的 pos 是「带内相对坐标」(x 自由、y 相对所在带顶);全局 y = 带顶 + max(HEADER_H, pos.y),
// 故节点恒在所属带内、不出带也不夹缝。phase 是权威字段(拖停时按命中带写回,CanvasView);缺省/未知归第一条带。

export const NODE_W = 208;
const SKILL_H = 76;
export const SWITCH_HEAD = 44; // switch 头部(标题+id)高度;节点卡与分支出口定位共用
export const BRANCH_ROW = 20; // switch 每条分支占的行高;节点卡与分支出口定位共用
export const HEADER_H = 34; // 每条泳道顶部留白(放阶段标题,节点从此线之下排)
const MIN_BAND_H = 180; // 单条泳道最小高度(空带/少节点时兜底)
const PAD_BOTTOM = 26; // 泳道在最低节点之下的留白
const GAP_Y = 22; // 泳道之间的纵向间隔(视觉留白)
const AUTO_X0 = 48; // 自动堆叠起始 x(带内相对)
const AUTO_GAP_X = 56; // 自动堆叠节点横向间距
const AUTO_Y = HEADER_H + 12; // 自动堆叠的带内相对 y
const LANE_MIN_W = 640; // 泳道最小宽度(空带兜底;宽度主要跟随内容,避免尾部大片空)
const LANE_PAD_X = 96; // 泳道在最右节点之外的留白

// 节点占位高度(switch 随分支条数增高);供带高计算与拖停命中估算
export function nodeHeight(node: CanvasNode): number {
  return node.type === 'switch' ? Math.max(64, SWITCH_HEAD + node.branches.length * BRANCH_ROW) : SKILL_H;
}

// 节点的展示阶段:声明且有效则用之,否则归入第一条带(无分诊列,web §3.3)。
function displayPhaseId(wf: CanvasWorkflow, node: CanvasNode): string {
  if (node.phase != null && wf.phases.some(phase => phase.id === node.phase)) return node.phase;
  return wf.phases[0]?.id ?? '';
}

export interface PhaseGroupData {
  kind: 'phase';
  phaseId: string;
  label: string;
  [key: string]: unknown;
}

export interface FlowNodeData {
  kind: 'skill' | 'switch';
  node: CanvasNode;
  entry: boolean; // 是否 workflow 入口节点
  terminal: boolean; // 是否终点(skill 且 next===null)
  [key: string]: unknown;
}

// 一条泳道在画布坐标系的纵向区间(拖停 / 拖入按节点中心 y 命中阶段)
export interface LaneBound {
  phaseId: string;
  y0: number;
  y1: number;
}

export interface LaidOutGraph {
  nodes: Node[];
  edges: Edge[];
  laneBounds: LaneBound[];
}

/**
 * 把 workflow 编译成 React Flow 的节点与边(含坐标)。纯函数,无副作用。
 * 泳道按所属节点内容自动长高、自上而下平铺;节点 pos 为带内相对坐标。
 * @param wf 待渲染的 workflow
 * @param selectedId 当前选中节点 id(高亮),无则 null
 * @return React Flow nodes/edges + 横向泳道纵向区间
 */
export function layoutWorkflow(wf: CanvasWorkflow, selectedId: string | null): LaidOutGraph {
  // 每个节点的展示阶段与全局位置(全局 y = 带顶 + max(HEADER_H, 相对 y))。
  const positions = new Map<string, { x: number; y: number }>();
  const laneBounds: LaneBound[] = [];

  let laneTop = 0;
  let maxRight = 0;
  let minLeft = 0;

  for (const phase of wf.phases) {
    const children = wf.nodes.filter(node => displayPhaseId(wf, node) === phase.id);
    let autoK = 0;
    let bottom = laneTop + MIN_BAND_H; // 带高下限

    for (const node of children) {
      const relX = node.pos ? node.pos.x : AUTO_X0 + autoK * (NODE_W + AUTO_GAP_X);
      const relY = node.pos ? Math.max(HEADER_H, node.pos.y) : AUTO_Y;
      if (!node.pos) autoK += 1;

      const x = relX;
      const y = laneTop + relY;
      positions.set(node.id, { x, y });
      bottom = Math.max(bottom, y + nodeHeight(node) + PAD_BOTTOM);
      maxRight = Math.max(maxRight, x + NODE_W);
      minLeft = Math.min(minLeft, x);
    }

    laneBounds.push({ phaseId: phase.id, y0: laneTop, y1: bottom });
    laneTop = bottom + GAP_Y; // 带间留间隔
  }

  const laneX = minLeft - LANE_PAD_X;
  const laneW = Math.max(LANE_MIN_W, maxRight + LANE_PAD_X - laneX);

  const nodes: Node[] = [];

  // 泳道背景节点(不可拖动/选中、不拦指针,zIndex 垫底)
  for (const b of laneBounds) {
    const phase = wf.phases.find(p => p.id === b.phaseId);
    nodes.push({
      id: `phase:${b.phaseId}`,
      type: 'phase',
      position: { x: laneX, y: b.y0 },
      data: { kind: 'phase', phaseId: b.phaseId, label: phase?.label ?? b.phaseId } satisfies PhaseGroupData,
      draggable: false,
      selectable: false,
      style: { width: laneW, height: b.y1 - b.y0 },
      zIndex: 0,
    });
  }

  // 业务节点(可拖动,zIndex 高于泳道)
  for (const node of wf.nodes) {
    const position = positions.get(node.id) ?? { x: AUTO_X0, y: HEADER_H };
    nodes.push({
      id: node.id,
      type: node.type,
      position,
      data: {
        kind: node.type,
        node,
        entry: node.id === wf.entry,
        terminal: node.type === 'skill' && node.next === null,
      } satisfies FlowNodeData,
      selected: node.id === selectedId,
      zIndex: 10,
    });
  }

  return { nodes, edges: buildEdges(wf), laneBounds };
}

// next/branches → 贝塞尔边(统一实线样式;分支靠 label 区分,不再实线/虚线混用)。
// skill 单出口(s-out),switch 每分支一个出口(b:<i>);统一进 t-in。zIndex 高于泳道背景。
function buildEdges(wf: CanvasWorkflow): Edge[] {
  const edges: Edge[] = [];

  const add = (source: string, target: string, sourceHandle: string, label?: string): void => {
    edges.push({
      id: label ? `${source}:${label}->${target}` : `${source}->${target}`,
      source,
      target,
      sourceHandle,
      targetHandle: 't-in',
      type: 'default', // 贝塞尔自由走线
      label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      className: 'tt-edge',
      zIndex: 5,
    });
  };

  for (const node of wf.nodes) {
    if (node.type === 'switch') {
      node.branches.forEach((b, i) => {
        if (b.next) add(node.id, b.next, `b:${i}`, b.label);
      });
    } else if (node.next) {
      add(node.id, node.next, 's-out');
    }
  }

  return edges;
}
