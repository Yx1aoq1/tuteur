import { describe, expect, it } from 'vitest';
import { evaluateGate } from '../../src/workflow/gate.js';
import type { GateContext } from '../../src/workflow/gate.js';
import type { SkillNode } from '../../src/types.js';

function node(gate: SkillNode['gate']): SkillNode {
  return { id: 'dev', type: 'skill', skill: 'withy-dev', next: null, gate };
}

function ctx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    artifactExists: () => true,
    runCheck: () => ({ code: 0, output: '' }),
    isApproved: () => true,
    hasNote: () => true,
    hasProgress: () => true,
    ...overrides,
  };
}

describe('note gate', () => {
  it('blocks when gate.note and no fresh note', () => {
    const { ok, reasons } = evaluateGate(node({ note: true }), ctx({ hasNote: () => false }));
    expect(ok).toBe(false);
    expect(reasons.join(' ')).toMatch(/withy note/);
  });

  it('passes when a note exists', () => {
    expect(evaluateGate(node({ note: true }), ctx({ hasNote: () => true })).ok).toBe(true);
  });

  it('is inert when gate.note is unset', () => {
    expect(evaluateGate(node({}), ctx({ hasNote: () => false })).ok).toBe(true);
  });
});

describe('progress gate', () => {
  it('blocks when gate.progress and no plan', () => {
    const { ok, reasons } = evaluateGate(node({ progress: true }), ctx({ hasProgress: () => false }));
    expect(ok).toBe(false);
    expect(reasons.join(' ')).toMatch(/withy checklist add/);
  });

  it('passes when a plan exists', () => {
    expect(evaluateGate(node({ progress: true }), ctx({ hasProgress: () => true })).ok).toBe(true);
  });
});
