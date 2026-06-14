import { resolvePlannedContext } from './context.js';
import { nodeById, resolveCurrentTask } from './domain.js';
import { readContextConfig, readDeveloper, readState, readTask, readWorkflow } from './store.js';
import type { Scope } from './paths.js';

export interface SessionStartResult {
  text: string;
  injected: string[];
  /** Non-null only when a concrete active task was resolved (caller writes the session_start event). */
  taskId: string | null;
}

/**
 * Build the SessionStart injection (harness §6.4). Multi-state Next-Action machine.
 * The caller (cli hook command) prints `text`, then appends a session_start event
 * when `taskId` is non-null.
 */
export function renderSessionStart(scope: Scope): SessionStartResult {
  const out: string[] = ['# Tuteur workflow context', ''];
  const developer = readDeveloper(scope);
  if (developer) out.push(`- Developer: ${developer.name} (${developer.slug})`);

  const current = resolveCurrentTask(scope);

  if (current === null) {
    out.push('- NO ACTIVE TASK · Next-Action: describe your goal and I will run `ttur task create "<title>"`');
    return { text: out.join('\n') + '\n', injected: [], taskId: null };
  }
  if ('ambiguous' in current) {
    out.push(`- AMBIGUOUS: multiple open tasks (${current.ambiguous.join(', ')})`);
    out.push('- Next-Action: `ttur task start <id>` to pick one, or create a new task');
    return { text: out.join('\n') + '\n', injected: [], taskId: null };
  }
  if ('stale' in current) {
    out.push(`- STALE POINTER: current-task points at "${current.stale}" which no longer exists`);
    out.push('- Next-Action: `ttur task start <id>` to reset');
    return { text: out.join('\n') + '\n', injected: [], taskId: null };
  }

  const taskId = current.taskId;
  const task = readTask(scope, taskId);
  const wf = readWorkflow(scope, task.workflow);
  const state = readState(scope, taskId);
  const node = state.currentNode ? nodeById(wf, state.currentNode) : null;
  const planned = state.currentNode
    ? resolvePlannedContext(scope, taskId, state.currentNode)
    : readContextConfig(scope).default.required;

  out.push(`- Task ${taskId}: ${task.title}`);
  out.push(`- Status ${task.status} · Node ${state.currentNode ?? '(done)'} · Phase ${node?.phase ?? '-'}`);
  out.push(`- Completed: ${state.completedNodes.join(', ') || '(none)'}`);

  if (state.currentNode === null) {
    out.push('- COMPLETED · Next-Action: `ttur task archive ' + taskId + '`');
  } else if (node?.type === 'switch') {
    out.push('- DECISION POINT — choose one:');
    for (const b of node.branches) {
      out.push(`    · ${b.label}${b.default ? ' (default)' : ''}${b.criteria ? ` — ${b.criteria}` : ''}`);
    }
    out.push(`- Next-Action: \`ttur complete ${state.currentNode} --branch <label> --reason "..."\``);
  } else {
    out.push(`- Next-Action: \`ttur complete ${state.currentNode}\``);
  }

  if (planned.length) {
    out.push('', '## Required context', ...planned.map(p => `- ${p}`));
  }

  return { text: out.join('\n') + '\n', injected: planned, taskId };
}
