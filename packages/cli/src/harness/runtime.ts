import { resolveCurrentTask, resolveProjectScope, taskExists, readDeveloper, type Scope } from '@tuteur/core';

/** Print a single JSON object and exit with the given code. Commands are agent-facing. */
export function emit(result: unknown, exitCode = 0): never {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(exitCode);
}

/** Resolve the project scope or emit an error and exit. */
export function requireProjectScope(): Scope {
  const scope = resolveProjectScope();
  if (!scope) {
    emit({ ok: false, error: 'not a Tuteur project — run `ttur init` first' }, 1);
  }
  return scope;
}

/** Resolve the active task id (--task > pointer > unique open), or emit a typed error. */
export function resolveTaskId(scope: Scope, explicit?: string): string {
  const current = resolveCurrentTask(scope, explicit);
  if (current === null) {
    emit({ ok: false, error: 'no active task — create one or pass --task <id>' }, 1);
  }
  if ('ambiguous' in current) {
    emit(
      {
        ok: false,
        error: 'multiple open tasks — pass --task <id> or run `ttur task start <id>`',
        tasks: current.ambiguous,
      },
      1,
    );
  }
  if ('stale' in current) {
    emit({ ok: false, error: `current-task pointer is stale (${current.stale}) — run \`ttur task start <id>\`` }, 1);
  }
  if (!taskExists(scope, current.taskId)) {
    emit({ ok: false, error: `task not found: ${current.taskId}` }, 1);
  }
  return current.taskId;
}

/** Current developer slug, used as the `by` actor for decisions/approvals/skips. */
export function actorSlug(scope: Scope): string | undefined {
  return readDeveloper(scope)?.slug;
}

/** `<MM-DD>-<slug>` task id (core §4.1). */
export function makeTaskId(title: string, date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${slugify(title)}`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'task';
}
