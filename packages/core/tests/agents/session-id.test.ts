import { describe, expect, it } from 'vitest';
import { sessionIdFromHookPayload, resolveCurrentPlatform, resolveSessionId } from '../../src/agents/index.js';

describe('resolveSessionId', () => {
  it('reads the Claude env var', () => {
    expect(resolveSessionId({ CLAUDE_CODE_SESSION_ID: 'sid-9' })).toBe('sid-9');
  });

  it('returns null when no platform env var is set', () => {
    expect(resolveSessionId({})).toBeNull();
  });
});

describe('resolveCurrentPlatform', () => {
  it('returns claude when its session env var is set', () => {
    expect(resolveCurrentPlatform({ CLAUDE_CODE_SESSION_ID: 'sid-9' })).toBe('claude');
  });

  it('returns null when no platform declares a matching env var', () => {
    expect(resolveCurrentPlatform({})).toBeNull();
  });

  it('returns null for codex/opencode — neither ships a session env var yet', () => {
    expect(resolveCurrentPlatform({ SOME_UNRELATED_VAR: 'x' })).toBeNull();
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
