import { describe, expect, it } from 'vitest';
import { RunRecordSchema, HandbackSchema, AgentToolSchema } from '../../src/types.js';

describe('AgentToolSchema', () => {
  it('accepts every registered platform id', () => {
    for (const id of ['claude', 'codex', 'opencode']) {
      expect(AgentToolSchema.safeParse(id).success).toBe(true);
    }
  });

  it('rejects an unregistered platform id', () => {
    expect(AgentToolSchema.safeParse('foo').success).toBe(false);
  });
});

describe('RunRecordSchema', () => {
  const valid = {
    runId: 'dev-1',
    node: 'dev',
    executor: 'codex',
    cwd: '/repo',
    status: 'running',
    startedAt: '2026-07-01T00:00:00.000Z',
  };

  it('parses a valid record with only the required fields', () => {
    expect(RunRecordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a record missing a required field', () => {
    const { runId: _runId, ...missingRunId } = valid;
    expect(RunRecordSchema.safeParse(missingRunId).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(RunRecordSchema.safeParse({ ...valid, status: 'paused' }).success).toBe(false);
  });

  it('rejects an unregistered executor', () => {
    expect(RunRecordSchema.safeParse({ ...valid, executor: 'foo' }).success).toBe(false);
  });
});

describe('HandbackSchema', () => {
  it('parses a minimal object, defaulting touched/blockers/needsInput', () => {
    const parsed = HandbackSchema.parse({ node: 'dev', status: 'ok', summary: 'did the thing' });
    expect(parsed.touched).toEqual([]);
    expect(parsed.blockers).toEqual([]);
    expect(parsed.needsInput).toBeNull();
  });

  it('parses a full object with all fields set', () => {
    const full = {
      node: 'dev',
      status: 'blocked',
      summary: 'stuck',
      touched: ['src/foo.ts'],
      blockers: ['missing API key'],
      needsInput: 'which provider?',
    };
    expect(HandbackSchema.parse(full)).toEqual(full);
  });

  it('rejects a record missing its summary', () => {
    expect(HandbackSchema.safeParse({ node: 'dev', status: 'ok' }).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(HandbackSchema.safeParse({ node: 'dev', status: 'done', summary: 'x' }).success).toBe(false);
  });
});
