# Web 视觉设计规范(design.md)

> 适用范围:`packages/app`(`@withy/app`,Next.js 16 + React 19 + Tailwind 4)的**视觉层**。
> 分工:[web.md](./web.md) 定义页面/数据流/API/交互;**本文定义"长什么样"**——视觉主题、配色 token、字号、间距、组件样式、排版规则。两者冲突时,功能行为以 web.md 为准,观感以本文为准。
> 单一来源:所有 token 落在 `packages/app/src/app/globals.css`,页面只用工具类,**不硬编码 hex**(对齐项目"单一数据源"铁律)。

---

## 1. 设计目标与原则

dashboard 是**多项目管理器 + 可观察控制台**,不是营销站。视觉服务于"一眼看清任务处于哪步、缺什么、卡在哪",所以:

1. **紧凑数据型**:信息密集、边框分隔、留白克制;长列表/时间线一屏看更多。颜色和留白都为"可读性",不为"呼吸感"堆砌空白。
2. **语义色固定**:状态色语义全局唯一(通过/失败/待批/信息),且**永远配 ✓/✗/⚠ 图标**,不靠颜色单独表意(色盲可用)。
3. **边框为主、阴影为辅**:分隔靠 1px 边框,阴影极轻,只给浮层(卡片/面板/浮动导航)一点抬升。
4. **双主题对等**:亮、暗是同一套语义 token 的两组取值,组件不为某一主题特调;切 `data-theme` 即整体跟随。
5. **token 单一来源**:语义命名(`paper`/`ink`/`teal`…)而非具象色名(`beige`/`navy`),换主题=换值不换名。

---

## 2. 整体视觉主题:砚墨 Ink-stone

**定位**:复古水粉(Klee / Gouache / Matisse)与中式砚墨的融合,低饱和大地色颜料铺在纸与墨两种底上。

- **亮色 = 中性燕麦纸**:暖纸去黄约 40%,保留纸的温润手感但不刺眼发黄,接近宣纸/燕麦纸的中性暖灰。
- **暗色 = 暖炭墨底**:近黑暖炭(砚台墨色,**非藏蓝**),teal / terracotta / mustard 像水粉颜料点在墨纸上,微提饱和度让其"发光"。
- **品牌 = 墨**:wordmark / 导航选中 / 主按钮用墨黑(暗色翻为暖白),把绿色专留给"通过",避免品牌色与状态绿撞色。

