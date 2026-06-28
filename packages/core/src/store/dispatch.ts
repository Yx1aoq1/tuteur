import { existsSync } from 'node:fs';
import { type Scope, dispatchPath } from '../paths.js';
import { type DispatchConfig, DispatchConfigSchema } from '../types.js';
import { writeJsonFile } from '../utils/index.js';
import { readValidated } from './errors.js';

// ── Dispatch config (.withy/tasks/<id>/dispatch.json — flat curated reading list) ──

/** True when a task already has a dispatch.json (the seed-shell idempotency check). */
export function dispatchExists(scope: Scope, taskId: string): boolean {
  return existsSync(dispatchPath(scope, taskId));
}

/**
 * Read a task's dispatch.json, or null when absent. Subagents read the file
 * directly (design §2.3); this reader backs the relay's `curated` computation and
 * the optional curation gate.
 */
export function readDispatch(scope: Scope, taskId: string): DispatchConfig | null {
  const file = dispatchPath(scope, taskId);
  if (!existsSync(file)) return null;
  return readValidated(file, DispatchConfigSchema, 'dispatch.json');
}

/** Write a task's dispatch.json (validated). Used by seeding and web curation. */
export function writeDispatch(scope: Scope, taskId: string, config: DispatchConfig): void {
  writeJsonFile(dispatchPath(scope, taskId), DispatchConfigSchema.parse(config));
}
