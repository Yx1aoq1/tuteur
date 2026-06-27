// Knowledge module barrel — frontmatter parsing → entries/pages → graph/lint/
// indexes → CRUD write face. File I/O is delegated to the store layer; this module
// holds only domain logic. Explicit named re-exports only (no `export *`, CLAUDE.md).

export { KnowledgeError } from './errors.js';

export { readKnowledgeEntry } from './entries.js';
export type { KnowledgeEntry, InjectMode } from './entries.js';

export { listKnowledgePages } from './pages.js';
export type { KnowledgePage } from './pages.js';

export { rebuildKnowledgeIndexes, buildKnowledgeIndexes } from './indexes.js';
export type { KnowledgeIndexFile } from './indexes.js';

export { deriveKnowledgeGraph, deriveMergedGraph } from './graph.js';
export type { KnowledgeGraphNode, KnowledgeGraphEdge, KnowledgeGraph } from './graph.js';

export { docsCoveringPath, coverageForDoc, relatedDocs } from './query.js';

export { readGraphCached, writeGraphCache } from './cache.js';

export { lintKnowledge } from './lint.js';
export type { KnowledgeIssue } from './lint.js';

export {
  readKnowledgePageContent,
  createKnowledgeFolder,
  saveKnowledgePageBody,
  deleteKnowledgeEntry,
  renameKnowledgeEntry,
  createKnowledgePage,
  assertInsideKnowledge,
} from './edit.js';
export type { KnowledgePageContent } from './edit.js';
