'use client';

import { useEffect, useRef } from 'react';
import { forceSimulation, forceManyBody, forceCenter, forceCollide, forceLink, forceX, forceY } from 'd3-force';
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import { select } from 'd3-selection';
import { zoom } from 'd3-zoom';
import { drag } from 'd3-drag';
import './force-graph.css';

// 力导向节点:degree 决半径/是否枢纽,group 决配色,relPath 可点开
export interface ForceGraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  group: string;
  degree: number;
  relPath?: string;
}

export interface ForceGraphLink extends SimulationLinkDatum<ForceGraphNode> {
  source: string | ForceGraphNode;
  target: string | ForceGraphNode;
}

interface ForceGraphSvgProps {
  width: number;
  height: number;
  data: { nodes: ForceGraphNode[]; links: ForceGraphLink[] };
  onOpen: (relPath: string) => void;
}

// kind → 砚墨主题分组(配色在 force-graph.css 里按 group class 取 var(--teal/terracotta/sage))
function sanitizeGroup(kind: string): string {
  if (kind === 'concept' || kind === 'spec' || kind === 'overview' || kind === 'design') return 'concept';
  if (kind === 'entity' || kind === 'comparison' || kind === 'rules') return 'entity';
  if (kind === 'summary' || kind === 'template' || kind === 'guides') return 'summary';
  return 'other';
}

const linkId = (end: string | ForceGraphNode): string => (typeof end === 'string' ? end : end.id);

const radius = (node: ForceGraphNode): number => 6 + Math.sqrt(node.degree) * 2.6;

// 关系图渲染(移植 lewislulu/llm-wiki-skill web/client/graph.ts):d3 SVG 力导向,
// 永动 ambient 呼吸 + 曲线弧连线 + 高斯光晕 + 交错入场 + hover 高亮邻居(连线流光)。
// 配色与 chrome 走 force-graph.css 的砚墨 var(--*),不在 JS 里解析色值。
export default function ForceGraphSvg({ width, height, data, onOpen }: ForceGraphSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width === 0 || height === 0) return;

    const svg = select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // 高斯模糊 filter:节点光晕用
    svg
      .append('defs')
      .append('filter')
      .attr('id', 'kg-node-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%')
      .append('feGaussianBlur')
      .attr('stdDeviation', 2);

    const root = svg.append('g').attr('class', 'graph-root');
    const linkLayer = root.append('g').attr('class', 'links');
    const nodeLayer = root.append('g').attr('class', 'nodes');

    // 拷贝数据(d3 会原地写 x/y/vx/vy,不污染 props)
    const nodes: ForceGraphNode[] = data.nodes.map(node => ({ ...node }));
    const links: ForceGraphLink[] = data.links.map(link => ({ ...link }));

    // 初始播种在中心小环,入场向外铺开
    for (const node of nodes) {
      const angle = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 30;
      node.x = width / 2 + Math.cos(angle) * r;
      node.y = height / 2 + Math.sin(angle) * r;
    }

    // 邻接表:hover 高亮邻居用
    const adjacency = new Map<string, Set<string>>();
    for (const node of nodes) adjacency.set(node.id, new Set());
    for (const link of data.links) {
      const s = linkId(link.source);
      const t = linkId(link.target);
      adjacency.get(s)?.add(t);
      adjacency.get(t)?.add(s);
    }

    const sim: Simulation<ForceGraphNode, ForceGraphLink> = forceSimulation<ForceGraphNode>(nodes)
      .force(
        'link',
        forceLink<ForceGraphNode, ForceGraphLink>(links)
          .id(d => d.id)
          .distance(170)
          .strength(0.22),
      )
      .force('charge', forceManyBody<ForceGraphNode>().strength(-650).distanceMax(900))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'collision',
        forceCollide<ForceGraphNode>()
          .radius(d => radius(d) + 14)
          .strength(0.9),
      )
      .force('x', forceX<ForceGraphNode>(width / 2).strength(0.02))
      .force('y', forceY<ForceGraphNode>(height / 2).strength(0.02))
      .alphaDecay(0.005)
      .velocityDecay(0.28)
      .alphaTarget(0.015);

    // 永动 ambient:每 tick 给非拖拽节点加微小随机速度,velocityDecay 把它收成有界轻颤(整图呼吸)
    sim.force('noise', () => {
      for (const node of nodes) {
        if (node.fx != null) continue;
        node.vx = (node.vx ?? 0) + (Math.random() - 0.5) * 0.09;
        node.vy = (node.vy ?? 0) + (Math.random() - 0.5) * 0.09;
      }
    });

    const linkSel = linkLayer
      .selectAll<SVGPathElement, ForceGraphLink>('path')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link');

    const nodeSel = nodeLayer
      .selectAll<SVGGElement, ForceGraphNode>('g.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', d => `node group-${sanitizeGroup(d.group)}${d.degree >= 5 ? ' big' : ''}`);

    // 内层 g 承载交错入场动画(外层 g 由 d3 写 translate,不能再叠 CSS transform)
    const nodeInner = nodeSel
      .append('g')
      .attr('class', 'node-inner')
      .style('animation-delay', (_d, i) => `${Math.min(900, i * 18)}ms`);

    nodeInner
      .append('circle')
      .attr('class', 'node-halo')
      .attr('r', d => radius(d) * 1.3)
      .attr('filter', 'url(#kg-node-glow)');

    nodeInner
      .append('circle')
      .attr('class', 'node-main')
      .attr('r', d => radius(d));

    nodeInner
      .append('text')
      .attr('dy', d => -radius(d) - 8)
      .attr('text-anchor', 'middle')
      .text(d => d.label);

    // 拖拽:固定节点位置,期间略升温,松手回 ambient
    const dragBehavior = drag<SVGGElement, ForceGraphNode>()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.15).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0.015);
        d.fx = null;
        d.fy = null;
      });
    nodeSel.call(dragBehavior);

    // 缩放/平移:filter 排除落在节点上的手势,保证拖点不连带平移画布
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .filter(event => !(event.target as Element)?.closest?.('.node'))
      .on('zoom', event => {
        root.attr('transform', event.transform.toString());
      });
    svg.call(zoomBehavior);

    // hover:高亮该节点 + 邻居 + 相连边,淡化其余
    nodeSel
      .on('mouseenter', (_event, d) => {
        const neighbors = adjacency.get(d.id) ?? new Set<string>();
        nodeSel.classed('dim', n => n.id !== d.id && !neighbors.has(n.id));
        nodeSel.classed('highlight', n => n.id === d.id || neighbors.has(n.id));
        linkSel.classed('dim', l => linkId(l.source) !== d.id && linkId(l.target) !== d.id);
        linkSel.classed('highlight', l => linkId(l.source) === d.id || linkId(l.target) === d.id);
      })
      .on('mouseleave', () => {
        nodeSel.classed('dim', false).classed('highlight', false);
        linkSel.classed('dim', false).classed('highlight', false);
      })
      .on('click', (_event, d) => {
        if (d.relPath) onOpen(d.relPath);
      });

    sim.on('tick', () => {
      linkSel.attr('d', d => {
        const s = d.source as ForceGraphNode;
        const t = d.target as ForceGraphNode;
        if (s.x == null || s.y == null || t.x == null || t.y == null) return '';
        const dist = Math.hypot(t.x - s.x, t.y - s.y);
        const dr = Math.max(dist * 1.8, 1);
        return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${t.x},${t.y}`;
      });
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => {
      sim.stop();
      svg.selectAll('*').remove();
    };
  }, [data, width, height, onOpen]);

  return <svg ref={svgRef} className="knowledge-graph-svg" width={width} height={height} />;
}
