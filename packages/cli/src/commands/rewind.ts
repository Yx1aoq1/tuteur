import { rewindTo } from '@tuteur/core';
import type { Command } from 'commander';
import { actorSlug, emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

interface RewindOptions {
  task?: string;
  reason?: string;
}

export default function registerRewindCommand(program: Command): void {
  program
    .command('rewind <node>')
    .description('Rewind the cursor back to a node (switch misjudge recovery)')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .option('--reason <text>', 'Why the rewind is needed')
    .action(runRewind);
}

function runRewind(node: string, options: RewindOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  try {
    const state = rewindTo(scope, taskId, node, actorSlug(scope), options.reason);
    emit({ ok: true, task: taskId, node: state.currentNode, completed: state.completedNodes });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}
