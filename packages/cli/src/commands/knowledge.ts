import {
  rebuildKnowledgeIndexes,
  deriveMergedGraph,
  docsCoveringPath,
  readGraphCached,
  resolveGlobalScope,
  coverageForDoc,
  KnowledgeError,
  lintKnowledge,
  relatedDocs,
} from '@withy/core';
import type { Command } from 'commander';
import type { Scope } from '@withy/core';
import { emit, requireProjectScope } from '../harness/runtime.js';

export default function registerKnowledgeCommand(program: Command): void {
  const knowledge = program
    .command('knowledge')
    .description('Maintain the knowledge base (deterministic bookkeeping; retrieval stays in agent file tools)');

  knowledge
    .command('graph')
    .description('Derive the document relation graph from [[links]] and frontmatter sources')
    .option('--global', 'Operate on the global knowledge base (~/.withy)')
    .option('--merged', 'Render global + project together (cross-scope view for web)')
    .action(runGraph);

  knowledge
    .command('index')
    .description('Recompute every level index.md from page frontmatter (root catalog + wiki subdirs)')
    .option('--global', 'Operate on the global knowledge base (~/.withy)')
    .action(runIndex);

  knowledge
    .command('lint')
    .description('Mechanical health check: orphan pages, broken links, dangling injection refs')
    .option('--global', 'Operate on the global knowledge base (~/.withy)')
    .action(runLint);

  knowledge
    .command('related <id>')
    .description('Documents directly linked (in or out) to <id> via [[links]] (1 hop, deduped)')
    .option('--global', 'Operate on the global knowledge base (~/.withy)')
    .action(runRelated);

  knowledge
    .command('coverage')
    .description('Doc↔code coverage: --doc <id> lists its covers globs; --path <p> lists docs covering that path')
    .option('--doc <id>', 'Document id → its declared covers globs (verbatim)')
    .option('--path <path>', 'Repo-relative path → doc ids whose covers glob matches it')
    .option('--global', 'Operate on the global knowledge base (~/.withy)')
    .action(runCoverage);
}

interface ScopeOption {
  global?: boolean;
}

interface GraphOption extends ScopeOption {
  merged?: boolean;
}

interface CoverageOption extends ScopeOption {
  doc?: string;
  path?: string;
}

// Default scope is the current project; `--global` switches to ~/.withy (same as `init --global`).
function resolveScope(global?: boolean): Scope {
  return global ? resolveGlobalScope() : requireProjectScope();
}

function runGraph(options: GraphOption): void {
  if (options.merged) {
    const graph = deriveMergedGraph(requireProjectScope(), resolveGlobalScope());
    emit({ ok: true, scope: 'merged', nodes: graph.nodes.length, edges: graph.edges.length, graph });
  }

  const scope = resolveScope(options.global);
  const graph = readGraphCached(scope);
  emit({ ok: true, scope: scope.kind, nodes: graph.nodes.length, edges: graph.edges.length, graph });
}

function runIndex(options: ScopeOption): void {
  const scope = resolveScope(options.global);
  const written = rebuildKnowledgeIndexes(scope);
  emit({ ok: true, scope: scope.kind, written: written.length, paths: written.map(file => file.path) });
}

function runLint(options: ScopeOption): void {
  const scope = resolveScope(options.global);
  const issues = lintKnowledge(scope);
  const errors = issues.filter(issue => issue.level === 'error').length;

  emit({ ok: errors === 0, scope: scope.kind, errors, warnings: issues.length - errors, issues }, errors ? 1 : 0);
}

function runRelated(id: string, options: ScopeOption): void {
  const scope = resolveScope(options.global);
  try {
    emit({ ok: true, scope: scope.kind, id, related: relatedDocs(readGraphCached(scope), id) });
  } catch (error) {
    if (error instanceof KnowledgeError) emit({ ok: false, error: error.message }, 1);
    throw error;
  }
}

function runCoverage(options: CoverageOption): void {
  const scope = resolveScope(options.global);
  if ((options.doc === undefined) === (options.path === undefined)) {
    emit({ ok: false, error: 'pass exactly one of --doc <id> or --path <path>' }, 1);
  }

  try {
    if (options.doc !== undefined) {
      emit({ ok: true, scope: scope.kind, doc: options.doc, paths: coverageForDoc(scope, options.doc) });
    }
    emit({ ok: true, scope: scope.kind, path: options.path, docs: docsCoveringPath(scope, options.path as string) });
  } catch (error) {
    if (error instanceof KnowledgeError) emit({ ok: false, error: error.message }, 1);
    throw error;
  }
}
