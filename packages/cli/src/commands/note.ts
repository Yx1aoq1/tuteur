import { recordNote } from '@withy/core';
import type { Command } from 'commander';
import { actorSlug, emit, requireProjectScope, resolveTaskId } from '../harness/runtime.js';

interface NoteOptions {
  task?: string;
}

export default function registerNoteCommand(program: Command): void {
  program
    .command('note <summary>')
    .description('Record an AI node summary for the current node (satisfies the note gate)')
    .option('--task <id>', 'Target task (defaults to the active task)')
    .action(runNote);
}

function runNote(summary: string, options: NoteOptions): void {
  const scope = requireProjectScope();
  const taskId = resolveTaskId(scope, options.task);
  const by = actorSlug(scope);
  try {
    const node = recordNote(scope, taskId, summary, by);
    emit({ ok: true, task: taskId, node, noted: true });
  } catch (error) {
    emit({ ok: false, error: (error as Error).message }, 1);
  }
}
