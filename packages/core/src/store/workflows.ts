import { type Scope, workflowPath } from '../paths.js';
import { type Workflow, WorkflowSchema } from '../types.js';
import { writeJsonFile } from '../utils/index.js';
import { readValidated, StoreError } from './errors.js';

export function readWorkflow(scope: Scope, id: string): Workflow {
  return readValidated(workflowPath(scope, id), WorkflowSchema, `workflow ${id}`);
}

/**
 * Persist a workflow graph to `workflows/<id>.workflow.json`. Schema-validates
 * before writing so a malformed edit (e.g. from the web canvas) never lands on
 * disk; structural/reference checks (connectivity, cycles, skill refs) are the
 * caller's job via {@link validateWorkflow}. core.md §4.3.
 *
 * @param scope the project scope to write into
 * @param workflow the workflow to persist (its `id` picks the file name)
 */
export function writeWorkflow(scope: Scope, workflow: Workflow): void {
  const parsed = WorkflowSchema.safeParse(workflow);
  if (!parsed.success) {
    throw new StoreError(
      `workflow ${workflow.id} failed validation:\n  ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`,
    );
  }
  writeJsonFile(workflowPath(scope, parsed.data.id), parsed.data);
}
