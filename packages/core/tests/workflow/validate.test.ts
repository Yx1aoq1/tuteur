import { describe, expect, it } from 'vitest';
import { validateWorkflow } from '../../src/workflow/validate.js';
import { SkillNodeSchema, SwitchNodeSchema } from '../../src/types.js';
import type { Workflow } from '../../src/types.js';

describe('node agent field (schema)', () => {
  it('parses an optional agent on a skill node', () => {
    const node = SkillNodeSchema.parse({
      id: 'check',
      type: 'skill',
      skill: 'withy-check',
      agent: 'review',
      next: null,
    });
    expect(node.agent).toBe('review');
  });

  it('leaves agent undefined when omitted', () => {
    const node = SkillNodeSchema.parse({ id: 'dev', type: 'skill', skill: 'withy-dev', next: null });
    expect(node.agent).toBeUndefined();
  });

  it('switch nodes carry no agent field', () => {
    const node = SwitchNodeSchema.parse({
      id: 'triage',
      type: 'switch',
      branches: [{ label: 'a', next: null, default: true }],
      // an agent key on a switch is not part of the schema and is dropped
      agent: 'review',
    });
    expect('agent' in node).toBe(false);
  });
});

describe('validateWorkflow — agentExists', () => {
  const wf: Workflow = {
    id: 'test',
    entry: 'dev',
    phases: [{ id: 'execute' }],
    nodes: [
      { id: 'dev', type: 'skill', skill: 'withy-dev', agent: 'implement', phase: 'execute', next: 'check' },
      { id: 'check', type: 'skill', skill: 'withy-check', agent: 'ghost', phase: 'execute', next: null },
    ],
  };

  it('warns (does not block) on a dangling node agent', () => {
    const issues = validateWorkflow(wf, { agentExists: name => name === 'implement' });
    const agentIssues = issues.filter(i => i.message.includes('agent'));
    expect(agentIssues).toEqual([
      { level: 'warning', node: 'check', message: 'agent "ghost" not found in agent definitions' },
    ]);
    expect(agentIssues.every(i => i.level === 'warning')).toBe(true);
  });

  it('skips the agent check when no resolver is injected', () => {
    const issues = validateWorkflow(wf);
    expect(issues.some(i => i.message.includes('agent'))).toBe(false);
  });
});

describe('validateWorkflow — engine warning', () => {
  const wf: Workflow = {
    id: 'test',
    entry: 'dev',
    phases: [{ id: 'execute' }],
    nodes: [
      { id: 'dev', type: 'skill', skill: 'withy-dev', agent: 'implement', phase: 'execute', next: 'check' },
      { id: 'check', type: 'skill', skill: 'withy-check', agent: 'review', phase: 'execute', next: 'inherit' },
      { id: 'inherit', type: 'skill', skill: 'withy-finish', agent: 'plan', phase: 'execute', next: null },
    ],
  };
  // implement→claude (available), review→foo (unknown), plan→undefined (no engine, inherit).
  const engineByRole: Record<string, string> = { implement: 'claude', review: 'foo' };
  const resolveAgentEngine = (role: string): string | undefined => engineByRole[role];
  const enginePlatformAvailable = (engine: string): boolean => engine === 'claude';

  it('warns exactly once, naming role and engine, when the engine is unknown/unconfigured', () => {
    const issues = validateWorkflow(wf, { resolveAgentEngine, enginePlatformAvailable });
    const engineIssues = issues.filter(i => i.message.includes('engine'));
    expect(engineIssues).toEqual([
      {
        level: 'warning',
        node: 'check',
        message: 'agent "review"\'s engine "foo" is not a registered/configured platform',
      },
    ]);
  });

  it('does not warn when the engine is available, or when the role declares none', () => {
    const issues = validateWorkflow(wf, { resolveAgentEngine, enginePlatformAvailable });
    expect(issues.some(i => i.node === 'dev' && i.message.includes('engine'))).toBe(false);
    expect(issues.some(i => i.node === 'inherit' && i.message.includes('engine'))).toBe(false);
  });

  it('skips the engine check when either resolver is not injected', () => {
    expect(validateWorkflow(wf, { resolveAgentEngine }).some(i => i.message.includes('engine'))).toBe(false);
    expect(validateWorkflow(wf, { enginePlatformAvailable }).some(i => i.message.includes('engine'))).toBe(false);
    expect(validateWorkflow(wf).some(i => i.message.includes('engine'))).toBe(false);
  });
});
