# Design: 知识库关系图改用 d3 SVG(复刻 llm-wiki-skill 效果)+ 关系图视图隐藏文件树

## Summary

把 upstream `web/client/graph.ts` 的 `renderGraph` + `web/client/styles.css` 的 `#graph-svg` 规则**移植**进本项目,换掉 `react-force-graph-2d`(canvas)。移植即复刻:永动 ambient 力学(`alphaTarget` 不归零 + noise 微扰)、曲线弧连线、高斯光晕、`nodeIn` 交错入场、hover dim/highlight + 连线 `dashflow` 流光、标签按需显示。两处适配本项目:① 配色用砚墨主题 CSS 变量(非 Catppuccin);② React 组件壳 + CSS Module(Next App Router 限制)。布局层面:图模式不渲染 `FileTree`。这是「照搬成熟实现 + 最小适配」,不另行设计动画。

## Architecture and Boundaries

改动集中在 `packages/app` 前端,数据/接口/类型零改动:

- `ForceGraphCanvas.tsx` → 重写并改名 `ForceGraphSvg.tsx`:把 upstream `renderGraph(svgEl,data,opts)` 移植进 `useEffect`,适配数据形状与回调。纯渲染单元。
- `ForceGraphSvg.module.css`(新增):移植 upstream `#graph-svg .*` 规则 + `dashflow`/`nodeIn` keyframes,色值改砚墨 `var(--*)`。
- `KnowledgeGraph.tsx`:删 `readPalette`/`ForceGraphPalette`/palette state(SVG 走 CSS 变量),改引新组件;`toGraphData` 增带 `group`(由 `kind`)与 `degree`(由 `inDegree`)字段;保留取数/ResizeObserver/空态。
- `KnowledgeWorkspace.tsx`:`<FileTree>` 仅在 `mode !== 'graph'` 渲染。
- `package.json`:删 `react-force-graph-2d`,加 `d3-force`/`d3-selection`/`d3-zoom`/`d3-drag` + `@types/*`(与 upstream 同款,模块化)。

边界:`/api/knowledge/graph`、`KnowledgeGraphView` 输出契约不变;`toGraphData` 仍只输出文档节点 + `link` 边,新增 `group`/`degree` 仅供渲染分色与半径。

## Components

**ForceGraphSvg(`ForceGraphSvg.tsx`)** — 移植自 upstream `renderGraph`
- 输入:`{ width, height, data:{nodes:ForceGraphNode[],links:ForceGraphLink[]}, onOpen:(relPath)=>void }`;`ForceGraphNode={id,label,group,degree,relPath?}` 从本文件导出供 KnowledgeGraph 复用。
- 渲染结构(同 upstream):`<svg><defs>(feGaussianBlur 光晕 filter)</defs><g.root>(zoom transform)<g.links><path.link/></g><g.nodes><g.node><g.node-inner><circle.node-halo/><circle.node-main/><text/></g></g></g></g></svg>`。
- 力学(照搬 upstream 参数):`forceSimulation` + link(distance≈170,strength≈0.22)+ charge(-650,distanceMax 900)+ center + collide(r+14,0.9)+ x/y(0.02);`alphaDecay≈0.005`、`velocityDecay≈0.28`、`alphaTarget≈0.015`;额外 `noise` 力每 tick 给非固定节点加微小随机 `vx/vy` → 永动呼吸。节点初始播种在中心小环(入场向外铺开)。
- 半径:`6 + sqrt(degree)*2.6`(upstream)。`.node` class 含 `group-<g>` 与 `degree>=5?big`。
- 交互(照搬):`d3-drag`(start fx/fy+alphaTarget 0.15、end 释放回 0.015)、`d3-zoom`(scaleExtent[0.2,4],transform→`g.root`)、`mouseenter/leave` 据邻接表切节点/边 `dim`/`highlight`、`click→onOpen(relPath)`。
- tick:link `path.d` 用弧(`M sx,sy A dr,dr 0 0,1 tx,ty`,`dr=dist*1.8`);`g.node` translate。
- 生命周期:`useEffect([data,width,height])` 建图;cleanup `sim.stop()`+清 svg。SSR 安全(server 渲空 svg,d3 仅在 effect 跑),KnowledgeGraph 普通 import。
- 交错入场:`node-inner` 设内联 `style.animation-delay = min(900, i*18)ms`,配合 CSS `nodeIn` keyframes。

