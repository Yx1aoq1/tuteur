import { rewindTo } from '@withy/core';
import type { Command } from 'commander';
import { actorSlug, emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

interface RewindOptions {
  to: string;
  task?: string;
  reason?: string;
}

export default function registerRewindCommand(program: Command): void {
  program
    .command('rewind')
    .description('Rewind the cursor back to a node (switch misjudge recovery)')
    .requiredOption('--to <node>', 'Target node to rewind the cursor to')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .option('--reason <text>', 'Why the rewind is needed')
    .action(runRewind);
}

function runRewind(options: RewindOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  try {
    const state = rewindTo(scope, taskId, options.to, actorSlug(scope), options.reason);
    emit({ ok: true, task: taskId, node: state.currentNode, completed: state.completedNodes });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}
