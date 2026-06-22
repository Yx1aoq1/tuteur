// 看板/侧栏的视图模型类型。纯类型、无 @withy/core 依赖,供服务端读取层与客户端组件共享
// (客户端组件不可 import @withy/core —— 会把 node:fs 带进浏览器包)。

export type BoardColumn = 'todo' | 'doing' | 'done';

// 主体阶段,对齐 core 的 PHASE_* 字面值
export type Phase = 'planning' | 'execute' | 'finish';

// 实施步骤视图模型(对齐 core ImplementationItem 的可展示字段)
export interface ImplementationItemView {
  id: string;
  text: string;
  done: boolean;
}

export interface ImplementationView {
  done: number;
  total: number;
  items: ImplementationItemView[];
}

// 执行时间线的单条事件视图模型(对齐 core TaskEvent 的可展示字段)。
// session_start 无 node(node=null);ok 仅 complete_attempt 有;by 仅 decision/rewind/skip/approval/note/task_created 有。
// prompt 与里程碑事件同列于时间线,其正文经 text 折叠展示。
export interface TimelineEventView {
  ts: string; // ISO 时间戳
  type: string; // 事件类型字面值(complete_attempt/decision/rewind/skip/approval/session_start/task_created/note/checkpoint/prompt)
  node: string | null; // 关联节点;session_start/task_created/prompt 无节点为 null
  ok: boolean | null; // 验收结果(仅 complete_attempt),其余为 null
  reason: string | null; // 事件说明(core 已截断),无则 null
  by: string | null; // 操作人,无则 null
  summary: string | null; // 节点小结正文(仅 note),无则 null
  text: string | null; // 条目文本(checkpoint 单行 / prompt 折叠正文),无则 null
  snapshot: string | null; // 注入正文快照(仅 session_start,可展开),无则 null
}

// 任务产物视图模型:一个产物 md 文件名 + 正文(懒加载,不挂 BoardCard)
export interface TaskDocView {
  name: string; // 产物文件名(安全 .md basename)
  body: string; // markdown 正文(只读)
}

// 看板卡:一条任务在看板上的展示所需
export interface BoardCard {
  id: string;
  title: string;
  owner: string;
  mine: boolean; // 是否归当前身份(创建者/负责人匹配),供「我的/全部」过滤
  column: BoardColumn;
  phase: Phase | null;
  node: string | null;
  stuck: boolean;
  implementation: ImplementationView;
  timeline: TimelineEventView[]; // 执行时间线(严格按时间升序,含 prompt);产物清单不挂此处,详情按需懒加载
}

export interface BoardData {
  columns: Record<BoardColumn, BoardCard[]>;
  counts: Record<BoardColumn, number>;
  total: number;
}

// 归档任务的终态(对齐 core TaskStatus;web 归档只会产出 completed/cancelled,CLI 可归档其它态)
export type ArchivedStatus = 'planning' | 'in_progress' | 'completed' | 'cancelled';

// 归档卡:归档后任务的进度数据是冻结历史(只读),供归档详情回看「实施到了哪一步」
export interface ArchivedCard {
  id: string;
  title: string;
  owner: string;
  mine: boolean; // 是否归当前身份,供「我的/全部」过滤
  archivedAt: string; // ISO 时间戳,行内取 MM-DD、详情取 YYYY-MM-DD
  finalStatus: ArchivedStatus;
  createdAt: string; // ISO,生命周期展示
  completedAt: string | null; // ISO 或 null(未完成即归档)
  phase: Phase | null; // 归档时所在阶段(state.currentNode → phaseOf)
  node: string | null; // 归档时所在节点
  implementation: ImplementationView; // 冻结的实施计划进度(只读)
  timeline: TimelineEventView[]; // 冻结的执行时间线(归档任务经 taskReadPath 回退仍可读)
}

// 一个 YYYY-MM 月份桶下的归档任务
export interface ArchivedGroup {
  bucket: string; // YYYY-MM
  cards: ArchivedCard[];
}

export interface ArchivedData {
  groups: ArchivedGroup[]; // 按月份倒序,组内按归档时间倒序
  total: number;
}

// 侧栏项目卡
export interface ProjectCard {
  path: string;
  name: string;
  branch: string | null; // 非 git 仓库为 null,不展示分支
  dirty: number;
  taskCount: number;
}

export interface Identity {
  name: string;
  slug: string;
}

export type TaskFilter = 'mine' | 'all';

// ──────────────────────────────────────────────────────────────────────────
// Workflow 画布(canvas)视图模型 —— 镜像 core Workflow 结构。
// 客户端画布组件不可 import @withy/core(会带入 node:fs),故在此重定义为纯类型;
// 字段与 core 的 zod schema 一一对应,PUT 时整体回传可被 WorkflowSchema 校验。
// ──────────────────────────────────────────────────────────────────────────

// 门禁产物:裸路径(向后兼容)或带展示标题/模板引用的对象(门禁只核 path)
export type CanvasArtifact = string | { path: string; title?: string; template?: string };

// 节点门禁:产物存在 + 检查命令 + 人工审批 + 节点小结 + 实施计划(任一可选,与 core Gate 一一对应)
export interface CanvasGate {
  artifacts?: CanvasArtifact[];
  checks?: string[];
  approval?: boolean;
  note?: boolean;
  progress?: boolean;
}

// 画布坐标(编辑器维护,不参与校验):x 自由;y 为所在泳道内相对带顶的偏移
export interface CanvasPos {
  x: number;
  y: number;
}

// skill 节点:引用一个 skill,完成后推进到 next(null=结束)
export interface CanvasSkillNode {
  id: string;
  type: 'skill';
  skill: string;
  next: string | null;
  phase?: string | null;
  pos?: CanvasPos;
  gate?: CanvasGate;
}

// switch 分支:label + 判断说明 + 目标节点;须恰好一个 default
export interface CanvasBranch {
  label: string;
  criteria?: string;
  next: string | null;
  default?: boolean;
}

// switch 节点:靠 agent 判断走哪条分支,无布尔表达式
export interface CanvasSwitchNode {
  id: string;
  type: 'switch';
  phase?: string | null;
  pos?: CanvasPos;
  branches: CanvasBranch[];
}

export type CanvasNode = CanvasSkillNode | CanvasSwitchNode;

// 固定三阶段:id 对齐 core 的 phase id;label 可选,缺省时画布以 id 作展示名
export interface CanvasPhase {
  id: string;
  label?: string;
  entry?: string;
}

// 一份可在画布上编辑的 workflow(等价 core Workflow)
export interface CanvasWorkflow {
  id: string;
  name?: string;
  version?: string;
  entry: string;
  phases: CanvasPhase[];
  nodes: CanvasNode[];
}

// 右栏可拖入画布的 skill(discoverSkills 去重后的真实安装名)
export interface CanvasSkill {
  name: string;
  description?: string;
  source: 'project' | 'global';
}

// 画布页数据:待编辑的 workflow + 可拖拽的 skill 列表
export interface CanvasData {
  workflow: CanvasWorkflow;
  skills: CanvasSkill[];
}
