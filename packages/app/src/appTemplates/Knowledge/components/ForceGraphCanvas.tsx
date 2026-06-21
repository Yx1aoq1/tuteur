'use client';

import { useEffect, useRef } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';

// 力导向节点:val 决定圆面积(按入度压缩),relPath 可点开
export interface ForceGraphNode {
  id: string;
  label: string;
  val: number;
  relPath?: string;
}

export interface ForceGraphLink {
  source: string;
  target: string;
}

// 画布用色(canvas 不认 var(),由上层解析成具体色值)
export interface ForceGraphPalette {
  node: string;
  link: string;
  ink: string;
  paper: string;
}

interface ForceGraphCanvasProps {
  width: number;
  height: number;
  data: { nodes: ForceGraphNode[]; links: ForceGraphLink[] };
  palette: ForceGraphPalette;
  onOpen: (relPath: string) => void;
}

// d3 力对象在库类型里被窄化为 ForceFn(只有调用签名),strength/distance 取不到;
// 用最小接口够到底层 d3-force API——库未透出 d3-force,这是触达它的唯一口子。
interface TunableForce {
  strength?: (value: number) => unknown;
  distance?: (value: number) => unknown;
}

// 力导向画布:封装 react-force-graph-2d 的强类型用法(直接导入、泛型可推断、ref 调力学),
// 由上层 ssr:false 动态加载以回避 SSR 阶段的 window。
export default function ForceGraphCanvas({ width, height, data, palette, onOpen }: ForceGraphCanvasProps) {
  const ref = useRef<ForceGraphMethods<ForceGraphNode, ForceGraphLink> | undefined>(undefined);

  // 调散布局:加大斥力 + 拉长连线,避免大圈互挤、标签叠成一团;改数据后重启模拟。
  useEffect(() => {
    const fg = ref.current;
    if (!fg) return;

    const charge = fg.d3Force('charge') as unknown as TunableForce | undefined;
    charge?.strength?.(-340);
    const link = fg.d3Force('link') as unknown as TunableForce | undefined;
    link?.distance?.(90);
    fg.d3ReheatSimulation();
  }, [data]);

  return (
    <ForceGraph2D<ForceGraphNode, ForceGraphLink>
      ref={ref}
      width={width}
      height={height}
      graphData={data}
      nodeId="id"
      nodeVal="val"
      nodeRelSize={3}
      nodeColor={() => palette.node}
      nodeLabel="label"
      linkColor={() => palette.link}
      linkWidth={1}
      cooldownTicks={160}
      onEngineStop={() => ref.current?.zoomToFit(400, 56)}
      onNodeClick={(node: NodeObject<ForceGraphNode>) => node.relPath && onOpen(node.relPath)}
      nodeCanvasObjectMode={() => 'after'}
      nodeCanvasObject={(node, ctx, scale) => {
        // 缩放无关字号 + 纸色描边底:标签放圆下方一点,既不压圈、又能压住底下的连线。
        const fontSize = 11 / scale;
        const radius = Math.sqrt(node.val) * 3;
        const x = node.x ?? 0;
        const y = (node.y ?? 0) + radius + fontSize * 0.5;

        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3 / scale;
        ctx.strokeStyle = palette.paper;
        ctx.strokeText(node.label, x, y);
        ctx.fillStyle = palette.ink;
        ctx.fillText(node.label, x, y);
      }}
    />
  );
}
