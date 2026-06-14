// Explicit named re-exports (no `export *`): better tree-shaking + faster type
// resolution, and the public surface stays auditable. See CLAUDE.md.

export {
  DASHBOARD_PROJECT_ROOT_ENV,
  DASHBOARD_SERVICE_NAME,
  DASHBOARD_PACKAGE_NAME,
  DEFAULT_STUCK_THRESHOLD,
  PRODUCT_DISPLAY_NAME,
  SKILL_NAME_PREFIX,
  getSlashCommandPrefix,
  getBundledSkillName,
  CLI_COMMAND_NAME,
  PROJECT_DIR_NAME,
  GLOBAL_DIR_NAME,
  EVENT_REASON_MAX,
  toDirectoryName,
  PHASE_PLANNING,
  PHASE_EXECUTE,
  PRODUCT_SLUG,
  PHASE_FINISH,
} from './constants.js';

export {
  ApprovalRecordSchema,
  ContextConfigSchema,
  WorkflowNodeSchema,
  DecisionRecordSchema,
  TaskPrioritySchema,
  SwitchNodeSchema,
  TaskStatusSchema,
  DeveloperSchema,
  TaskEventSchema,
  SkillNodeSchema,
  ApprovalsSchema,
  WorkflowSchema,
  BranchSchema,
  PhaseSchema,
  StateSchema,
  TaskSchema,
  GateSchema,
} from './types.js';
export type {
  ContextConfig,
  DecisionRecord,
  TaskPriority,
  WorkflowNode,
  TaskStatus,
  SwitchNode,
  Developer,
  Approvals,
  SkillNode,
  TaskEvent,
  Workflow,
  Branch,
  Phase,
  State,
  Gate,
  Task,
} from './types.js';

export {
  currentTaskPointerPath,
  resolveProjectScope,
  resolveGlobalScope,
  detectTuteur,
  workflowsDir,
  workflowPath,
  archiveDir,
  runtimeDir,
  tasksDir,
  taskPath,
  taskDir,
} from './paths.js';
export type { Scope } from './paths.js';

export {
  writeCurrentTaskPointer,
  clearCurrentTaskPointer,
  readCurrentTaskPointer,
  readContextConfig,
  readDeveloper,
  readWorkflow,
  appendEvent,
  isApproved,
  readEvents,
  taskExists,
  writeState,
  readState,
  StoreError,
  writeTask,
  listTasks,
  readTask,
} from './store.js';
export type { ListTasksOptions } from './store.js';

export {
  countConsecutiveFailures,
  resolveCurrentTask,
  advanceWorkflow,
  archiveTask,
  deriveStatus,
  completeNode,
  initialState,
  describeNext,
  approveNode,
  rewindTo,
  skipNode,
  nodeById,
  phaseOf,
  isStuck,
} from './domain.js';
export type { CompleteResult, CompleteOptions, ArchiveOptions, CurrentTask, NextStep } from './domain.js';

export { resolvePlannedContext } from './context.js';

export { logicalSkillName, resolveSkillRef, discoverSkills } from './skills.js';
export type { DiscoveredSkill, ResolvedSkill } from './skills.js';

export { renderSessionStart } from './hook.js';
export type { SessionStartResult } from './hook.js';

export {
  CANONICAL_SKILL_DIR,
  getInitAgentChoices,
  getProjectSkillDirs,
  getGlobalSkillDirs,
  getAgentPlatform,
  AGENT_PLATFORMS,
} from './agents/index.js';
export type {
  RegisteredAgentPlatformConfig,
  ConfigureAgentContext,
  ConfigureAgentResult,
  PlatformConfigurator,
  AgentPlatformConfig,
  SkillAdapterMode,
  TemplateContext,
  AgentTool,
} from './agents/index.js';

export {
  writeJsonFileIfMissing,
  writeTextIfMissing,
  existsNonEmpty,
  writeJsonFile,
  readJsonFile,
  isDirectory,
  dirExists,
  ensureDir,
  writeText,
  moveDir,
  slugify,
  nowIso,
} from './utils/index.js';
