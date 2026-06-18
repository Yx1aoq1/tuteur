import { BRANCH_HANDLE_PREFIX } from './model-constants';
import type {
  CanvasPos,
  CanvasNode,
  CanvasArtifact,
  CanvasSkillNode,
  CanvasSwitchNode,
  CanvasWorkflow,
} from '@/types/dashboard';

// 画布编辑的纯逻辑:节点增删改、连线回写、引用清理。无 React/DOM 依赖,便于推理与复用。

// 右侧列表拖入画布的载荷:技能(带逻辑名)或 switch 特殊节点
export type DragPayload = { kind: 'skill'; name: string } | { kind: 'switch' };

// 门禁产物规格 → 它实际校验的路径(裸字符串或 { path } 对象)
export function artifactPathOf(spec: CanvasArtifact): string {
  return typeof spec === 'string' ? spec : spec.path;
}

// 解析连接点 id → 分支序号(非分支出口返回 null)
export function branchIndexOf(handle: string | null | undefined): number | null {
  if (!handle || !handle.startsWith(BRANCH_HANDLE_PREFIX)) return null;
  const index = Number(handle.slice(BRANCH_HANDLE_PREFIX.length));
  return Number.isInteger(index) ? index : null;
}

// 把任意名字规整为节点 id 片段(小写、非字母数字转连字符)
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'node'
  );
}

// 基于 base 生成 workflow 内唯一的节点 id(冲突则追加 -2、-3…)
export function uniqueNodeId(wf: CanvasWorkflow, base: string): string {
  const slug = slugify(base);
  const taken = new Set(wf.nodes.map(node => node.id));
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

// 在指定阶段新建一个 skill 节点(next 暂空,待用户连线到下一步;pos=拖入落点)
export function newSkillNode(wf: CanvasWorkflow, skillName: string, phaseId: string, pos?: CanvasPos): CanvasSkillNode {
  return { id: uniqueNodeId(wf, skillName), type: 'skill', skill: skillName, phase: phaseId, pos, next: null };
}

// 在指定阶段新建一个 switch 节点(含一条默认分支,出口待连线;pos=拖入落点)
export function newSwitchNode(wf: CanvasWorkflow, phaseId: string, pos?: CanvasPos): CanvasSwitchNode {
  return {
    id: uniqueNodeId(wf, 'switch'),
    type: 'switch',
    phase: phaseId,
    pos,
    branches: [{ label: 'default', next: null, default: true }],
  };
}

// 拖停后落盘:更新节点画布坐标 pos,并把阶段写成所在横带的 phase(无 placement 校验,web §3.3)
export function moveNode(wf: CanvasWorkflow, id: string, pos: CanvasPos, phaseId: string): CanvasWorkflow {
  const node = wf.nodes.find(n => n.id === id);
  if (!node) return wf;

  return replaceNode(wf, id, { ...node, pos, phase: phaseId });
}

// 替换某节点(保持其余不变)
export function replaceNode(wf: CanvasWorkflow, id: string, next: CanvasNode): CanvasWorkflow {
  return { ...wf, nodes: wf.nodes.map(node => (node.id === id ? next : node)) };
}

// 追加节点
export function addNode(wf: CanvasWorkflow, node: CanvasNode): CanvasWorkflow {
  return { ...wf, nodes: [...wf.nodes, node] };
}

/**
 * 连线 → 回写出口目标。skill 出口写 next;switch 出口(handle=`b:i`)写对应 branch.next。
 * 自连或未知出口忽略(返回原图)。target=null 用于断开。
 */
export function setEdgeTarget(
  wf: CanvasWorkflow,
  sourceId: string,
  sourceHandle: string | null | undefined,
  targetId: string | null,
): CanvasWorkflow {
  if (sourceId === targetId) return wf;
  const node = wf.nodes.find(n => n.id === sourceId);
  if (!node) return wf;

  if (node.type === 'skill') return replaceNode(wf, sourceId, { ...node, next: targetId });

  const index = branchIndexOf(sourceHandle);
  if (index == null || index >= node.branches.length) return wf;
  return replaceNode(wf, sourceId, {
    ...node,
    branches: node.branches.map((branch, i) => (i === index ? { ...branch, next: targetId } : branch)),
  });
}

/**
 * 删除节点并清理悬空引用:指向它的 next/branch.next 一律置空,保证图仍可被 core 校验通过。
 * 若删的是入口节点,入口顺延到剩余第一个节点(无剩余则保持原值,交由保存校验报错)。
 */
export function removeNode(wf: CanvasWorkflow, id: string): CanvasWorkflow {
  const nodes = wf.nodes
    .filter(node => node.id !== id)
    .map(node =>
      node.type === 'switch'
        ? { ...node, branches: node.branches.map(b => (b.next === id ? { ...b, next: null } : b)) }
        : node.next === id
          ? { ...node, next: null }
          : node,
    );
  const entry = wf.entry === id ? (nodes[0]?.id ?? wf.entry) : wf.entry;
  return { ...wf, nodes, entry };
}

/**
 * 保存前清理:丢弃 skill 门禁里的空产物/空检查命令(编辑期允许的空行),全空 gate 整体去掉。
 * 编辑期保留空行是为了让「+ 新增」即时出现一行可输入;落盘前在此统一收口,避免写入空白项。
 */
export function sanitizeWorkflow(wf: CanvasWorkflow): CanvasWorkflow {
  const nodes = wf.nodes.map(node => {
    if (node.type !== 'skill' || !node.gate) return node;

    const artifacts = (node.gate.artifacts ?? [])
      .map(spec => (typeof spec === 'string' ? spec.trim() : { ...spec, path: spec.path.trim() }))
      .filter(spec => artifactPathOf(spec).length > 0);
    const checks = (node.gate.checks ?? []).map(check => check.trim()).filter(Boolean);

    const gate: typeof node.gate = {};
    if (artifacts.length) gate.artifacts = artifacts;
    if (checks.length) gate.checks = checks;
    if (node.gate.approval) gate.approval = true;

    return { ...node, gate: Object.keys(gate).length ? gate : undefined };
  });

  return { ...wf, nodes };
}
