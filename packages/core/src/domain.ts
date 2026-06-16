import { spawnSync } from 'node:child_process';
import { DEFAULT_STUCK_THRESHOLD, PHASE_PLANNING } from './constants.js';
import { type Scope, archiveDir, taskPath, taskDir } from './paths.js';
import {
  clearCurrentTaskPointer,
  readCurrentTaskPointer,
  readChecklist,
  readWorkflow,
  appendEvent,
  isApproved,
  readEvents,
  taskExists,
  writeState,
  listTasks,
  readState,
  writeTask,
  readTask,
} from './store.js';
import { existsNonEmpty, moveDir, nowIso } from './utils/index.js';
import type { ArtifactSpec, State, Task, TaskStatus, Workflow, WorkflowNode } from './types.js';

// ── Node helpers ─────────────────────────────────────────────────────────────

export function nodeById(wf: Workflow, id: string): WorkflowNode | undefined {
  return wf.nodes.find(n => n.id === id);
}

/** The path a gate checks for an artifact spec (bare path, or the `path` field). */
export function artifactPath(spec: ArtifactSpec): string {
  return typeof spec === 'string' ? spec : spec.path;
}

/** A node's phase membership (the container it lives in); null = pre-phase triage. */
export function phaseOf(wf: Workflow, nodeId: string | null): string | null {
  if (!nodeId) return null;
  return nodeById(wf, nodeId)?.phase ?? null;
}

/** Macro task status derived from the current node's phase container. */
export function deriveStatus(wf: Workflow, currentNode: string | null): TaskStatus {
  if (currentNode === null) return 'completed';
  const phase = phaseOf(wf, currentNode);
  if (phase === null || phase === PHASE_PLANNING) return 'planning';
  return 'in_progress';
}

// ── advanceWorkflow (pure) ───────────────────────────────────────────────────

/**
 * Complete the current node and move the cursor one hop. skill → `next`;
 * switch → the chosen branch's `next` (branch label validated by completeNode).
 * Switches are *not* auto-evaluated: landing on one stops there. harness §3.
 */
export function advanceWorkflow(state: State, wf: Workflow, branch?: string): State {
  const node = nodeById(wf, state.currentNode ?? '');
  if (!node) throw new Error(`advanceWorkflow: unknown node "${state.currentNode}"`);

  const completedNodes = state.completedNodes.includes(node.id)
    ? state.completedNodes
    : [...state.completedNodes, node.id];

  let nextId: string | null;
  if (node.type === 'switch') {
    const chosen = node.branches.find(b => b.label === branch) ?? node.branches.find(b => b.default);
    if (!chosen) throw new Error(`advanceWorkflow: switch "${node.id}" has no matching branch and no default`);
    nextId = chosen.next;
  } else {
    nextId = node.next;
  }

  return { ...state, currentNode: nextId, completedNodes, updatedAt: nowIso() };
}

export function initialState(wf: Workflow): State {
  return { taskId: '', currentNode: wf.entry, completedNodes: [], decisions: {}, approvals: {}, updatedAt: nowIso() };
}

// ── completeNode (gate) ──────────────────────────────────────────────────────

export interface NextStep {
  node: string | null;
  type?: 'skill' | 'switch';
  skill?: string;
  phase?: string | null;
  branches?: { label: string; criteria?: string; default?: boolean }[];
  message?: string;
}

export interface CompleteResult {
  ok: boolean;
  exitCode: 0 | 2;
  node: string;
  done?: string;
  blocked?: string[];
  next?: NextStep;
  state?: State;
}

export interface CompleteOptions {
  branch?: string;
  reason?: string;
  by?: string;
}

