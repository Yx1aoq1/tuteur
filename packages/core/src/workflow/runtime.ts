import { spawnSync } from 'node:child_process';
import { type Scope, taskPath } from '../paths.js';
import {
  clearCurrentTaskPointer,
  readWorkflow,
  appendEvent,
  isApproved,
  writeState,
  readState,
  writeTask,
  readTask,
} from '../store.js';
import { existsNonEmpty, nowIso } from '../utils/index.js';
import {
  approveState,
  describeNext,
  deriveStatus,
  rewindState,
  gateGuardId,
  stepWorkflow,
  nodeById,
} from './interpret.js';
import { evaluateGate } from './gate.js';
import type { StepResult, NextStep, WorkflowAction } from './interpret.js';
import type { GateContext } from './gate.js';
import type { GuardReport } from './engine.js';
import type { State, Task, Workflow, SkillNode } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────
// IO shell over the state machine. Loads `.withy/`, computes the current node's
// gate result (the only IO the pure step needs), drives `stepWorkflow`, then
// persists the returned state + events. No transition/branch/gate *logic* lives
// here — that's engine.ts (mechanics), interpret.ts (Withy policy), gate.ts
// (checkers). This file only does fs/spawn + bookkeeping.
// ──────────────────────────────────────────────────────────────────────────

export interface NextResult {
  ok: boolean;
  exitCode: 0 | 2;
  node: string | null;
  done?: string;
  blocked?: string[];
  needsBranch?: boolean;
  branches?: { label: string; criteria?: string; default?: boolean }[];
  nextAction?: string;
  next?: NextStep;
  state?: State;
}

export interface NextOptions {
  branch?: string;
  reason?: string;
  by?: string;
}

/**
 * The sole agent-facing advance gate (`withy next`). Reads `state.currentNode` —
 * the caller never names a node. For a skill node we evaluate its gate (fs/checks/
 * approval) into a guard report and hand it to the pure `stepWorkflow`; switch
 * routing is decided in interpret.ts over the generic engine. harness §2.
 */
export function nextNode(scope: Scope, taskId: string, opts: NextOptions = {}): NextResult {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);

  if (state.currentNode === null) return { ok: true, exitCode: 0, node: null, next: describeNext(wf, state) };

  const node = nodeById(wf, state.currentNode);
  const action: WorkflowAction = opts.branch
    ? { kind: 'branch', label: opts.branch, reason: opts.reason, by: opts.by }
    : { kind: 'advance' };
  const guards = node?.type === 'skill' ? skillGuards(scope, taskId, node) : {};

  return persist(scope, taskId, task, wf, stepWorkflow(wf, state, action, guards));
}

/** Explicit human skip — bypass the current node's gate, advance, leave a trace. harness §2.4 */
export function skipNode(scope: Scope, taskId: string, by: string | undefined, reason: string): NextResult {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);

  if (state.currentNode === null) return { ok: true, exitCode: 0, node: null, next: describeNext(wf, state) };

  return persist(scope, taskId, task, wf, stepWorkflow(wf, state, { kind: 'skip', by, reason }));
}

// Evaluate the current skill node's gate into a guard report keyed for the engine.
function skillGuards(scope: Scope, taskId: string, node: SkillNode): GuardReport {
  const ctx: GateContext = {
    artifactExists: rel => existsNonEmpty(taskPath(scope, taskId, rel)),
    runCheck: cmd => runCommand(cmd, scope.root),
    isApproved: () => isApproved(scope, taskId, node.id),
  };
  return { [gateGuardId(node.id)]: evaluateGate(node, ctx) };
}

// Append the step's events, persist its state on success, map to a NextResult.
function persist(scope: Scope, taskId: string, task: Task, wf: Workflow, result: StepResult): NextResult {
  for (const event of result.events) appendEvent(scope, taskId, event);

  if (result.ok && result.state) {
    writeState(scope, result.state);
    syncTaskStatus(scope, task, wf, result.state);
    return {
      ok: true,
      exitCode: 0,
      node: result.node,
      done: result.done,
      next: describeNext(wf, result.state),
      state: result.state,
    };
  }

  return {
    ok: false,
    exitCode: 2,
    node: result.node,
    blocked: result.blocked,
    needsBranch: result.needsBranch,
    branches: result.branches,
    nextAction: result.nextAction,
  };
}

// ── rewind (switch misjudge recovery) ────────────────────────────────────────

export function rewindTo(scope: Scope, taskId: string, nodeId: string, by?: string, reason?: string): State {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);

  const next = rewindState(wf, state, nodeId); // throws on unknown node
  writeState(scope, next);
  syncTaskStatus(scope, task, wf, next);
  appendEvent(scope, taskId, { ts: nowIso(), type: 'rewind', node: nodeId, by, reason });
  return next;
}

// ── approve (human gate input; agent or web may write — harness §2.6) ─────────

export function approveCurrentNode(scope: Scope, taskId: string, by: string): State {
  const state = readState(scope, taskId);
  if (state.currentNode === null) throw new Error(`task "${taskId}" has no current node to approve`);

  const next = approveState(state, by);
  writeState(scope, next);
  appendEvent(scope, taskId, { ts: nowIso(), type: 'approval', node: state.currentNode, by });
  return next;
}

// ── Task status sync + pointer cleanup ───────────────────────────────────────

function syncTaskStatus(scope: Scope, task: Task, wf: Workflow, state: State): void {
  const status = deriveStatus(wf, state.currentNode);
  const completedAt = status === 'completed' ? (task.completedAt ?? nowIso()) : null;
  if (status !== task.status || completedAt !== task.completedAt) {
    writeTask(scope, { ...task, status, completedAt });
  }
  if (state.currentNode === null) clearCurrentTaskPointer(scope); // workflow done → drop pointer
}

// ── small utils ──────────────────────────────────────────────────────────────

function runCommand(cmd: string, cwd: string): { code: number; output: string } {
  const result = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { code: result.status ?? 1, output };
}
