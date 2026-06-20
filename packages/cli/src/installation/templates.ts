import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, readTextFile } from '@withy/core';
import { PRODUCT_DISPLAY_NAME, PROJECT_DIR_NAME } from '../constants/product.js';
import type { Workflow } from '@withy/core';

// Bundled CLI template root copied into dist during build
export const TEMPLATES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../templates');

/**
 * Read a bundled template and replace its text tokens.
 *
 * @param relativePath path relative to the bundled template root
 * @param tokens token-to-value replacements
 *
 * @example
 * renderTemplate('workflow/guide.md', { '{{PRODUCT_NAME}}': 'Withy' });
 */
export function renderTemplate(relativePath: string, tokens: Record<string, string> = {}): string {
  let content = readTextFile(resolve(TEMPLATES_ROOT, relativePath));

  for (const [token, value] of Object.entries(tokens)) {
    content = content.replaceAll(token, value);
  }

  return content;
}

// Parsed default workflow used by init
export const DEFAULT_WORKFLOW = readJsonFile(resolve(TEMPLATES_ROOT, 'workflow/workflow.json')) as Workflow;

// Canonical serialized workflow used by managed-template comparison
export const DEFAULT_WORKFLOW_CONTENT = `${JSON.stringify(DEFAULT_WORKFLOW, null, 2)}\n`;

// Rendered session guide shared by init and update
export const GUIDE_TEMPLATE = renderTemplate('workflow/guide.md', {
  '{{PRODUCT_NAME}}': PRODUCT_DISPLAY_NAME,
  '{{PROJECT_DIR}}': PROJECT_DIR_NAME,
});
