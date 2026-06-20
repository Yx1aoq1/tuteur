import { readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type Scope, guidePath } from '../paths.js';
import {
  type ContextConfig,
  type ImplementationPlan,
  type Developer,
  ContextConfigSchema,
  DeveloperSchema,
} from '../types.js';
import { readTextFileIfExists, existsNonEmpty } from '../utils/index.js';
import { readValidated } from './errors.js';
import { taskReadPath } from './tasks.js';

// ── Implementation plan (tasks/<id>/implement.md — agent-maintained, §4.7) ──

export function readImplementation(scope: Scope, taskId: string): ImplementationPlan {
  const content = readTextFileIfExists(taskReadPath(scope, taskId, 'implement.md'));
  if (content === null) return { items: [], unparsed: 0 };

  const items: ImplementationPlan['items'] = [];
  let unparsed = 0;
  for (const [index, line] of content.split('\n').entries()) {
    const checkbox = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (checkbox) {
      items.push({ id: `line-${index + 1}`, text: checkbox[2], done: checkbox[1].toLowerCase() === 'x' });
    } else if (/^\s*[-*+]\s+/.test(line)) {
      unparsed += 1;
    }
  }
  return { items, unparsed };
}

// ── Task artifacts (tasks/<id>/*.md — agent-authored planning docs) ──────────

/**
 * List a task's existing planning artifacts: the non-empty Markdown files in the
 * task directory. Runtime state (task.json/state.json/events.jsonl) is JSON/JSONL
 * and is excluded by construction, so callers get only authored documents.
 * @param scope Resolved project scope.
 * @param id Task id (archived tasks are resolved via the same fallback as reads).
 */
export function listTaskArtifacts(scope: Scope, id: string): string[] {
  const dir = dirname(taskReadPath(scope, id, 'task.json'));
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter(
      entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md') && existsNonEmpty(resolve(dir, entry.name)),
    )
    .map(entry => entry.name)
    .sort();
}

// ── Context config (.withy/context.json — default injection plan) ────────────

export function readContextConfig(scope: Scope): ContextConfig {
  const file = resolve(scope.withyDir, 'context.json');
  if (!existsSync(file)) return ContextConfigSchema.parse({});
  return readValidated(file, ContextConfigSchema, 'context.json');
}

// ── Session guide (.withy/guide.md — tool-level intro, injected verbatim) ───

export function readGuide(scope: Scope): string | null {
  return readTextFileIfExists(guidePath(scope));
}

// ── Developer identity (.withy/.developer — local, gitignored) ───────────────

export function readDeveloper(scope: Scope): Developer | null {
  const file = resolve(scope.withyDir, '.developer');
  if (!existsSync(file)) return null;
  return readValidated(file, DeveloperSchema, '.developer');
}
