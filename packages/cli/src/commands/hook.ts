import { appendEvent, renderSessionStart, resolveProjectScope } from '@tuteur/core';
import type { Command } from 'commander';

export default function registerHookCommand(program: Command): void {
  program
    .command('hook <event>')
    .description('Platform hook entry (session-start). Outputs injection text for the agent.')
    .action(runHook);
}

function runHook(event: string): void {
  try {
    // kill-switch / non-interactive guard — never pollute scripted sessions.
    if (process.env.TUTEUR_HOOKS === '0') process.exit(0);

    const scope = resolveProjectScope();
    if (!scope) process.exit(0); // not a Tuteur project — silent no-op

    if (event === 'session-start') {
      const result = renderSessionStart(scope);
      process.stdout.write(result.text);
      if (result.taskId) {
        appendEvent(scope, result.taskId, {
          ts: new Date().toISOString(),
          type: 'session_start',
          injected: result.injected,
        });
      }
      process.exit(0);
    }

    // Future events (inject-workflow-state / inject-subagent-context) are no-ops for now.
    process.exit(0);
  } catch (error) {
    // Soft-fail: hooks must never block the session (Tuteur's hard gate is `ttur next`).
    process.stderr.write(`tuteur hook error: ${(error as Error).message}\n`);
    process.exit(0);
  }
}
