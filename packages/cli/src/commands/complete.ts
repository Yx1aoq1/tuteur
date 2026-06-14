import { completeNode, skipNode } from '@tuteur/core';
import type { Command } from 'commander';
import { actorSlug, emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

interface CompleteOptions {
  task?: string;
  branch?: string;
  reason?: string;
  skip?: boolean;
}

export default function registerCompleteCommand(program: Command): void {
  program
    .command('complete <node>')
    .description('Complete the current node (skill gate, or switch with --branch)')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .option('--branch <label>', 'Chosen branch for a switch node')
    .option('--reason <text>', 'Reason (required with --skip; recommended with --branch)')
    .option('--skip', 'Human override: skip the gate and advance, leaving a trace')
    .action(runComplete);
}

function runComplete(node: string, options: CompleteOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  const by = actorSlug(scope);

  if (options.skip) {
    if (!options.reason) {
      emit({ ok: false, error: '--skip requires --reason "<why>"' }, 1);
    }
    const result = skipNode(scope, taskId, node, by, options.reason);
    emit(result, result.exitCode);
  }

  const result = completeNode(scope, taskId, node, { branch: options.branch, reason: options.reason, by });
  emit(result, result.exitCode);
}
