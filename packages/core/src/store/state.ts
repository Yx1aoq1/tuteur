import { type Scope, taskPath } from '../paths.js';
import { type State, StateSchema } from '../types.js';
import { writeJsonFile } from '../utils/index.js';
import { readValidated } from './errors.js';
import { taskReadPath } from './tasks.js';

export function readState(scope: Scope, id: string): State {
  return readValidated(taskReadPath(scope, id, 'state.json'), StateSchema, 'state.json');
}

export function writeState(scope: Scope, state: State): void {
  writeJsonFile(taskPath(scope, state.taskId, 'state.json'), state);
}

// ── Approvals (stored inside state.json — gate input) ────────────────────────

export function isApproved(scope: Scope, taskId: string, node: string): boolean {
  return Boolean(readState(scope, taskId).approvals[node]);
}
