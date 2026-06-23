# 知识库关系图改用 d3 SVG(复刻 llm-wiki-skill 效果)+ 关系图视图隐藏文件树

## Goal

把知识库 `/p/knowledge` 关系图从 canvas(`react-force-graph-2d`)改写为手写 d3 SVG,**忠实复刻 lewislulu/llm-wiki-skill 的图谱视觉与交互效果**:永动 ambient 呼吸布局、曲线连线、节点光晕、交错入场动画、hover 高亮邻居(连线流光 + 辉光)、标签按需显示。配色保留本项目砚墨主题。同时关系图视图占满主区——进入图模式不渲染左侧文件树。价值:图谱观感与可读性大幅提升,hover 能一眼看清某页连了谁。

## Confirmed Facts

- 关系图当前是 canvas:`ForceGraphCanvas.tsx` 包 `react-force-graph-2d`,`KnowledgeGraph.tsx` 取数据+解析色值后渲染它。
- `react-force-graph-2d` 全仓仅此一处引用,改写后可整个删依赖。
- canvas 不认 `var()`,故现有 `readPalette` 把主题色解析成色值;SVG 能直接吃 `var()`/CSS class,这套可删。
- 数据接口不变:`GET /api/knowledge/graph` 返 `KnowledgeGraphView`(`{nodes,edges}`);`toGraphData` 仅保留文档节点 + `link` 边;节点带 `kind`、`inDegree`、`label`、`relPath`、`id`。
- 复刻蓝本:upstream `web/client/graph.ts`(renderGraph 力学/渲染/hover)+ `web/client/styles.css`(`#graph-svg .*` 规则、`dashflow`/`nodeIn` keyframes);均已通读。upstream 用 Catppuccin 多色按 group 分色——本项目改用砚墨主题色,不照搬其调色板。
- 现有交互:点击节点 `onOpen(relPath)` → 切回文档模式并打开;canvas 自带拖拽/缩放;容器 `ResizeObserver` 跟尺寸。
- `KnowledgeWorkspace.tsx` 现在两模式都渲染 `<FileTree>`,只切主区;`mode: 'doc' | 'graph'` 为组件内 state。
- `packages/app` 当前无 d3 依赖;项目用 pnpm。

## Requirements

- 关系图改用 d3 SVG 渲染,删除 `react-force-graph-2d` 依赖。
- **永动呼吸布局**:力学模拟不冷却到停(`alphaTarget>0` + 每帧微扰),整图持续轻微浮动;初始从中心环形向外铺开。
- **曲线连线**:边为弧线 `path`,非直线。
- **节点光晕**:每节点一圈高斯模糊光晕,常态低透明、hover 时增强。
- **交错入场动画**:首次渲染时节点按序 scale 淡入(`animation-delay` 递增)。
- **hover 高亮**:移到某节点 → 该节点 + 直接邻居 + 相连边高亮;相连边显示流动虚线(`stroke-dashoffset` 动画)+ 辉光;其余节点与边淡化;移出恢复。
- **标签按需显示**:节点标签默认隐藏,仅在 hover 该节点或其为枢纽(degree≥阈值)时显示,带阴影保证可读。
- **矢量锐字**:标签为 SVG `<text>`,高清屏锐利。
- 保留交互:点击节点 → `onOpen(relPath)`;拖拽节点;缩放/平移画布;跟随容器尺寸。
- 配色走砚墨主题 CSS 变量,随明暗主题一致;不引入 Catppuccin。
- 进入关系图视图(`mode === 'graph'`)时不渲染左侧 `FileTree`,关系图占满主区;文档视图维持原样(树 + 文档 + 大纲)。
- 空图 / 加载失败提示维持现状。

## Acceptance Criteria

- [ ] `pnpm --filter @withy/app typecheck` 与 `pnpm --filter @withy/app lint`(0 warning)通过;`package.json` 不再含 `react-force-graph-2d`、含所需 d3 依赖。
- [ ] `/p/knowledge` 图模式:节点为圆 + 高斯光晕,连线为曲线弧;**整图持续轻微呼吸浮动不静止**。
- [ ] 首次进入图模式时节点交错 scale 淡入(非整屏同时弹出)。
- [ ] 鼠标移到任一节点:该节点 + 直接邻居 + 相连边高亮,相连边出现流动虚线 + 辉光,其余明显淡化;移出全部恢复。
- [ ] 节点标签默认不显示;hover 节点时其标签出现,枢纽节点(degree≥阈值)标签常显;标签在高清屏清晰、带阴影压住连线。
- [ ] 点击节点切回文档模式并打开对应页;可拖拽节点、滚轮缩放、拖空白平移。
- [ ] 关系图模式下左侧文件树不显示、主区被图占满;切回文档模式文件树恢复。
- [ ] 明暗/主题切换下图的配色与页面一致(走砚墨 CSS 变量)。

## Out of Scope

- upstream 的 Catppuccin 多色调色板(改用砚墨主题色;按 kind 分色仅在主题已有色板时做)。
- upstream 背景 `particles.ts` 漂浮粒子层(额外 canvas,本次不做;如需另起)。
- 全局/合并(`--merged`)图谱三档切换、文档↔代码 `cover` 边入图(维持现状:仅文档节点 + `link` 边)。
- 数据接口 `/api/knowledge/graph` 与 `KnowledgeGraphView` 结构变更。
- 文件树自身的三层结构展示(属另一进行中 task)。

## Open Questions

- None.
