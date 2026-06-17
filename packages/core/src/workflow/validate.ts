import type { WorkflowNode, ArtifactSpec, Workflow } from '../types.js';

// One validation finding. `error` means the graph is structurally broken (block
// creating tasks on it); `warning` surfaces a dangling reference that may resolve
// later (missing skill/template). harness §3/H10.
export interface WorkflowIssue {
  level: 'error' | 'warning';
  node?: string;
  message: string;
}

// Optional, fs-backed existence checks injected by the caller (CLI), so the core
// validator itself stays pure. Omitted checks are simply skipped.
export interface ValidateContext {
  skillExists?: (name: string) => boolean;
  templateExists?: (id: string) => boolean;
}

/**
 * Validate a workflow graph (core.md §4.3, harness §3). Structural problems are
 * `error`; dangling skill/template references are `warning`. Pure — fs-backed
 * checks come through `ctx`.
 *
 * @param wf the workflow to validate
 * @param ctx optional skill/template existence resolvers
 * @return all issues found (empty = valid)
 */
export function validateWorkflow(wf: Workflow, ctx: ValidateContext = {}): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];

  // Index nodes; flag duplicate ids (nodeById would silently take the first).
  const byId = new Map<string, WorkflowNode>();
  for (const node of wf.nodes) {
    if (byId.has(node.id)) issues.push({ level: 'error', node: node.id, message: `duplicate node id "${node.id}"` });
    byId.set(node.id, node);
  }

  if (!byId.has(wf.entry)) {
    issues.push({ level: 'error', message: `entry "${wf.entry}" is not a node` });
  }

  const phaseRank = phaseRanker(wf);

  for (const node of wf.nodes) {
    // Unknown phase (declared on the node but absent from wf.phases).
    if (node.phase != null && phaseRank(node.phase) === null) {
      issues.push({ level: 'warning', node: node.id, message: `node phase "${node.phase}" is not a declared phase` });
    }

    if (node.type === 'switch') {
      const defaults = node.branches.filter(branch => branch.default).length;
      if (defaults !== 1) {
        issues.push({
          level: 'error',
          node: node.id,
          message: `switch must have exactly one default branch (has ${defaults})`,
        });
      }
    } else if (ctx.skillExists && !ctx.skillExists(node.skill)) {
      issues.push({
        level: 'warning',
        node: node.id,
        message: `skill "${node.skill}" not found in project skill dirs`,
      });
    }

    // Edge targets: exist + phase-monotonic (a branch may jump phases forward).
    for (const target of outgoing(node)) {
      if (target === null) continue;
      if (!byId.has(target)) {
        issues.push({ level: 'error', node: node.id, message: `edge to unknown node "${target}"` });
        continue;
      }
      const from = phaseRank(node.phase);
      const to = phaseRank(byId.get(target)?.phase);
      if (from !== null && to !== null && to < from) {
        issues.push({ level: 'error', node: node.id, message: `edge to "${target}" moves the phase backward` });
      }
    }

    issues.push(...templateIssues(node, ctx));
  }

  // Phase entry hints: each declared phase entry should be a node in that phase.
  for (const phase of wf.phases) {
    if (!phase.entry) continue;
    const node = byId.get(phase.entry);
    if (!node) {
      issues.push({ level: 'warning', message: `phase "${phase.id}" entry "${phase.entry}" is not a node` });
    } else if (node.phase !== phase.id) {
      issues.push({
        level: 'warning',
        node: node.id,
        message: `phase "${phase.id}" entry "${phase.entry}" is not in that phase`,
      });
    }
  }

  issues.push(...cycleIssues(wf, byId));

  return issues;
}

// All outgoing edge targets of a node (skill: single `next`; switch: branches).
function outgoing(node: WorkflowNode): (string | null)[] {
  return node.type === 'switch' ? node.branches.map(branch => branch.next) : [node.next];
}

// Rank a phase: -1 for the pre-phase triage area (null), the phases[] index for a
// declared phase, or null when the phase id is unknown (caller skips the compare).
function phaseRanker(wf: Workflow): (phase: string | null | undefined) => number | null {
  const order = new Map(wf.phases.map((phase, index) => [phase.id, index]));
  return phase => {
    if (phase == null) return -1;
    return order.get(phase) ?? null;
  };
}

// Warn on object-form artifacts whose `template` knowledge id does not resolve.
function templateIssues(node: WorkflowNode, ctx: ValidateContext): WorkflowIssue[] {
  if (node.type !== 'skill' || !ctx.templateExists) return [];
  const issues: WorkflowIssue[] = [];
  for (const spec of node.gate?.artifacts ?? []) {
    const template = templateRef(spec);
    if (template && !ctx.templateExists(template)) {
      issues.push({ level: 'warning', node: node.id, message: `artifact template "${template}" not found` });
    }
  }
  return issues;
}

function templateRef(spec: ArtifactSpec): string | undefined {
  return typeof spec === 'string' ? undefined : spec.template;
}

// DFS three-colouring; a GRAY target is a back-edge = cycle (workflow must be a DAG).
function cycleIssues(wf: Workflow, byId: Map<string, WorkflowNode>): WorkflowIssue[] {
  const color = new Map<string, 0 | 1 | 2>(); // 0 white, 1 gray, 2 black
  const found = new Set<string>();

  const visit = (id: string): void => {
    const node = byId.get(id);
    if (!node) return;
    color.set(id, 1);
    for (const target of outgoing(node)) {
      if (target === null || !byId.has(target)) continue;
      const c = color.get(target) ?? 0;
      if (c === 1) found.add(target);
      else if (c === 0) visit(target);
    }
    color.set(id, 2);
  };

  for (const node of wf.nodes) {
    if ((color.get(node.id) ?? 0) === 0) visit(node.id);
  }

  return [...found].map(node => ({ level: 'error' as const, node, message: `cycle detected through node "${node}"` }));
}
