import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initProject } from '../../src/installation/init.js';
import { getInstalledManagedTemplates } from '../../src/installation/managed-templates.js';

const temporaryRoots: string[] = [];

process.env.WITHY_QUIET = '1';

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('managed templates', () => {
  it('includes project workflow files and records their installed hashes', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'withy-managed-templates-'));
    temporaryRoots.push(root);

    await initProject({ projectRoot: root, agents: ['codex'], user: 'tester' });

    const templates = getInstalledManagedTemplates(root);
    const paths = templates.map(template => template.relativePath);
    const hashes = JSON.parse(readFileSync(resolve(root, '.withy/template-hashes.json'), 'utf8')) as Record<
      string,
      string
    >;

    expect(paths).toContain('.withy/guide.md');
    expect(paths).toContain('.withy/workflows/default.workflow.json');
    expect(paths).not.toContain('.withy/config.yaml');
    expect(paths).not.toContain('.withy/context.json');
    expect(hashes['.withy/guide.md']).toBeTypeOf('string');
    expect(hashes['.withy/workflows/default.workflow.json']).toBeTypeOf('string');

    for (const template of templates) {
      expect(readFileSync(template.absolutePath, 'utf8')).toBe(template.content);
    }
  });
});
