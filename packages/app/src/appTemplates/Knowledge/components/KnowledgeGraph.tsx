'use client';

import '@xyflow/react/dist/style.css';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import type { KnowledgeGraphView } from '@/types/knowledge';

interface KnowledgeGraphProps {
  project: string;
  onOpen: (relPath: string) => void;
}

const COL_GAP = 220;
const ROW_GAP = 110;

// 确定性网格布局:按 id 排序后铺成近似正方网格(小规模知识库够用,不引布局引擎)。
function layout(view: KnowledgeGraphView): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...view.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));

  const nodes: Node[] = sorted.map((node, index) => {
    const tone =
      node.kind === 'missing'
        ? { border: 'var(--terracotta)', color: 'var(--terracotta)' }
        : node.kind === 'source'
          ? { border: 'var(--line-strong)', color: 'var(--ink-faint)' }
          : { border: 'var(--teal)', color: 'var(--ink)' };

    return {
      id: node.id,
      position: { x: (index % cols) * COL_GAP, y: Math.floor(index / cols) * ROW_GAP },
      data: { label: node.label, relPath: node.relPath },
      style: {
        background: 'var(--paper)',
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        color: tone.color,
        fontSize: 12,
        padding: '6px 10px',
        width: 160,
      },
    };
  });

  const edges: Edge[] = view.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    style: { stroke: edge.broken ? 'var(--terracotta)' : 'var(--line-strong)', strokeWidth: edge.broken ? 2 : 1 },
    animated: edge.broken,
  }));

  return { nodes, edges };
}

// 整库关系图(项目 scope):进入时取最新数据;broken 边标红;点击节点切回文档并打开对应页。
function GraphInner({ project, onOpen }: KnowledgeGraphProps) {
  const t = useTranslations('knowledge');
  const [view, setView] = useState<KnowledgeGraphView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/knowledge/graph?project=${encodeURIComponent(project)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok) setView(data.graph);
        else setError(data?.error ?? t('loadFailed'));
      })
      .catch(() => !cancelled && setError(t('loadFailed')));

    return () => {
      cancelled = true;
    };
  }, [project, t]);

  const flow = useMemo(() => (view ? layout(view) : { nodes: [], edges: [] }), [view]);

  if (error) {
    return <div className="flex flex-1 items-center justify-center text-[13px] text-terracotta">{error}</div>;
  }
  if (view && view.nodes.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-[13px] text-ink-faint">{t('graphEmpty')}</div>;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-paper">
      <div className="shrink-0 border-b border-line px-4 py-2 text-[12px] text-ink-faint">{t('graphHint')}</div>
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_event, node) => {
            const relPath = (node.data as { relPath?: string }).relPath;
            if (relPath) onOpen(relPath);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

export function KnowledgeGraph(props: KnowledgeGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