> 选定理由:在"亮色不过暖、暗色不普通"的诉求下,砚墨同时解决两点,且最大程度保留既有水粉气质、迁移风险最低。冷调备选(黛 Slate)、性格备选(绛 Plum)见 [§11 附录](#11-附录备选主题a-黛-slatec-绛-plum)。

### 2.1 双主题机制

- `<html data-theme="light|dark">`,默认 `light`;切换只改该属性,所有工具类经 CSS 变量自动跟随。
- 值变量(`--bg` / `--ink` / `--teal`…)按主题在 `:root`(=light)与 `[data-theme='dark']` 两段定义;token 名(`--color-*` / `--shadow-*`)经 `@theme inline` 指向值变量,使工具类直接命中。
- 主题切换器(读写 `<html>` 的 `data-theme` + `localStorage` 持久化)随顶栏实现;token 层先就绪,不阻塞页面开发。

---

## 3. 配色系统(砚墨 = 规范基准)

> 下表是**唯一权威色值**。`globals.css` 按此填 `:root` / `[data-theme='dark']`,工具类名见"工具类"列。新增颜色必须先进本表再进 css。

### 3.1 中性与底色

| 角色     | 工具类               | 亮(light) | 暗(dark)  | 说明                       |
| -------- | -------------------- | --------- | --------- | -------------------------- |
| 页面底   | `bg-canvas`          | `#ece8e0` | `#17161a` | 最底层画布;暗色是暖炭近黑  |
| 画布微调 | `bg-canvas-tint`     | `#f2efe8` | `#1c1b20` | 大区块微分层(可选)         |
| 卡面     | `bg-paper`           | `#f7f4ed` | `#211f25` | 卡片/面板主体面            |
| 下沉面   | `bg-paper-sunken`    | `#e6e1d6` | `#1b1a1f` | 进度槽/分段控件底/复选框底 |
| 主文字   | `text-ink`           | `#2a2722` | `#ece6da` | 标题、正文                 |
| 次文字   | `text-ink-soft`      | `#6f685c` | `#9c948a` | 副标题、meta、说明         |
| 弱文字   | `text-ink-faint`     | `#9c9384` | `#6a6359` | eyebrow、占位、时间线灰点  |
| 边框     | `border-line`        | `#ddd6c8` | `#322f38` | 默认分隔线                 |
| 强边框   | `border-line-strong` | `#ccc3b0` | `#423e48` | 控件/强调边、复选框边      |

### 3.2 品牌色

| 角色     | 工具类                  | 亮        | 暗        | 用途                         |
| -------- | ----------------------- | --------- | --------- | ---------------------------- |
| 品牌主色 | `bg-brand` `text-brand` | `#2a2722` | `#ece6da` | wordmark、导航选中、主按钮底 |
| 品牌反字 | `text-brand-ink`        | `#f7f4ed` | `#211f25` | 品牌底上的文字/图标          |

### 3.3 语义色(状态固定语义,配图标)

| 角色           | 工具类(前景/底)                      | 亮 前景   | 亮 底     | 暗 前景   | 暗 底     | 用途                   | 图标 |
| -------------- | ------------------------------------ | --------- | --------- | --------- | --------- | ---------------------- | ---- |
| 通过 / 完成    | `text-teal` `bg-teal-bg`             | `#2c6e60` | `#d8e6df` | `#4fb89c` | `#1c302a` | 门禁通过、进度、完成   | ✓    |
| 失败/缺失/卡住 | `text-terracotta` `bg-terracotta-bg` | `#bf5e38` | `#f0ddce` | `#e07a52` | `#34241d` | 门禁未过、卡住告警     | ✗    |
| 待批准 / 警告  | `text-mustard` `bg-mustard-bg`       | `#b9851f` | `#efe3c0` | `#ecb955` | `#322914` | approval、注入缺失     | ⚠    |
| 信息 / 次强调  | `text-blue` `bg-blue-bg`             | `#5a7689` | `#dde5ea` | `#8aa6c2` | `#20262f` | 规划阶段标签、中性强调 | —    |
| 辅助(可选)     | `text-sage`                          | `#7d8b5d` | `#9aa874` | —         | —         | 备用点缀,慎用          | —    |

**用法铁律**:状态色在 artifact / 事件时间线 / 节点 step / 注入对比间**统一复用**,不得为某页另起一套含义。暗色语义前景较亮色微提饱和与明度,以在墨底"发光"——这是砚墨的关键观感,值已写入上表,勿在组件里手动调亮。

### 3.4 阴影

| 工具类         | 亮                                                                | 暗                                                          |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `shadow-card`  | `0 1px 0 rgba(42,39,34,.04), 0 8px 24px -16px rgba(42,39,34,.26)` | `0 1px 0 rgba(0,0,0,.25), 0 12px 30px -18px rgba(0,0,0,.7)` |
| 浮动导航(内联) | `0 16px 40px -20px rgba(42,39,34,.5)`                             | `0 16px 40px -20px rgba(0,0,0,.75)`                         |

---

## 4. 字体与字号

### 4.1 字体栈(静态 token,不随主题)

| 用途                    | 工具类       | 栈                                          |
| ----------------------- | ------------ | ------------------------------------------- |
| 标题 / 强调(衬线)       | `font-serif` | `Fraunces` → `Songti SC`(中文宋体)→ Georgia |
| UI 正文                 | `font-sans`  | `Inter` → 系统 sans → `PingFang SC`         |
| 路径 / ID / 事件 / diff | `font-mono`  | `JetBrains Mono` → 系统 mono                |

> `Fraunces` / `Inter` / `JetBrains Mono` 经 `next/font` 加载(变量注入 `--font-*`);未加载时回退系统衬线/无衬线/等宽,不阻塞。

### 4.2 字号阶梯(紧凑数据型,base = 14px)

| Token      | px / line-height | 字体  | 典型用途                      |
| ---------- | ---------------- | ----- | ----------------------------- |
| `display`  | 36 / 1.05        | serif | 页面主标题(如"任务看板")      |
| `title-lg` | 22 / 1.1         | serif | 卡片内大标题、详情主标题      |
| `title`    | 18 / 1.2         | serif | 面板标题、卡片任务名          |
| `title-sm` | 15 / 1.25        | serif | 看板列标题                    |
| `body-lg`  | 15 / 1.5         | sans  | 强调正文                      |
| `body`     | 14 / 1.5         | sans  | 默认正文(基准)                |
| `body-sm`  | 13 / 1.45        | sans  | 副标题、meta 行、清单项       |
| `caption`  | 12 / 1.4         | sans  | node-tag、次要说明            |
| `micro`    | 11 / 1.4         | sans  | badge、phase-pill、eyebrow    |
| `label`    | 10 / 1.3         | sans  | 全大写分组标签(panel-eyebrow) |
| `mono`     | 12–13 / 1.5      | mono  | 时间戳、路径、taskId、diff    |

**字重**:正文 400;按钮/badge/标签/选中态 600;eyebrow/列标题 700;衬线标题 600(可斜体)。
**字间距**:全大写 eyebrow `letter-spacing: 1.2–2px`;其余默认。
**截断**:任务名等单行超长用 `truncate`(`text-overflow: ellipsis`),不换行撑破卡片;路径用 mono 可换行。

---

## 5. 间距与尺寸

### 5.1 间距阶梯(4px 基,token 名见括号)

`2(0.5) · 4(1) · 6(1.5) · 8(2) · 10(2.5) · 12(3) · 14(3.5) · 16(4) · 20(5) · 24(6) · 28(7) · 32(8)`(px(rem×4))。
对齐 Tailwind 间距标度,直接用 `gap-3` / `p-4` / `mb-5` 等,不引入任意值除非必要。

| 场景                | 取值                                   |
| ------------------- | -------------------------------------- |
| 卡片内边距          | `14px`(`p-3.5`)                        |
| 面板内边距          | `16px`(`p-4`)                          |
| 卡片间距 / 列内 gap | `12px`(`gap-3`)                        |
| 看板列间距          | `14px`                                 |
| 主区与右栏 gap      | `22px`                                 |
| 段落块(layer)间距   | `14px`                                 |
| 页面外边距(竖)      | `26px` 顶 / `120px` 底(给浮动导航留空) |

### 5.2 圆角(静态 token)

| 工具类         | 值      | 用途                       |
| -------------- | ------- | -------------------------- |
| `rounded-sm2`  | `8px`   | 输入框、gate 行、复选框    |
| `rounded-card` | `12px`  | 任务卡                     |
| `rounded-lg2`  | `14px`  | 面板                       |
| `rounded-full` | `999px` | 药丸/标签/头像/进度槽/分段 |

### 5.3 容器与响应式

| 视图              | 最大宽           |
| ----------------- | ---------------- |
| 常规页(详情/设置) | `max-w-[960px]`  |
| 看板 / 画布等宽   | `max-w-[1160px]` |

**断点**:

- 看板**恒 3 栏**(`grid-cols-3`,不随宽度塌缩为单列),保证 todo/doing/done 始终并列可比。
- 右侧详情栏**常驻、不可关闭**、固定宽 `336px`;窄屏下看板列随之变窄,但不降栏、不收起详情。
- `≤640px`:可隐藏非必要 meta、缩小内距,但仍保 3 栏 + 详情。

**看板选中与详情联动**:

- 详情面板没有关闭按钮;默认按 **doing → todo → done** 选中第一条(优先正在执行,其次待办,最后完成)。
- 用户点选某卡后以其为准;若切「我的/全部」过滤后选中项被隐藏,自动回退到默认选中。
- 当前过滤下**全无任务**时,详情区渲染占位文案(`viewDetail.detailEmpty`:"暂无可展示的任务")。

---

## 6. 组件样式

> 以下是 dashboard 复用组件的视觉契约。结构标记参考 `.temp/web-style-demo.html`;迁到 React 组件时用工具类映射本节取值。

### 6.1 顶栏与导航

- **wordmark**:`font-serif` 27px/600,墨色(`text-brand`);中段词用 `italic` + `text-terracotta` 双色混排(`tu` 正 + `teur` 斜);前缀符号(`⌇`)用 `text-teal` 小一号。
- **project-chip**:药丸,`border-line-strong` + `bg-paper` + `shadow-card`;左侧 `teal` 圆点表在线;右侧 `▾` 表可切换。
- **segmented(我的/全部)**:`bg-paper-sunken` 容器 + 内部药丸;选中项 `bg-brand` + `text-brand-ink`,未选 `text-ink-soft`。
- **theme-toggle**:药丸,`bg-paper` + `border-line-strong`;图标 ☾/☀ + 文案。
- **底部浮动导航(tabbar)**:固定居中,`bg-paper` + `border-line-strong` + 重一档阴影;选中项 `bg-brand` / `text-brand-ink`。

### 6.2 页眉

- **eyebrow**:`label`(10–11px)全大写、`letter-spacing` 加宽、`text-ink-faint`。
- **headline**:`display`(36px)serif/600,可对部分词用 `italic` + `text-teal`。
- **subline**:`body-sm`、`text-ink-soft`,常放计数概览("3 进行中 · 1 待批 · 1 卡住")。

### 6.3 任务卡(card)

- 容器:`bg-paper` + `border-line` + `rounded-card` + `shadow-card`,`overflow-hidden`。
- **左色条(strip)**:绝对定位 4px 竖条,颜色由**阶段/状态确定(非随机)**:规划 `blue` / 执行 `mustard` / 收尾 `teal`,卡住 `stuck` 覆盖为 `terracotta`,无阶段则 `line`。`PHASE_META`(`phase.ts`)是 strip/border/ring 的单一来源。
- **卡顶行**:左 phase-pill,右 avatar。
- **phase-pill**:`micro`/700 药丸,`text-<阶段色>` + `bg-<阶段色>-bg` + 同色小圆点。
- **任务名**:`title`(17–18px)serif/600,`truncate`。
- **meta-row**:node-tag(`节点 <b>check</b>`,`caption`,`text-ink-soft`,粗体节点名 `text-ink`)+ badge。
- **badge**:`micro`/600 药丸,三态 `ok`/`fail`/`warn` 对应 teal/terracotta/mustard 前景+底,**必带 ✓/✗/⚠**。
- **进度条(checkbar)**:`track`(`bg-paper-sunken` + `border-line`,6px,`rounded-full`)内 `teal` 填充(失败语境填 `terracotta`)+ 右侧 `清单 n/total`。
- **卡住态(stuck)**:靠 `terracotta` 左色条 + `✗ 卡住` badge + 底部 `stuck-ribbon`(虚线分隔 + `text-terracotta` 700:"卡住 · 验收连续失败")三重信号表达,**不单独给卡片加边框**(避免与选中边框混淆)。
- **avatar**:22px 圆,`bg-brand` + `text-brand-ink`,首字母。
- **选中态(selected)**:边框 + 1px ring **取该卡左侧色条同色**(阶段色;卡住=`terracotta`;无阶段=`line`),即 `${accent.border} ring-1 ${accent.ring}`——选中态与色条一致、所见即所属阶段。非选中卡(含 stuck)统一 `border-line`,保证整列只有选中卡有彩色边框。不用品牌墨色(偏黑)做选中态。
- **hover**:`translateY(-2px)` + 阴影加深(仅可点卡片)。

### 6.4 任务详情:三层进度

复用 web.md §3.4 的三层模型,视觉上叠为一个面板内的三个 `layer`,每层 `layer-label`(`micro`/700,`text-ink-faint`,带 ①②③ 序号):

- **① 主体阶段(stepper)**:规划 ● 执行 ○ 收尾,圆点 18px;`done` = `teal` 实心 + 勾,`active` = `mustard` 实心 + ●,未达 = `bg-paper-sunken` + `border-line-strong` 空心;节点间 1.5px `line-strong` 连线。
- **② 节点门禁(gate-row)**:8px 圆角行,失败态 `bg-terracotta-bg` + `terracotta` 混色边;左 `✗ check · npm test`,右 `第 N 次 / 阈值 M`(`text-terracotta`/700)。通过态改 `teal` 系。
- **③ 实施计划(implementation)**:从 `implement.md` 解析复选框;每项 17px 复选框(`rounded-sm2`,`done` = `teal` 实心勾);已完成项文字 `line-through` + `text-ink-soft`;下方接进度条。

### 6.5 事件时间线(timeline)

- 左侧 1.5px `border-line` 竖轴;每项 13px 圆点(`tdot`),套 2.5px `bg-paper` 描边使其浮在轴上。
- 圆点色=事件性质:`ok`=teal、`fail`=terracotta、`warn`=mustard、中性=`ink-faint`。
- 行内:`mono` 时间戳行(`text-ink-soft`)+ 文本行;关键判定词用 `ix-ok`/`ix-fail`/`ix-warn` 着色加粗,陈述部分 `muted`(`text-ink-soft`)。
- 注入对比:`session_start` 行列出"注入 n/total",未注入项标 `⚠` + terracotta 高亮(对比 planned)。

### 6.6 面板 / 列表 / 表格

- **panel**:`bg-paper` + `border-line` + `rounded-lg2` + `shadow-card` + `p-4`;顶部 panel-eyebrow(label)+ serif 标题(可双色斜体强调)。
- **count chip**:列标题旁计数,`micro`/700,`bg-paper-sunken` + `border-line` 药丸。
- **表格/长列表**(事件全量、知识库条目):行高紧凑,行间 `border-line` 分隔,无斑马纹;表头 `label` 全大写 `text-ink-faint`;mono 列(路径/id/时间)用 `font-mono` + `caption`。

### 6.7 表单与按钮

- **按钮·主**:`bg-brand` + `text-brand-ink`,`rounded-full` 或 `rounded-sm2`,`body-sm`/600。
- **按钮·次(ghost)**:`bg-paper` + `border-line-strong` + `text-ink`。
- **危险/不可逆**(如归档 cancelled):`terracotta` 文字 + 同色边,需二次确认(对齐"不可逆操作先说明风险")。
- **输入框**:`bg-paper` + `border-line-strong` + `rounded-sm2`,聚焦 `border-line-strong`→品牌色细环;`body-sm`。
- **空态(EmptyState)**:居中图标(`text-ink-faint`)+ serif 标题 + `text-ink-soft` 提示;用于未选项目/全局视图占位。

---

## 7. 排版规则

1. **衬线双色混排**:标题里"主词正体 `text-ink` + 辅词斜体彩色"是签名式排版——辅词用 `text-teal`(默认)或 `text-terracotta`(失败/告警语境),克制使用,一个标题只点一处。
2. **三种字体各司其职**:结构/标题 serif,UI/正文 sans,**任何机器值(路径/ID/时间戳/命令/diff/hash)一律 mono**,便于扫读与对齐。
3. **eyebrow 领位**:每个区块/面板用全大写小字 eyebrow 起头,降低 serif 大标题的突兀感、明确层级。
4. **对齐与密度**:meta 用 `flex` + `gap` 横向排布、超窄换行;数字/计数右对齐或行尾;时间线、清单等纵向流左对齐。
5. **颜色不单独表意**:任何用色传达状态处必带图标或文字标签;进度填充色可辅助但不可替代 `n/total` 数字。
6. **克制留白**:区块间距走 §5.1 标度,不为"高级感"加倍留白;一屏信息量优先。

---

## 8. 质感与底纹(可选)

复古纸/墨底:四角低饱和水粉色块(`radial-gradient` 取语义色 `color-mix`)+ `feTurbulence` 颗粒噪点,挂在**外层壳的固定层**(`.tt-grain::before/::after`),内容在其上(`z-index`)。

- 仅用于页面外壳,**不逐组件加**;亮/暗各一档强度(暗色噪点略强 0.05,亮色 0.04)。
- 噪点 `opacity` 极低,只做肌理不抢内容;四角色块 wash `opacity` **亮 0.35 / 暗 0.5**——暗色墨底保留更强颜料"发光",亮色调淡让中性燕麦纸底透出(否则暖色 wash 会盖掉去黄效果)。
- recipe 见 `globals.css` 的 `.tt-grain`(已就绪)。性能敏感页可整体关闭,不影响 token。

---

## 9. 实施映射(globals.css 单一来源)

```css
/* 静态 token:字体 + 圆角(不随主题) */
@theme {
  --font-sans: …;
  --font-serif: …;
  --font-mono: …;
  --radius-sm2: 8px;
  --radius-card: 12px;
  --radius-lg2: 14px;
}

/* 语义 token → 指向随主题切换的值变量 */
@theme inline {
  --color-canvas: var(--bg);
  --color-paper: var(--paper);
  --color-ink: var(--ink);
  --color-teal: var(--teal);
  --color-teal-bg: var(--teal-bg);
  /* …terracotta / mustard / blue / brand / line… */
  --shadow-card: var(--card-shadow);
}

:root,
[data-theme='light'] {
  --bg: #ece8e0;
  --paper: #f7f4ed;
  --ink: #2a2722; /* …§3 亮列… */
}
[data-theme='dark'] {
  --bg: #17161a;
  --paper: #211f25;
  --ink: #ece6da; /* …§3 暗列… */
}
```

- 页面**只用工具类**(`bg-paper` / `text-ink` / `border-line` / `text-teal` / `rounded-card` / `shadow-card` / `font-serif`…),不写 hex、不写内联色。
- 字号阶梯(§4.2)建议在 `@theme` 注册为 `--text-display` 等命名,或在组件用就近 Tailwind 文本类对齐 px;保持全站一致。
- 新增/调整任何颜色:先改 §3 表 → 再改 `globals.css` 两段值 → 工具类自动生效;**禁止**在组件里临时造色。

---

## 10. 落地顺序(视觉侧)

| #   | 项                                                          | 依赖           |
| --- | ----------------------------------------------------------- | -------------- |
| D1  | `globals.css` 套用砚墨 token(§3)+ 注册圆角/字号阶梯         | —              |
| D2  | `next/font` 接入 Fraunces / Inter / JetBrains Mono          | D1             |
| D3  | 主题切换器(`data-theme` 读写 + localStorage)随顶栏          | D1             |
| D4  | 顶栏 / 看板卡 / phase-pill / badge / 进度条组件化(§6.1–6.3) | D1, web W2/W3  |
| D5  | 详情三层进度 + 事件时间线组件(§6.4–6.5)                     | D4, web W16/W4 |
| D6  | 面板/表格/表单/空态 + 可选纸墨底纹(§6.6–6.7、§8)            | D4             |

> 现有 `app/page.tsx` 等仍可能含旧脚手架硬编码 hex,重建页面时按本文迁到工具类。

---

## 11. 附录:备选主题(A 黛 Slate、C 绛 Plum)

> 已选定砚墨为统一标准。以下两套为评审存档:若日后想转冷调或要更强性格,直接替换 §3 的两段值变量即可,组件与工具类无需改动(语义 token 名不变)。

### 11.1 A 黛 Slate(冷雾蓝灰 + 近黑靛蓝)

| 角色        | 亮        | 暗        |     | 角色          | 亮        | 暗        |
| ----------- | --------- | --------- | --- | ------------- | --------- | --------- |
| canvas      | `#e8ebef` | `#0e1320` |     | teal          | `#2c7163` | `#4aa791` |
| paper       | `#f6f8fb` | `#1a2236` |     | teal-bg       | `#d8e7e0` | `#16302b` |
| sunken      | `#dfe4ea` | `#151b2c` |     | terracotta    | `#c0603a` | `#db7651` |
| ink         | `#1f2630` | `#e7eaf0` |     | terracotta-bg | `#f0ddd2` | `#34211c` |
| ink-soft    | `#5a6472` | `#98a1b5` |     | mustard       | `#bf8b2e` | `#e0ad4f` |
| ink-faint   | `#8b94a3` | `#5f6981` |     | mustard-bg    | `#efe3c6` | `#332915` |
| line        | `#d7dde5` | `#2a344b` |     | blue          | `#4f6f8c` | `#84a0c4` |
| line-strong | `#c5cdd8` | `#38445f` |     | blue-bg       | `#dbe5ee` | `#18243a` |
| brand       | `#243044` | `#e7eaf0` |     | brand-ink     | `#f6f8fb` | `#1a2236` |

特征:亮色零黄味、最彻底"去暖";暗色近黑靛蓝且 canvas 深于 paper、有分层立体。气质偏现代利落。

### 11.2 C 绛 Plum(暖中性亚麻 + 紫栗暗色)

| 角色        | 亮        | 暗        |     | 角色          | 亮        | 暗        |
| ----------- | --------- | --------- | --- | ------------- | --------- | --------- |
| canvas      | `#ede9e6` | `#1a1320` |     | teal          | `#2c6e60` | `#52b095` |
| paper       | `#f7f4f2` | `#261c30` |     | teal-bg       | `#d9e6df` | `#1d3330` |
| sunken      | `#e6e0dc` | `#1f1728` |     | terracotta    | `#bf5a44` | `#df7a5c` |
| ink         | `#2c2630` | `#efe6e8` |     | terracotta-bg | `#f1dbd4` | `#36231f` |
| ink-soft    | `#6c6370` | `#a596a8` |     | mustard       | `#bd8a2c` | `#e6b257` |
| ink-faint   | `#9b909c` | `#6f6177` |     | mustard-bg    | `#efe3c4` | `#352816` |
| line        | `#ddd4d2` | `#3a2c44` |     | blue          | `#5e7691` | `#8aa0c6` |
| line-strong | `#cdc2c2` | `#4a3a56` |     | blue-bg       | `#dee4ec` | `#221d33` |
| brand       | `#4a2f43` | `#efe6e8` |     | brand-ink     | `#f7f4f2` | `#261c30` |

特征:暗色紫栗/酒红炭黑,最有性格、最不"普通"(紫不撞任何语义色);亮色暖中性亚麻。气质偏情绪化。

---

## 12. 维护约定

- 颜色/字号/间距/圆角/阴影的**权威值只在本文 + `globals.css`**;web.md 等只引用,不复制色值。
- 调整主题=改 §3 表与 `globals.css` 两段值变量;组件/工具类不动。
- 新组件先在 §6 登记视觉契约再实现;实施规格定位,不写营销话术。
- 视觉参考小样:`.temp/web-style-demo.html`(单主题看板)、`.temp/theme-proposals.html`(四主题对比)。
