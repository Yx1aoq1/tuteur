import { strict as assert } from 'node:assert';
import { readlinkSync, readdirSync, existsSync, mkdtempSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { initProject } from './init.js';

const temporaryRoots: string[] = [];

process.env.WITHY_QUIET = '1';

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('initProject agent skills', () => {
  it('creates canonical copies and Claude links without creating legacy agent directories', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'withy-init-'));
    temporaryRoots.push(root);

    const result = await initProject({
      projectRoot: root,
      agents: ['codex', 'claude'],
      skillAdapterMode: 'symlink',
      user: 'tester',
    });

    const canonicalRoot = resolve(root, '.agents/skills');
    const claudeRoot = resolve(root, '.claude/skills');
    const skillNames = readdirSync(canonicalRoot).filter(name => name.startsWith('withy-'));

    assert.deepEqual(result.installedAgents, ['codex', 'claude']);
    assert.equal(existsSync(resolve(root, '.agent')), false);
    assert.equal(existsSync(resolve(root, '.gemini')), false);
    assert.equal(skillNames.length, 6);

    for (const skillName of skillNames) {
      const canonicalSkill = resolve(canonicalRoot, skillName);
      const claudeSkill = resolve(claudeRoot, skillName);
      assert.equal(lstatSync(canonicalSkill).isDirectory(), true);
      assert.equal(lstatSync(canonicalSkill).isSymbolicLink(), false);
      assert.equal(lstatSync(claudeSkill).isSymbolicLink(), true);
      assert.equal(readlinkSync(claudeSkill), `../../.agents/skills/${skillName}`);
    }
  });
});
