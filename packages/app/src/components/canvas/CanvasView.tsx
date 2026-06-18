'use client';

import '@xyflow/react/dist/style.css';
import './canvas.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { Connection, Edge } from '@xyflow/react';
import { nodeTypes } from './nodes';
import { HEADER_H, nodeHeight, layoutWorkflow } from './layout';
import { CanvasPanel } from './CanvasPanel';
import { DRAG_MIME } from './model-constants';
import {
  addNode,
  moveNode,
  removeNode,
  replaceNode,
  newSkillNode,
  newSwitchNode,
  setEdgeTarget,
  sanitizeWorkflow,
} from './model';
import type { FlowNodeData, LaidOutGraph } from './layout';
import type { DragPayload } from './model';
import type { CanvasData, CanvasNode, CanvasWorkflow } from '@/types/dashboard';
import type { Node } from '@xyflow/react';

interface CanvasViewProps {
  data: CanvasData;
  project: string;
}

// 一条 workflow 校验结果(对齐 core WorkflowIssue;保存接口回传)
interface IssueView {
  level: 'error' | 'warning';
  node?: string;
  message: string;
}

// 画布视图入口:Provider 包裹,内层用 useReactFlow 做拖入坐标换算。
export function CanvasView(props: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ data, project }: CanvasViewProps) {
  const t = useTranslations('canvas');
  const router = useRouter();
  const [workflow, setWorkflow] = useState<CanvasWorkflow>(data.workflow);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<IssueView[]>([]);
  const { screenToFlowPosition } = useReactFlow();

  const layout: LaidOutGraph = useMemo(() => layoutWorkflow(workflow, selectedId), [workflow, selectedId]);
  const selectedNode = useMemo(() => workflow.nodes.find(n => n.id === selectedId) ?? null, [workflow, selectedId]);

  // React Flow 受控:节点/边由 layout 推导,workflow 或选中变化即整体重灌(布局确定性,不留手动位移)。
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(layout.nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    setRfNodes(layout.nodes);
    setRfEdges(layout.edges);
  }, [layout, setRfNodes, setRfEdges]);

  const edit = useCallback((next: CanvasWorkflow): void => {
    setWorkflow(next);
    setDirty(true);
    setIssues([]);
  }, []);

  // 节点中心 y 命中的横向泳道 phase;落在带间间隔/上下溢出则取最近的一条带(无 placement 校验)
  const phaseAtY = useCallback(
    (y: number): string | null => {
      const bounds = layout.laneBounds;
      if (bounds.length === 0) return null;
      const hit = bounds.find(b => y >= b.y0 && y < b.y1);
      if (hit) return hit.phaseId;
      let best = bounds[0];
      let bestDist = Infinity;
      for (const b of bounds) {
        const dist = y < b.y0 ? b.y0 - y : y - b.y1;
        if (dist < bestDist) {
          bestDist = dist;
          best = b;
        }
      }
      return best.phaseId;
    },
    [layout.laneBounds],
  );

  // 从右栏拖入:skill → 新 skill 节点;switch → 新 switch 节点;落点 y 定阶段、落点存为 pos
  const onDrop = useCallback(
    (event: React.DragEvent): void => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      let payload: DragPayload;
      try {
        payload = JSON.parse(raw) as DragPayload;
      } catch {
        return;
      }
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const phaseId = phaseAtY(point.y);
      if (!phaseId) return;
      const laneTop = layout.laneBounds.find(b => b.phaseId === phaseId)?.y0 ?? 0;
      const pos = { x: point.x, y: Math.max(HEADER_H, point.y - laneTop) };
      const node =
        payload.kind === 'switch'
          ? newSwitchNode(workflow, phaseId, pos)
          : newSkillNode(workflow, payload.name, phaseId, pos);
      edit(addNode(workflow, node));
      setSelectedId(node.id);
    },
    [screenToFlowPosition, phaseAtY, layout.laneBounds, workflow, edit],
  );

  const onDragOver = useCallback((event: React.DragEvent): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  // 拖动节点结束:按节点中心 y 命中横带写回 phase,并把 pos 存成「带内相对坐标」(吸附进带内)
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node): void => {
      if (node.type !== 'skill' && node.type !== 'switch') return;
      const cn = (node.data as FlowNodeData).node;
      const cy = node.position.y + (node.measured?.height ?? nodeHeight(cn)) / 2;
      const phaseId = phaseAtY(cy);
      if (!phaseId) return;
      const laneTop = layout.laneBounds.find(b => b.phaseId === phaseId)?.y0 ?? 0;
      const pos = { x: node.position.x, y: Math.max(HEADER_H, node.position.y - laneTop) };
      edit(moveNode(workflow, node.id, pos, phaseId));
    },
    [workflow, edit, phaseAtY, layout.laneBounds],
  );

  // 连线 → 回写出口目标(skill.next / switch 分支 next)
  const onConnect = useCallback(
    (conn: Connection): void => {
      if (!conn.source || !conn.target) return;
      edit(setEdgeTarget(workflow, conn.source, conn.sourceHandle, conn.target));
    },
    [workflow, edit],
  );

  // 拖动已有连线端点到新目标 → 改写该出口目标
  const onReconnect = useCallback(
    (oldEdge: Edge, conn: Connection): void => {
      if (!conn.target) return;
      edit(setEdgeTarget(workflow, oldEdge.source, oldEdge.sourceHandle ?? conn.sourceHandle, conn.target));
    },
    [workflow, edit],
  );

  // 删除连线 → 清空对应出口目标
  const onEdgesDelete = useCallback(
    (deleted: Edge[]): void => {
      let next = workflow;
      for (const e of deleted) next = setEdgeTarget(next, e.source, e.sourceHandle, null);
      edit(next);
    },
    [workflow, edit],
  );

  const changeNode = useCallback(
    (next: CanvasNode): void => edit(replaceNode(workflow, next.id, next)),
    [workflow, edit],
  );

  const deleteNode = useCallback((): void => {
    if (!selectedId) return;
    edit(removeNode(workflow, selectedId));
    setSelectedId(null);
  }, [selectedId, workflow, edit]);

  const save = useCallback(async (): Promise<void> => {
    setSaving(true);
    // 落盘前清理空产物/空检查行;成功后用清理结果回灌草稿,UI 与已存一致。
    const clean = sanitizeWorkflow(workflow);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(clean.id)}?project=${encodeURIComponent(project)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean),
      });
      const body = (await res.json()) as { ok: boolean; issues?: IssueView[]; error?: string };
      if (res.ok) {
        setWorkflow(clean);
        setDirty(false);
        setIssues(body.issues ?? []); // 仅 warning(skill/模板悬空)
        router.refresh();
      } else {
        setIssues(body.issues ?? [{ level: 'error', message: body.error ?? 'save failed' }]);
      }
    } catch {
      setIssues([{ level: 'error', message: t('saveFailed') }]);
    } finally {
      setSaving(false);
    }
  }, [workflow, project, router, t]);

  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="font-serif text-[15px] font-semibold">{workflow.name ?? workflow.id}</span>
          {workflow.version && <span className="font-mono text-[11px] text-ink-faint">v{workflow.version}</span>}
          {dirty && <span className="text-[11px] font-semibold text-mustard">● {t('unsaved')}</span>}
          {!dirty && issues.length === 0 && <span className="text-[11px] text-ink-faint">{t('synced')}</span>}

          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="ml-auto cursor-pointer rounded-full bg-brand px-4 py-1.5 text-[13px] font-semibold text-brand-ink disabled:opacity-40"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>

        {issues.length > 0 && (
          <div className="flex flex-col gap-1 border-b border-line px-4 py-2">
            {errors.map((issue, i) => (
              <p key={`e${i}`} className="text-[12px] text-terracotta">
                ✗ {issue.node ? `[${issue.node}] ` : ''}
                {issue.message}
              </p>
            ))}
            {warnings.map((issue, i) => (
              <p key={`w${i}`} className="text-[12px] text-mustard">
                ⚠ {issue.node ? `[${issue.node}] ` : ''}
                {issue.message}
              </p>
            ))}
          </div>
        )}

        <div className="relative min-h-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            nodesDraggable
            nodesConnectable
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.3}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              if (node.type === 'skill' || node.type === 'switch') setSelectedId(node.id);
            }}
            onPaneClick={() => setSelectedId(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="var(--line-strong)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      <CanvasPanel
        skills={data.skills}
        selectedNode={selectedNode}
        onChange={changeNode}
        onDelete={deleteNode}
        onBack={() => setSelectedId(null)}
      />
    </div>
  );
}