export function completeNode(scope: Scope, taskId: string, nodeId: string, opts: CompleteOptions = {}): CompleteResult {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);
  const node = nodeById(wf, nodeId);

  const reject = (reasons: string[]): CompleteResult => {
    appendEvent(scope, taskId, {
      ts: nowIso(),
      type: 'complete_attempt',
      node: nodeId,
      ok: false,
      reason: reasons.join('; '),
    });
    return { ok: false, exitCode: 2, node: nodeId, blocked: reasons };
  };

  if (!node) return reject([`"${nodeId}" is not a node in workflow "${wf.id}"`]);
  if (state.currentNode !== nodeId) return reject([`current node is "${state.currentNode}", not "${nodeId}"`]);

  let nextState: State;

  if (node.type === 'switch') {
    const branch = node.branches.find(b => b.label === opts.branch);
    if (!opts.branch || !branch) {
      const labels = node.branches.map(b => b.label).join(' | ');
      return reject([`switch "${nodeId}" needs --branch <${labels}>`]);
    }
    nextState = advanceWorkflow(state, wf, branch.label);
    nextState.decisions = {
      ...state.decisions,
      [nodeId]: { branch: branch.label, reason: opts.reason, by: opts.by, at: nowIso() },
    };
    appendEvent(scope, taskId, {
      ts: nowIso(),
      type: 'decision',
      node: nodeId,
      branch: branch.label,
      reason: opts.reason,
      by: opts.by,
    });
  } else {
    const gate = node.gate ?? {};
    const blocked: string[] = [];

    for (const spec of gate.artifacts ?? []) {
      const rel = artifactPath(spec);
      if (!existsNonEmpty(taskPath(scope, taskId, rel))) blocked.push(`missing or empty artifact: ${rel}`);
    }
    for (const cmd of gate.checks ?? []) {
      const { code, output } = runCommand(cmd, scope.root);
      if (code !== 0) blocked.push(`check failed (exit ${code}): ${cmd}\n${tail(output)}`);
    }
    if (gate.approval && !isApproved(scope, taskId, nodeId)) {
      blocked.push(`needs approval: run "ttur approve ${nodeId}"`);
    }
    if (blocked.length) return reject(blocked);

    nextState = advanceWorkflow(state, wf);
    appendEvent(scope, taskId, { ts: nowIso(), type: 'complete_attempt', node: nodeId, ok: true });
  }

  writeState(scope, nextState);
  syncTaskStatus(scope, task, wf, nextState);

  return { ok: true, exitCode: 0, node: nodeId, done: nodeId, next: describeNext(wf, nextState), state: nextState };
}

/** Explicit human skip — bypass the gate, advance, leave a trace. harness §2.4 */
export function skipNode(
  scope: Scope,
  taskId: string,
  nodeId: string,
  by: string | undefined,
  reason: string,
): CompleteResult {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);
  const node = nodeById(wf, nodeId);
  if (!node) return { ok: false, exitCode: 2, node: nodeId, blocked: [`"${nodeId}" is not a node`] };
  if (state.currentNode !== nodeId)
    return { ok: false, exitCode: 2, node: nodeId, blocked: [`current node is "${state.currentNode}"`] };

  // A switch with no branch given advances via its default.
  const nextState = advanceWorkflow(state, wf);
  writeState(scope, nextState);
  syncTaskStatus(scope, task, wf, nextState);
  appendEvent(scope, taskId, { ts: nowIso(), type: 'skip', node: nodeId, by, reason });
  return { ok: true, exitCode: 0, node: nodeId, done: nodeId, next: describeNext(wf, nextState), state: nextState };
}

// ── rewind (switch misjudge recovery) ────────────────────────────────────────

export function rewindTo(scope: Scope, taskId: string, nodeId: string, by?: string, reason?: string): State {
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);
  if (!nodeById(wf, nodeId)) throw new Error(`rewind: unknown node "${nodeId}"`);

  // Clear the target + everything completed after it, restore cursor to it.
  const idx = state.completedNodes.indexOf(nodeId);
  const completedNodes = idx === -1 ? state.completedNodes : state.completedNodes.slice(0, idx);
  const decisions = { ...state.decisions };
  delete decisions[nodeId];

  // Drop approvals for the rewound node and anything downstream of it.
  const approvals = Object.fromEntries(
    Object.entries(state.approvals).filter(([node]) => completedNodes.includes(node)),
  );

  const next: State = { ...state, currentNode: nodeId, completedNodes, decisions, approvals, updatedAt: nowIso() };
  writeState(scope, next);
  syncTaskStatus(scope, task, wf, next);
  appendEvent(scope, taskId, { ts: nowIso(), type: 'rewind', node: nodeId, by, reason });
  return next;
}

