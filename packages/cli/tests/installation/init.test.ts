import { readlinkSync, readdirSync, existsSync, mkdtempSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initProject, seedKnowledgeBase } from '../../src/installation/init.js';

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

    expect(result.installedAgents).toEqual(['codex', 'claude']);
    expect(existsSync(resolve(root, '.agent'))).toBe(false);
    expect(existsSync(resolve(root, '.gemini'))).toBe(false);
    expect(skillNames.length).toBe(6);

    for (const skillName of skillNames) {
      const canonicalSkill = resolve(canonicalRoot, skillName);
      const claudeSkill = resolve(claudeRoot, skillName);
      expect(lstatSync(canonicalSkill).isDirectory()).toBe(true);
      expect(lstatSync(canonicalSkill).isSymbolicLink()).toBe(false);
      expect(lstatSync(claudeSkill).isSymbolicLink()).toBe(true);
      expect(readlinkSync(claudeSkill)).toBe(`../../.agents/skills/${skillName}`);
    }
  });
});

describe('initProject knowledge base', () => {
  it('seeds sources/ + wiki/ + root index.md/log.md but no user/ (user/ is global-only)', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'withy-init-'));
    temporaryRoots.push(root);

    await initProject({ projectRoot: root, agents: [], skillAdapterMode: 'symlink' });

    const knowledge = resolve(root, '.withy/knowledge');
    expect(existsSync(resolve(knowledge, 'sources'))).toBe(true);
    expect(existsSync(resolve(knowledge, 'wiki'))).toBe(true);
    expect(existsSync(resolve(knowledge, 'index.md'))).toBe(true);
    expect(existsSync(resolve(knowledge, 'log.md'))).toBe(true);
    expect(existsSync(resolve(knowledge, 'user'))).toBe(false); // user/ 仅全局库
  });

  it('global seed adds user/ on top of the shared sources/wiki layout', () => {
    const withyDir = mkdtempSync(resolve(tmpdir(), 'withy-kn-global-'));
    temporaryRoots.push(withyDir);

    seedKnowledgeBase(withyDir, true, []);

    const knowledge = resolve(withyDir, 'knowledge');
    expect(existsSync(resolve(knowledge, 'sources'))).toBe(true);
    expect(existsSync(resolve(knowledge, 'wiki'))).toBe(true);
    expect(existsSync(resolve(knowledge, 'user'))).toBe(true); // 全局多一层 user/
    expect(existsSync(resolve(knowledge, 'user/.gitkeep'))).toBe(true);
  });
});