**ForceGraphSvg.module.css** — 移植自 upstream graph CSS,色改砚墨
- `.link`:`stroke: var(--line-strong)`,曲线,`transition`;`.dim`→低 `stroke-opacity`;`.highlight`→`stroke: var(--teal)`、加粗、`stroke-dasharray:8 6` + `animation: dashflow 22s linear infinite` + `drop-shadow` 辉光。`@keyframes dashflow{to{stroke-dashoffset:-1000}}`。
- `.node-halo`:`opacity:.2`、`pointer-events:none`、`fill` 按 group(单 accent 或主题已有色板);`.highlight .node-halo`→`opacity:.75`。
- `.node-main`:`fill` 按 group、深色描边;`.highlight .node-main`→提亮加粗描边。
- `.node`:`cursor:pointer`、`transition:opacity`;`.dim`→`opacity:.18`。
- `text`:`fill: var(--ink)`、固定字号、`pointer-events:none`、`opacity:0` + text-shadow;`.highlight text`、`.big text`→`opacity:1`。
- `.node-inner`:`animation: nodeIn 720ms ... backwards`、`transform-box:fill-box`、`transform-origin:center`。`@keyframes nodeIn{from{opacity:0;transform:scale(.35)}to{opacity:1;transform:scale(1)}}`。
- 暗角:放在 KnowledgeGraph 容器(`::after` 径向渐变)或 svg-wrap;`pointer-events:none`。

## Data Flow and Contracts

1. KnowledgeGraph 取 `/api/knowledge/graph` → `toGraphData`:文档节点 → `{id,label,relPath,group:kind,degree:inDegree}`;边 → `{source,target}`(仅 `link`、两端存在)。
2. 传入 ForceGraphSvg → effect 内移植 renderGraph:建邻接表(hover)、建 sim(永动)、渲染、绑交互。
3. 配色不经 JS:SVG `fill/stroke` 用 `var(--*)`,随主题切换。
4. group→色:`sanitizeGroup(kind)` 把本项目 kind 归并到有限组名;主题若只有单 accent 则各组同色(动效/光晕/hover 不受影响),主题有多色板时按组分色。

不变量:仅文档节点 + `link` 边入图;永动呼吸是力学常态,绝不冷却到停;标签默认隐藏(仅 hover/枢纽显)。

## Error Handling and Edge Cases

- 空图/加载失败:维持 KnowledgeGraph 现有 `graphEmpty`/`loadFailed`;有节点才渲染。
- 容器尺寸 0:沿用 `size.width>0` 门。
- 单节点/无边:sim 收敛到中心,无边即不画。
- 永动 + 不可见 tab:`mouseleave` 复位;组件卸载 `sim.stop()` 防后台空转。
- StrictMode 重渲染:cleanup 清 svg+stop,重建幂等。

## Compatibility and Migration

- 删 `react-force-graph-2d` 安全(全仓仅一处引用)。
- 数据接口/类型零改动;`toGraphData` 增字段为新增非破坏。
- 视觉:由「JS 解析色值 canvas」改为「CSS 变量 SVG」,主题跟随更准。
- 行为变化(复刻带来,已与用户确认方向):① 布局由静止改永动呼吸;② 标签由全显改 hover/枢纽显;③ 取消 canvas 的 zoomToFit,改 upstream 居中力+环形铺开。

## Testing Strategy

- `pnpm --filter @withy/app typecheck` + `lint`(0 warning)。
- 手动(agent-browser):`/p/knowledge` 图模式逐项核对——曲线弧/光晕/持续呼吸/交错入场/hover 高亮邻居+连线流光辉光+其余淡化/标签默认隐藏 hover 显枢纽常显/点击开文档/拖点不平移、拖空白平移、滚轮缩放/图模式无文件树/明暗配色一致。先 `set viewport 1440 900 2` 再截图。
- 无新增纯逻辑函数需单测;以类型+lint+手动观测为准。

## Risks and Rollback

- 风险:永动力学在后台 tab 持续耗 CPU → 当前规模(数十节点)可忽略;卸载即 stop;真大了再加可见性暂停。
- 风险:砚墨单 accent 下「按 group 分色」无差别 → 接受(核心效果是动效/光晕/hover,非多色);主题有色板再分色。
- 风险:CSS Module 下 d3 用 `styles.xxx` 喂类名、keyframes 自动作用域 → 同文件引用即可。
- 风险:无 zoomToFit 致大图框歪 → 居中力+x/y 通常够;check 阶段目测,必要时补一次性初始 fit。
- 风险:d3 模块若 SSR 摸 `document` → 退回 `dynamic(ssr:false)`,影响一处 import。
- 回滚:改动局限 4 文件 + 依赖,`git revert` 即恢复 canvas 版。
