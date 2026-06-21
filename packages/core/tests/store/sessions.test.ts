import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Scope } from '../../src/paths.js';
import { writePendingInjection, claimPendingInjection, sweepPendingInjections } from '../../src/store/index.js';

const dirs: string[] = [];

function createScope(): Scope {
  const root = mkdtempSync(resolve(tmpdir(), 'withy-sessions-'));
  dirs.push(root);
  return { kind: 'project', root, withyDir: resolve(root, '.withy') };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const payload = { ts: '2026-06-21T00:00:00.000Z', injected: ['a', 'b'], snapshot: 'snap' };

describe('pending session injections', () => {
  it('writes then claims (read-and-delete)', () => {
    const scope = createScope();
    writePendingInjection(scope, 'sid-1', payload);

    expect(claimPendingInjection(scope, 'sid-1')).toEqual(payload);
    // second claim finds nothing — the file was deleted on first claim
    expect(claimPendingInjection(scope, 'sid-1')).toBeNull();
  });

  it('isolates concurrent sessions by id', () => {
    const scope = createScope();
    writePendingInjection(scope, 'sid-old', { ...payload, injected: ['old'] });
    writePendingInjection(scope, 'sid-new', { ...payload, injected: ['new'] });

    expect(claimPendingInjection(scope, 'sid-old')?.injected).toEqual(['old']);
    // claiming old leaves new untouched
    expect(claimPendingInjection(scope, 'sid-new')?.injected).toEqual(['new']);
  });

  it('ignores an unsafe session id (no write, no claim, no throw)', () => {
    const scope = createScope();
    writePendingInjection(scope, '../escape', payload);
    expect(claimPendingInjection(scope, '../escape')).toBeNull();
  });

  it('sweep drops nothing fresh and is a no-op without a sessions dir', () => {
    const scope = createScope();
    writePendingInjection(scope, 'sid-1', payload);
    sweepPendingInjections(scope, 24 * 60 * 60 * 1000); // fresh file survives
    expect(claimPendingInjection(scope, 'sid-1')).toEqual(payload);
    sweepPendingInjections(scope); // dir now empty — must not throw
  });

  it('sweep drops aged entries (maxAge 0)', () => {
    const scope = createScope();
    writePendingInjection(scope, 'sid-1', payload);
    sweepPendingInjections(scope, 0); // everything older than "now" → dropped
    expect(claimPendingInjection(scope, 'sid-1')).toBeNull();
  });
});
