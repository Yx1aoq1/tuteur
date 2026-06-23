'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import ForceGraphSvg, { type ForceGraphNode, type ForceGraphLink } from './ForceGraphSvg';
import type { KnowledgeGraphView } from '@/types/knowledge';

interface KnowledgeGraphProps {
  project: string;
  onOpen: (relPath: string) => void;
}

// 视图 → 力导向数据:仅文档节点 + link 边(source/missing 节点与 source 边都不入图);
// degree=入度(定半径/枢纽),group=kind(定配色)。design.md:文档↔代码只活在查询层。
function toGraphData(view: KnowledgeGraphView): { nodes: ForceGraphNode[]; links: ForceGraphLink[] } {
  const docNodes = view.nodes.filter(node => node.kind !== 'source' && node.kind !== 'missing');
  const ids = new Set(docNodes.map(node => node.id));

  const nodes: ForceGraphNode[] = docNodes.map(node => ({
    id: node.id,
    label: node.label,
    relPath: node.relPath,
    group: node.kind ?? 'other',
    degree: node.inDegree ?? 0,
  }));

  const links: ForceGraphLink[] = view.edges
    .filter(edge => edge.kind === 'link' && ids.has(edge.source) && ids.has(edge.target))
    .map(edge => ({ source: edge.source, target: edge.target }));

  return { nodes, links };
}

// 整库关系图(项目 scope):d3 SVG 力导向,相连/枢纽节点自然聚簇;点击节点打开对应文档。
export function KnowledgeGraph({ project, onOpen }: KnowledgeGraphProps) {
  const t = useTranslations('knowledge');
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<KnowledgeGraphView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

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

  // 跟随容器尺寸(SVG 需显式宽高 + force center)。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => (view ? toGraphData(view) : { nodes: [], links: [] }), [view]);

  if (error) {
    return <div className="flex flex-1 items-center justify-center text-[13px] text-terracotta">{error}</div>;
  }
  if (view && data.nodes.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-[13px] text-ink-faint">{t('graphEmpty')}</div>;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-paper">
      <div className="shrink-0 border-b border-line px-4 py-2 text-[12px] text-ink-faint">{t('graphHint')}</div>
      <div ref={containerRef} className="min-h-0 flex-1">
        {size.width > 0 && <ForceGraphSvg width={size.width} height={size.height} data={data} onOpen={onOpen} />}
      </div>
    </div>
  );
}
