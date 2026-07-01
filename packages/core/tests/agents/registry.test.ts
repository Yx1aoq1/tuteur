import { describe, expect, it } from 'vitest';
import { getProjectSkillDirs, getGlobalSkillDirs, AGENT_PLATFORMS } from '../../src/agents/registry.js';

describe('agent skill directories', () => {
  it('registers the supported Codex, Claude, and opencode agents', () => {
    expect(Object.keys(AGENT_PLATFORMS)).toEqual(['codex', 'claude', 'opencode']);
  });

  it('uses the canonical Agent Skills directory directly for Codex', () => {
    expect(AGENT_PLATFORMS.codex).toMatchObject({
      skillTarget: null,
      skillDirs: {
        project: ['.agents/skills'],
        global: ['.agents/skills'],
      },
    });
  });

  it('includes canonical and agent-specific directories in discovery', () => {
    expect(getProjectSkillDirs()).toEqual(
      expect.arrayContaining(['.agents/skills', '.claude/skills', '.opencode/skills']),
    );
    expect(getProjectSkillDirs()).not.toContain('.agent/skill');
    expect(getGlobalSkillDirs()).toEqual(
      expect.arrayContaining(['.agents/skills', '.claude/skills', '.opencode/skills']),
    );
  });
});
