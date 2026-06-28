import { DISPATCH_HELP } from '../constants.js';
import { taskDir } from '../paths.js';
import { dispatchExists, writeDispatch, readDispatch } from '../store/index.js';
import { relative } from 'node:path';
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

// 一行固定英文操作提示:派、检查 curated、回传后 note+next、别回读子 agent 文件、blocked 不推进。
function dispatchAction(role: string, activeTask: string): string {
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
 * even when the node gained its agent after task creation — design §2.1.
 */
export function dispatchBlock(scope: Scope, taskId: string, wf: Workflow, node: SkillNode): DispatchBlock | undefined {
  if (!node.agent) return undefined;
  seedDispatchShell(scope, taskId, wf);
  const activeTask = `${relative(scope.root, taskDir(scope, taskId))}/`;
  return {
    role: node.agent,
    activeTask,
    curated: isDispatchCurated(scope, taskId),
    action: dispatchAction(node.agent, activeTask),
  };
}
