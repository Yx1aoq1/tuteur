import { describe, expect, it } from 'vitest';
import { sessionIdFromHookPayload, resolveSessionId } from '../../src/agents/index.js';

describe('resolveSessionId', () => {
  it('reads the Claude env var', () => {
    expect(resolveSessionId({ CLAUDE_CODE_SESSION_ID: 'sid-9' })).toBe('sid-9');
  });

  it('returns null when no platform env var is set', () => {
    expect(resolveSessionId({})).toBeNull();
  });
});

describe('sessionIdFromHookPayload', () => {
  it('reads the Claude hook field', () => {
    expect(sessionIdFromHookPayload({ session_id: 'sid-7', cwd: '/x' })).toBe('sid-7');
  });

  it('returns null when the field is absent or non-string', () => {
    expect(sessionIdFromHookPayload({})).toBeNull();
    expect(sessionIdFromHookPayload({ session_id: 42 })).toBeNull();
  });
});
