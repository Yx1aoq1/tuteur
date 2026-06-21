import { readFileSync } from 'node:fs';
import {
  sessionIdFromHookPayload,
  writePendingInjection,
  resolveProjectScope,
  renderUserPromptSubmit,
  resolveCurrentTask,
  renderSessionStart,
  appendEvent,
  taskExists,
  PROMPT_MAX,
} from '@withy/core';
import type { Command } from 'commander';

export default function registerHookCommand(program: Command): void {
  program
    .command('hook <event>')
    .description('Platform hook entry (session-start | user-prompt-submit). Outputs injection text for the agent.')
    .action(runHook);
}

function runHook(event: string): void {
  try {
    // kill-switch / non-interactive guard — never pollute scripted sessions.
    if (process.env.WITHY_HOOKS === '0') process.exit(0);

    const scope = resolveProjectScope();
    if (!scope) process.exit(0); // not a Withy project — silent no-op

    if (event === 'session-start') {
      const result = renderSessionStart(scope);
      process.stdout.write(result.text);

      const ts = new Date().toISOString();
      if (result.taskId) {
        // Active task → record the session_start event directly (with its snapshot).
        appendEvent(scope, result.taskId, {
          ts,
          type: 'session_start',
          injected: result.injected,
          snapshot: result.snapshot,
        });
      } else {
        // No active task yet → park the injection keyed by session id so the session
        // that goes on to create a task can backfill its own session_start. No session
        // id (unsupported platform) → skip silently; we never block the session.
        const sessionId = sessionIdFromHookPayload(readHookPayload());
        if (sessionId) {
          writePendingInjection(scope, sessionId, { ts, injected: result.injected, snapshot: result.snapshot });
        }
      }
      process.exit(0);
    }

    if (event === 'user-prompt-submit') {
      const text = renderUserPromptSubmit(scope);
      if (text) process.stdout.write(text);

      // Record the verbatim (truncated) prompt only while a task is active.
      const current = resolveCurrentTask(scope);
      if (current && 'taskId' in current && taskExists(scope, current.taskId)) {
        const prompt = readHookPayload().prompt;
        if (typeof prompt === 'string' && prompt) {
          appendEvent(scope, current.taskId, {
            ts: new Date().toISOString(),
            type: 'prompt',
            text: prompt.length > PROMPT_MAX ? `${prompt.slice(0, PROMPT_MAX)}…` : prompt,
          });
        }
      }
      process.exit(0);
    }

    // Future events (inject-workflow-state / inject-subagent-context) are no-ops for now.
    process.exit(0);
  } catch (error) {
    // Soft-fail: hooks must never block the session (Withy's hard gate is `withy next`).
    process.stderr.write(`withy hook error: ${(error as Error).message}\n`);
    process.exit(0);
  }
}

// Read the hook's stdin JSON payload (session_id / prompt / …). Returns {} when no
// payload is piped (interactive/manual run) or it is unreadable/malformed — callers
// treat missing fields as "unavailable" and degrade, never throw.
function readHookPayload(): Record<string, unknown> {
  if (process.stdin.isTTY) return {};
  try {
    const raw = readFileSync(0, 'utf8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
