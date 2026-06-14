import { readContextConfig } from './store.js';
import type { Scope } from './paths.js';

/**
 * Planned injection list for a node (harness §4 / knowledge.md §7).
 * MVP merge: project `default` + per-node overrides, minus `disabled`.
 * Global/knowledge layering is a follow-up (knowledge.md).
 */
export function resolvePlannedContext(scope: Scope, _taskId: string, nodeId: string): string[] {
  const config = readContextConfig(scope);
  const nodeSet = config.nodes[nodeId];

  const disabled = new Set([...config.default.disabled, ...(nodeSet?.disabled ?? [])]);
  const merged = [
    ...config.default.required,
    ...config.default.optional,
    ...(nodeSet?.required ?? []),
    ...(nodeSet?.optional ?? []),
  ];

  const seen = new Set<string>();
  return merged.filter(id => !disabled.has(id) && !seen.has(id) && seen.add(id));
}
