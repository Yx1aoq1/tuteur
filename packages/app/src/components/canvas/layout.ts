import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { CanvasNode, CanvasWorkflow } from '@/types/dashboard';

// workflow(纯数据图)→ React Flow 节点/边的确定性自动布局。
// 只有三个固定阶段容器(规划/执行/收尾)左→右并排;**所有**节点按其阶段落入对应容器,
// 容器内按 wf.nodes 出现序自上而下堆叠;无阶段/未知阶段的节点归入第一个容器(无独立前置泳道)。
// 连线全由 next/branches 推导:同阶段内走纵向、跨阶段走横向,无自由连线。

const NODE_W = 208;
const SKILL_H = 76;
export const SWITCH_HEAD = 44; // switch 头部(标题+id,去掉分支行)的高度;节点卡与分支出口定位共用
export const BRANCH_ROW = 20; // switch 每条分支占的行高;节点卡与分支出口定位共用
const GROUP_HEADER = 44; // 容器内首个节点的顶部留白(含标题)
const GROUP_PAD_X = 16;
const GROUP_PAD_BOTTOM = 16;
const GROUP_MIN_H = 130; // 空阶段容器的最小高度
const GAP_Y = 20; // 容器内节点纵向间距
const GAP_X = 64; // 容器之间横向间距
const LANE_X = 24; // 首容器的左起点

// 节点占位高度(switch 随分支条数增高,保证容器布局不重叠)
function nodeHeight(node: CanvasNode): number {
  return node.type === 'switch' ? Math.max(64, SWITCH_HEAD + node.branches.length * BRANCH_ROW) : SKILL_H;
}

// 节点的展示阶段:数据里声明且有效则用之,否则归入第一个阶段(只有三个固定容器,无前置泳道)。
function displayPhaseId(wf: CanvasWorkflow, node: CanvasNode): string {
  if (node.phase != null && wf.phases.some(phase => phase.id === node.phase)) return node.phase;
  return wf.phases[0]?.id ?? '';
}

// 节点展示阶段在 phases 中的序号(>=0);用于连线方向(同阶段纵向、跨阶段横向)。
function phaseIndex(wf: CanvasWorkflow, nodeId: string): number {
  const node = wf.nodes.find(n => n.id === nodeId);
  if (!node) return 0;
  return wf.phases.findIndex(phase => phase.id === displayPhaseId(wf, node));
}

export interface PhaseGroupData {
  kind: 'phase';
  phaseId: string;
  label: string;
  empty: boolean;
}

export interface FlowNodeData {
  kind: 'skill' | 'switch';
  node: CanvasNode;
  entry: boolean; // 是否 workflow 入口节点
  [key: string]: unknown;
}

export interface LaidOutGraph {
  nodes: Node[];
  edges: Edge[];
  // 各阶段容器在画布坐标系的包围盒,供拖入时判定落到哪个阶段
  groupBounds: { phaseId: string; x: number; y: number; w: number; h: number }[];
}

/**
 * 把 workflow 编译成 React Flow 的节点与边(含坐标)。纯函数,无副作用。
 * @param wf 待渲染的 workflow
 * @param selectedId 当前选中节点 id(高亮),无则 null
 * @return React Flow nodes/edges + 阶段容器包围盒
 */
export function layoutWorkflow(wf: CanvasWorkflow, selectedId: string | null): LaidOutGraph {
  const nodes: Node[] = [];
  const groupBounds: LaidOutGraph['groupBounds'] = [];
  const groupWidth = NODE_W + GROUP_PAD_X * 2;

  // 三阶段容器左→右并排;每个节点按展示阶段落入对应容器,容器内自上而下堆叠。
  wf.phases.forEach((phase, gi) => {
    const children = wf.nodes.filter(node => displayPhaseId(wf, node) === phase.id);
    const x = LANE_X + gi * (groupWidth + GAP_X);

    let cursorY = GROUP_HEADER;
    for (const node of children) {
      nodes.push(flowNode(node, wf, selectedId, { x: GROUP_PAD_X, y: cursorY }, `phase:${phase.id}`));
      cursorY += nodeHeight(node) + GAP_Y;
    }

    const height = children.length ? cursorY - GAP_Y + GROUP_PAD_BOTTOM : GROUP_MIN_H;

    groupBounds.push({ phaseId: phase.id, x, y: 24, w: groupWidth, h: height });
    nodes.unshift({
      id: `phase:${phase.id}`,
      type: 'phase',
      position: { x, y: 24 },
      data: {
        kind: 'phase',
        phaseId: phase.id,
        label: phase.label,
        empty: children.length === 0,
      } satisfies PhaseGroupData,
      draggable: false,
      selectable: false,
      style: { width: groupWidth, height },
      zIndex: 0,
    });
  });

  return { nodes, edges: buildEdges(wf), groupBounds };
}

function flowNode(
  node: CanvasNode,
  wf: CanvasWorkflow,
  selectedId: string | null,
  position: { x: number; y: number },
  parentId?: string,
): Node {
  return {
    id: node.id,
    type: node.type,
    position,
    data: { kind: node.type, node, entry: node.id === wf.entry } satisfies FlowNodeData,
    parentId,
    extent: parentId ? 'parent' : undefined,
    draggable: false,
    selected: node.id === selectedId,
    zIndex: 1,
  };
}

// next/branches → 边。出口:skill 同阶段走下方、跨阶段走右侧;switch 各分支走右侧。
// 入口:同阶段从上方进、跨阶段从左侧进。统一用正交 smoothstep,减少叠线。
function buildEdges(wf: CanvasWorkflow): Edge[] {
  const edges: Edge[] = [];

  const add = (
    source: string,
    target: string,
    sourceHandle: string,
    horizontal: boolean,
    branch?: { label: string; isDefault: boolean },
  ): void => {
    edges.push({
      id: branch ? `${source}:${branch.label}->${target}` : `${source}->${target}`,
      source,
      target,
      sourceHandle,
      targetHandle: horizontal ? 't-left' : 't-top',
      type: 'smoothstep',
      label: branch?.label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: branch && !branch.isDefault ? { strokeDasharray: '5 4' } : undefined,
      className: branch && !branch.isDefault ? 'tt-edge-branch' : 'tt-edge',
    });
  };

  for (const node of wf.nodes) {
    if (node.type === 'switch') {
      node.branches.forEach((b, i) => {
        if (!b.next) return;
        const horizontal = phaseIndex(wf, b.next) > phaseIndex(wf, node.id);
        add(node.id, b.next, `b:${i}`, horizontal, { label: b.label, isDefault: Boolean(b.default) });
      });
    } else if (node.next) {
      const horizontal = phaseIndex(wf, node.next) > phaseIndex(wf, node.id);
      add(node.id, node.next, horizontal ? 's-right' : 's-bottom', horizontal);
    }
  }

  return edges;
}
