import { DISPATCH_HELP } from '../constants.js';
import { taskDir } from '../paths.js';
import { dispatchExists, writeDispatch, readDispatch } from '../store/index.js';
import { relative } from 'node:path';
import { resolveCurrentPlatform } from '../agents/registry.js';
import { resolveAgentEngine } from '../agents/agents.js';
import type { AgentTool } from '../agents/registry.js';
import type { Scope } from '../paths.js';
import type { SkillNode, Workflow } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────
// Dispatch — the node-level subagent handoff. A skill node's optional `agent`
// declares "this step runs in a subagent of that role"; the relay renders a
// `dispatch` block so the main agent dispatches at the right moment, and the
// flat dispatch.json is the curated reading list every dispatched subagent reads
// directly. design §2; prd §3.
// ──────────────────────────────────────────────────────────────────────────

// The dispatch block the relay attaches on a node carrying an `agent` — design §2.1.
export interface DispatchBlock {
  // 派哪个角色的子 agent(取自 node.agent)。
  role: string;

  // 子 agent 的定位锚点(`Active task: <path>`,对齐 Trellis),主 agent spawn 时带给它。
  activeTask: string;

  // 派遣前检查:dispatch.json 的 read 非空为 true(只有 `_help` 为 false)。
  curated: boolean;

  // 一行固定英文操作提示(就近承载「怎么消费 dispatch 块」)。
  action: string;

  // native=主 agent 用自己工具派;cross=该角色声明的 engine 与当前平台不同,交给另一个
  // 运行时(尚未落地,阶段二)—— cross-tool-dispatch design §Components。
  mode: 'native' | 'cross';

  // cross 时携带目标 engine(角色声明的原始字符串,可能不是一个已装平台)。
  engine?: string;
}

// native = 主 agent 用自己的工具(如 Claude Task);cross = 交给另一个 engine 的运行时,
// 携带目标 engine 名 —— cross-tool-dispatch design §Components。
export type RouteResult = { mode: 'native' } | { mode: 'cross'; engine: string };

/**
 * Decide whether a node's declared agent role runs natively or should cross to
 * another engine's runtime. `engine` omitted, or equal to `currentPlatform`, is
 * native; any other value — including when `currentPlatform` itself is unknown
 * (`null`) — is cross, naming that engine. Pure: doesn't validate `engine` against
 * known platforms (an unrecognized string still safely resolves to cross) —
 * cross-tool-dispatch design §Components.
 *
 * @param agent the role's declared engine (raw, unvalidated; undefined = inherit)
 * @param currentPlatform the orchestrating session's detected platform, or null
 */
export function routeAgent(agent: { engine?: string }, currentPlatform: AgentTool | null): RouteResult {
  if (!agent.engine) return { mode: 'native' };
  if (agent.engine === currentPlatform) return { mode: 'native' };
  return { mode: 'cross', engine: agent.engine };
}

/** True when the workflow has at least one skill node declaring an `agent`. */
export function hasAgentNode(wf: Workflow): boolean {
  return wf.nodes.some(node => node.type === 'skill' && Boolean(node.agent));
}

/**
 * Idempotently seed the `_help`-only dispatch.json shell when the workflow has any
 * agent node and the file does not yet exist. Called at task creation (core has the
 * whole graph) and lazily wherever the relay/gate needs it, so a node gaining an
 * `agent` later still backfills a shell — design §1.2.
 *
 * @return true when a shell was written this call, false when skipped (no agent
 *   node, or the file already exists)
 */
export function seedDispatchShell(scope: Scope, taskId: string, wf: Workflow): boolean {
  if (!hasAgentNode(wf) || dispatchExists(scope, taskId)) return false;
  writeDispatch(scope, taskId, { read: [], _help: DISPATCH_HELP });
  return true;
}

/** Whether a task's dispatch.json has ≥1 real read entry (the curation signal). */
export function isDispatchCurated(scope: Scope, taskId: string): boolean {
  return (readDispatch(scope, taskId)?.read.length ?? 0) > 0;
}

// 一行固定英文操作提示:native 按现状(派、检查 curated、回传后 note+next、别回读工作文件、
// blocked 不推进);cross 诚实标注跨工具执行尚未落地,不发出一条当前跑不通的命令 ——
// cross-tool-dispatch design §Components。
function dispatchAction(role: string, activeTask: string, route: RouteResult): string {
  if (route.mode === 'cross') {
    return (
      `This step should run under \`${route.engine}\`'s runtime, but cross-tool execution ` +
      `(\`withy dispatch\`) isn't implemented yet (phase 2). For now, either carry out this step ` +
      `yourself, or pause and hand off to a human.`
    );
  }
  return (
    `Dispatch the \`${role}\` subagent for this step: prompt it with "Active task: ${activeTask}" plus the ` +
    `concrete instance scope. If \`curated\` is false and this step needs task-specific reading, first fill ` +
    `${activeTask}dispatch.json's \`read\` list. On its compact summary: \`withy note\`, then \`withy next\`. ` +
    `Don't re-read its working files; if it returns blocked, don't advance.`
  );
}

/**
 * Build the dispatch block for a node carrying an `agent`, or undefined otherwise.
 * Lazily seeds the dispatch.json shell so `curated` is computed against a real file
 * even when the node gained its agent after task creation — design §2.1. Also routes
 * native vs. cross from the role's declared `engine` and the current session's
 * detected platform — cross-tool-dispatch design §Components.
 *
 * @param env environment to detect the current platform from (defaults to
 *   process.env; injectable for tests, mirroring resolveCurrentPlatform)
 */
export function dispatchBlock(
  scope: Scope,
  taskId: string,
  wf: Workflow,
  node: SkillNode,
  env: NodeJS.ProcessEnv = process.env,
): DispatchBlock | undefined {
  if (!node.agent) return undefined;
  seedDispatchShell(scope, taskId, wf);
  const activeTask = `${relative(scope.root, taskDir(scope, taskId))}/`;
  const route = routeAgent({ engine: resolveAgentEngine(scope, node.agent) }, resolveCurrentPlatform(env));
  return {
    role: node.agent,
    activeTask,
    curated: isDispatchCurated(scope, taskId),
    action: dispatchAction(node.agent, activeTask, route),
    ...route,
  };
}
