'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { KnowledgeGraphView } from '@/types/knowledge';
import type { ForceGraphPalette, ForceGraphNode, ForceGraphLink } from './ForceGraphCanvas';

// react-force-graph 摸 window/canvas,必须 ssr:false 客户端动态导入(否则 SSR 阶段报错)。
const ForceGraphCanvas = dynamic(() => import('./ForceGraphCanvas'), { ssr: false });

interface KnowledgeGraphProps {
  project: string;
  onOpen: (relPath: string) => void;
}

// 从砚墨主题取画布用色(canvas 不认 var(),运行时解析成具体色值)
function readPalette(el: HTMLElement): ForceGraphPalette {
  const style = getComputedStyle(el);
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;

  return {
    node: read('--teal', '#3a8a86'),
    link: read('--line-strong', '#c9c2b6'),
    ink: read('--ink', '#2b2722'),
    paper: read('--paper', '#f4f1ea'),
  };
}

// 视图 → 力导向数据:仅文档节点 + link 边(source/missing/code 与 source/cover 边都不入图);
// 节点大小按 inDegree 压缩(sqrt,避免枢纽圈过大)。design.md:文档↔代码只活在查询层。
function toGraphData(view: KnowledgeGraphView): { nodes: ForceGraphNode[]; links: ForceGraphLink[] } {
  const docNodes = view.nodes.filter(node => node.kind !== 'source' && node.kind !== 'missing');
  const ids = new Set(docNodes.map(node => node.id));

  const nodes: ForceGraphNode[] = docNodes.map(node => ({
    id: node.id,
    label: node.label,
    relPath: node.relPath,
    val: 1 + Math.sqrt(node.inDegree ?? 0),
  }));

  const links: ForceGraphLink[] = view.edges
    .filter(edge => edge.kind === 'link' && ids.has(edge.source) && ids.has(edge.target))
    .map(edge => ({ source: edge.source, target: edge.target }));

  return { nodes, links };
}

// 整库关系图(项目 scope):力导向布局,相连/枢纽节点自然聚簇;点击节点打开对应文档。
export function KnowledgeGraph({ project, onOpen }: KnowledgeGraphProps) {
  const t = useTranslations('knowledge');
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<KnowledgeGraphView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [palette, setPalette] = useState<ForceGraphPalette | null>(null);

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

  // 跟随容器尺寸(画布需显式宽高);顺便解析一次主题色。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setPalette(readPalette(el));
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
        {palette && size.width > 0 && (
          <ForceGraphCanvas width={size.width} height={size.height} data={data} palette={palette} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
}
