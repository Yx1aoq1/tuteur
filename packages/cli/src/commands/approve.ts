import { approveCurrentNode } from '@tuteur/core';
import type { Command } from 'commander';
import { actorSlug, emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

interface ApproveOptions {
  task?: string;
}

export default function registerApproveCommand(program: Command): void {
  program
    .command('approve')
    .description('Record human approval for the current node (gate.approval)')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action(runApprove);
}

function runApprove(options: ApproveOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  const by = actorSlug(scope);
  if (!by) {
    emit({ ok: false, error: 'no developer identity — run `ttur init -u <name>` first' }, 1);
  }
  try {
    const state = approveCurrentNode(scope, taskId, by);
    emit({ ok: true, task: taskId, node: state.currentNode, approved: true });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}
