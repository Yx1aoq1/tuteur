import { z } from 'zod';
import { AGENT_PLATFORMS } from './agents/registry.js';
import type { AgentTool } from './agents/registry.js';

// ──────────────────────────────────────────────────────────────────────────
// Task (tasks/<id>/task.json) — core.md §4.1
// ──────────────────────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum(['planning', 'in_progress', 'completed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  workflow: z.string(),
  status: TaskStatusSchema,
  creator: z.string(),
  assignee: z.string(),
  priority: TaskPrioritySchema.default('normal'),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  completedAt: z.string().nullable().default(null),
  archivedAt: z.string().nullable().default(null),
});
export type Task = z.infer<typeof TaskSchema>;

// ──────────────────────────────────────────────────────────────────────────
// State (tasks/<id>/state.json) — core.md §4.2
// ──────────────────────────────────────────────────────────────────────────

export const DecisionRecordSchema = z.object({
  branch: z.string(),
  reason: z.string().optional(),
  by: z.string().optional(),
  at: z.string(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

// Human approval records live inside state (gate input), keyed by node id.
export const ApprovalRecordSchema = z.object({ approvedAt: z.string(), by: z.string() });
export const ApprovalsSchema = z.record(ApprovalRecordSchema).default({});
export type Approvals = z.infer<typeof ApprovalsSchema>;

export const StateSchema = z.object({
  taskId: z.string(),
  currentNode: z.string().nullable(),
  completedNodes: z.array(z.string()).default([]),
  decisions: z.record(DecisionRecordSchema).default({}),
  approvals: ApprovalsSchema,
  updatedAt: z.string(),
});
export type State = z.infer<typeof StateSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Workflow (workflows/<id>.workflow.json) — core.md §4.3
// Fixed three phases + two node types (skill | switch).
// ──────────────────────────────────────────────────────────────────────────

// Canvas coordinate of a node (free-form layout). Persisted for the editor to
// restore positions; never participates in validation — web §3.3, core §4.3.
export const PositionSchema = z.object({ x: z.number(), y: z.number() });
export type Position = z.infer<typeof PositionSchema>;

// A gate artifact: a bare path (back-compat) or an object adding a display title
// and a template knowledge-id reference. The gate only checks `path` (exists +
// non-empty); title/template are for display and template injection — core §4.3.1.
export const ArtifactSpecSchema = z.union([
  z.string(),
  z.object({ path: z.string(), title: z.string().optional(), template: z.string().optional() }),
]);
export type ArtifactSpec = z.infer<typeof ArtifactSpecSchema>;

export const GateSchema = z.object({
  artifacts: z.array(ArtifactSpecSchema).optional(),
  checks: z.array(z.string()).optional(),
  approval: z.boolean().optional(),
  // require a node summary (`withy note`) for the current round before advancing — §note gate.
  note: z.boolean().optional(),
  // require a non-empty implementation plan (checklist.json) — §progress gate.
  progress: z.boolean().optional(),
  // require a curated dispatch.json (≥1 real `read` entry) before advancing an
  // agent node — opt-in curation gate (design §5). Only meaningful on agent nodes.
  curated: z.boolean().optional(),
});
export type Gate = z.infer<typeof GateSchema>;

export const SkillNodeSchema = z.object({
  id: z.string(),
  type: z.literal('skill'),
  skill: z.string(),
  // 可选:声明本步由该角色的子 agent 执行(对应 canonical .agents/agents/<role>.md)。
  // 省略=主会话自己干,行为不变;仅 skill 节点适用,switch 节点无此字段 — core §4.3。
  agent: z.string().optional(),
  next: z.string().nullable(),
  phase: z.string().nullable().optional(),
  pos: PositionSchema.optional(),
  gate: GateSchema.optional(),
});
export type SkillNode = z.infer<typeof SkillNodeSchema>;

export const BranchSchema = z.object({
  label: z.string(),
  criteria: z.string().optional(),
  next: z.string().nullable(),
  default: z.boolean().optional(),
});
export type Branch = z.infer<typeof BranchSchema>;

export const SwitchNodeSchema = z.object({
  id: z.string(),
  type: z.literal('switch'),
  phase: z.string().nullable().optional(),
  pos: PositionSchema.optional(),
  branches: z.array(BranchSchema).min(1),
});
export type SwitchNode = z.infer<typeof SwitchNodeSchema>;

export const WorkflowNodeSchema = z.discriminatedUnion('type', [SkillNodeSchema, SwitchNodeSchema]);
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const PhaseSchema = z.object({
  id: z.string(),
  label: z.string().optional(), // 缺省时 UI 以 phase id 作为展示名,模板可不带语言文案
  entry: z.string().optional(),
});
export type Phase = z.infer<typeof PhaseSchema>;

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  entry: z.string(),
  phases: z.array(PhaseSchema).default([]),
  nodes: z.array(WorkflowNodeSchema).min(1),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Events (tasks/<id>/events.jsonl) — core.md §4.4
// ──────────────────────────────────────────────────────────────────────────

export const TaskEventSchema = z.discriminatedUnion('type', [
  z.object({
    ts: z.string(),
    type: z.literal('complete_attempt'),
    node: z.string(),
    ok: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({
    ts: z.string(),
    type: z.literal('decision'),
    node: z.string(),
    branch: z.string(),
    reason: z.string().optional(),
    by: z.string().optional(),
  }),
  z.object({
    ts: z.string(),
    type: z.literal('rewind'),
    node: z.string(),
    by: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    ts: z.string(),
    type: z.literal('skip'),
    node: z.string(),
    by: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({ ts: z.string(), type: z.literal('approval'), node: z.string(), by: z.string().optional() }),
  // session_start carries the injected entry ids plus an optional verbatim snapshot
  // of the injection text (truncated to SNAPSHOT_MAX). snapshot is optional so old
  // rows (no snapshot) still parse.
  z.object({
    ts: z.string(),
    type: z.literal('session_start'),
    injected: z.array(z.string()),
    snapshot: z.string().optional(),
  }),
  // task birth marker; ts = task.createdAt so the timeline has an explicit origin.
  z.object({ ts: z.string(), type: z.literal('task_created'), by: z.string().optional() }),
  // agent-authored node summary (the note gate's evidence).
  z.object({
    ts: z.string(),
    type: z.literal('note'),
    node: z.string(),
    summary: z.string(),
    by: z.string().optional(),
  }),
  // verbatim (truncated) user prompt; recorded only while a task is active.
  z.object({ ts: z.string(), type: z.literal('prompt'), text: z.string() }),
  // a checklist item flipped to done (implementation progress milestone).
  z.object({ ts: z.string(), type: z.literal('checkpoint'), id: z.string(), text: z.string() }),
]);
export type TaskEvent = z.infer<typeof TaskEventSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Implementation progress item (id/text/done) — the neutral view shape shared by
// the dashboard and the archive gate. Sourced from checklist.json.
// ──────────────────────────────────────────────────────────────────────────

export interface ImplementationItem {
  id: string;
  text: string;
  done: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Checklist (tasks/<id>/checklist.json) — command-managed implementation plan.
// The sole implementation-progress source (it replaced implement.md entirely).
// ──────────────────────────────────────────────────────────────────────────

export const ChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  verify: z.string().optional(),
  done: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// nextId is a monotonic counter: an item's id is the nextId at allocation time,
// then nextId increments. Removing an item never renumbers; ids are never reused.
export const ChecklistSchema = z.object({
  nextId: z.number().int().positive().default(1),
  items: z.array(ChecklistItemSchema).default([]),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

// Implementation-progress view from checklist.json, feeding the archive gate /
// dashboard counts and the detail item list — store §readProgress.
export interface ProgressView {
  source: 'checklist' | 'none';
  items: ImplementationItem[];
  done: number;
  total: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Dispatch config (tasks/<id>/dispatch.json) — the flat, role-agnostic curated
// reading list every dispatched subagent reads directly. core.md §4.5, design §1.2.
// ──────────────────────────────────────────────────────────────────────────

// 一条派遣必读项:引用知识条目 id 或任务产物名,description 是文档梗概(子 agent 据此自判细读)。
export const DispatchReadEntrySchema = z.union([
  z.object({ id: z.string(), description: z.string() }),
  z.object({ artifact: z.string(), description: z.string() }),
]);
export type DispatchReadEntry = z.infer<typeof DispatchReadEntrySchema>;

// dispatch.json:扁平 read 清单 + `_help` 填写指引。种壳时只有 `_help`,read 默认空。
export const DispatchConfigSchema = z.object({
  read: z.array(DispatchReadEntrySchema).default([]),
  _help: z.string().optional(),
});
export type DispatchConfig = z.infer<typeof DispatchConfigSchema>;

// ──────────────────────────────────────────────────────────────────────────
// RunRecord / handback — phase-one shape contract only (no store read/write, no
// runs/ path, no gate wiring yet;阶段二再落地). cross-tool-dispatch design §Components.
// ──────────────────────────────────────────────────────────────────────────

// 派给哪个工具执行,派生自 registry 键(单一数据源,不在本文件手写平台清单)。
export const AgentToolSchema = z.enum(Object.keys(AGENT_PLATFORMS) as [AgentTool, ...AgentTool[]]);

export const RunStatusSchema = z.enum(['running', 'completed', 'error', 'timeout']);
export type RunStatus = z.infer<typeof RunStatusSchema>;

// 一次跨工具子代理运行的记录(阶段二读写落 runs/<node>-<n>.json)。
export const RunRecordSchema = z.object({
  runId: z.string(),
  node: z.string(),
  executor: AgentToolSchema,
  cwd: z.string(),
  sessionId: z.string().optional(),
  status: RunStatusSchema, // 来自退出码,不抓 PTY 猜测
  exitCode: z.number().int().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  log: z.string().optional(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const HandbackStatusSchema = z.enum(['ok', 'blocked', 'failed']);
export type HandbackStatus = z.infer<typeof HandbackStatusSchema>;

// 跨工具交接契约,沿用同工具 subagent 回执的形状(node/status/summary + touched/blockers)。
export const HandbackSchema = z.object({
  node: z.string(),
  status: HandbackStatusSchema,
  summary: z.string(),
  touched: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  needsInput: z.string().nullable().default(null),
});
export type Handback = z.infer<typeof HandbackSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Local developer identity (.developer) — core.md §3
// ──────────────────────────────────────────────────────────────────────────

export const DeveloperSchema = z.object({
  name: z.string(),
  slug: z.string(),
  initializedAt: z.string().optional(),
});
export type Developer = z.infer<typeof DeveloperSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Global project registry (~/.withy/projects.json) — core.md §2.1
// The global root is config + project registry + templates; it holds no tasks.
// ──────────────────────────────────────────────────────────────────────────

// A registered project in the global multi-project registry (web dashboard source).
export const ProjectRefSchema = z.object({
  path: z.string(),
  name: z.string(),
  addedAt: z.string(),
});
export type ProjectRef = z.infer<typeof ProjectRefSchema>;

export const ProjectsRegistrySchema = z.object({ projects: z.array(ProjectRefSchema).default([]) });
export type ProjectsRegistry = z.infer<typeof ProjectsRegistrySchema>;