// ── approve (human gate input; agent or web may write — harness §2.6) ─────────

export function approveNode(scope: Scope, taskId: string, nodeId: string, by: string): State {
  const state = readState(scope, taskId);
  const next: State = {
    ...state,
    approvals: { ...state.approvals, [nodeId]: { approvedAt: nowIso(), by } },
    updatedAt: nowIso(),
  };

  writeState(scope, next);
  appendEvent(scope, taskId, { ts: nowIso(), type: 'approval', node: nodeId, by });
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

// ── Current-task resolution (harness §7.1) ───────────────────────────────────

export type CurrentTask = { taskId: string } | { stale: string } | { ambiguous: string[] } | null;

export function resolveCurrentTask(scope: Scope, explicit?: string): CurrentTask {
  if (explicit) return { taskId: explicit };

  const pointer = readCurrentTaskPointer(scope);
  if (pointer) return taskExists(scope, pointer) ? { taskId: pointer } : { stale: pointer };

  const open = listTasks(scope).filter(t => t.status === 'planning' || t.status === 'in_progress');
  if (open.length === 1) return { taskId: open[0].id };
  if (open.length > 1) return { ambiguous: open.map(t => t.id) };
  return null;
}

// ── Archive (core §9) ────────────────────────────────────────────────────────

export interface ArchiveOptions {
  markCancelled?: boolean;
}

export function archiveTask(scope: Scope, taskId: string, options: ArchiveOptions = {}): void {
  const task = readTask(scope, taskId);
  if (task.archivedAt) throw new Error(`task "${taskId}" is already archived`);

  const archivedAt = nowIso();
  const status = options.markCancelled ? 'cancelled' : task.status;
  writeTask(scope, { ...task, status, archivedAt });

  const bucket = archivedAt.slice(0, 7); // YYYY-MM
  moveDir(taskDir(scope, taskId), `${archiveDir(scope)}/${bucket}/${taskId}`);

  if (readCurrentTaskPointer(scope) === taskId) clearCurrentTaskPointer(scope);
}

// ── Stuck alarm (derived from events; never auto-passes — core §4.4) ──────────

export function countConsecutiveFailures(scope: Scope, taskId: string, node: string): number {
  let count = 0;
  for (const event of readEvents(scope, taskId)) {
    if (event.type === 'rewind' && event.node === node) count = 0;
    if (event.type === 'complete_attempt' && event.node === node) {
      count = event.ok ? 0 : count + 1;
    }
  }
  return count;
}

export function isStuck(scope: Scope, taskId: string, node: string, threshold = DEFAULT_STUCK_THRESHOLD): boolean {
  return countConsecutiveFailures(scope, taskId, node) >= threshold;
}

// ── Checklist progress (derived; web third tier + cross-task stats — §4.7) ─────

export function checklistProgress(scope: Scope, taskId: string): { done: number; total: number } {
  const { items } = readChecklist(scope, taskId);
  return { done: items.filter(item => item.done).length, total: items.length };
}

// ── Next-step rendering (agent-facing relay) ──────────────────────────────────

export function describeNext(wf: Workflow, state: State): NextStep {
  if (state.currentNode === null) {
    return { node: null, message: 'workflow complete — run "ttur task archive <id>"' };
  }
  const node = nodeById(wf, state.currentNode);
  if (!node) return { node: state.currentNode, message: 'unknown node' };
  if (node.type === 'switch') {
    return {
      node: node.id,
      type: 'switch',
      phase: node.phase ?? null,
      branches: node.branches.map(b => ({ label: b.label, criteria: b.criteria, default: b.default })),
    };
  }
  return { node: node.id, type: 'skill', skill: node.skill, phase: node.phase ?? null };
}

// ── small utils ──────────────────────────────────────────────────────────────

function runCommand(cmd: string, cwd: string): { code: number; output: string } {
  const result = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { code: result.status ?? 1, output };
}

function tail(text: string, lines = 10): string {
  return text.split('\n').slice(-lines).join('\n').trim();
}
