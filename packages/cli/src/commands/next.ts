import { nextNode, skipNode } from '@withy/core';
import type { Command } from 'commander';
import { actorSlug, emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

interface NextOptions {
  task?: string;
  branch?: string;
  reason?: string;
  skip?: boolean;
}

export default function registerNextCommand(program: Command): void {
  program
    .command('next')
    .description('Advance the current node (skill gate, or switch with --branch); reads state.currentNode')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .option('--branch <label>', 'Chosen branch for a switch node')
    .option('--reason <text>', 'Reason (required with --skip; recommended with --branch)')
    .option('--skip', 'Human override: skip the current gate and advance, leaving a trace')
    .action(runNext);
}

function runNext(options: NextOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  const by = actorSlug(scope);

  if (options.skip) {
    if (!options.reason) {
      emit({ ok: false, error: '--skip requires --reason "<why>"' }, 1);
    }
    const result = skipNode(scope, taskId, by, options.reason);
    emit(result, result.exitCode);
  }

  const result = nextNode(scope, taskId, { branch: options.branch, reason: options.reason, by });
  emit(result, result.exitCode);
}
