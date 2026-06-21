import { readdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { z } from 'zod';
import { type Scope, pendingInjectionPath, sessionsDir } from '../paths.js';
import { writeJsonFile, readJsonFile } from '../utils/index.js';

// ── Pending session injections (runtime/sessions/<sid>.json — transient, gitignored) ──
// When a SessionStart hook fires with no active task, the injection is parked here
// keyed by session id. `withy task start` later claims its own session's pending
// entry to backfill the creating session's session_start event (original ts + snapshot).
// Soft by design: a malformed/unsafe session id is a no-op, never a throw.

// A session id is used verbatim as a filename — restrict to a safe charset so it
// can never escape the sessions dir. Anything else is treated as "no session".
const SAFE_SESSION_ID = /^[A-Za-z0-9_-]+$/;

const PendingInjectionSchema = z.object({
  ts: z.string(),
  injected: z.array(z.string()),
  snapshot: z.string().optional(),
});
export type PendingInjection = z.infer<typeof PendingInjectionSchema>;

/** Park a session's injection for later backfill. No-op on an unsafe session id. */
export function writePendingInjection(scope: Scope, sessionId: string, payload: PendingInjection): void {
  if (!SAFE_SESSION_ID.test(sessionId)) return;
  writeJsonFile(pendingInjectionPath(scope, sessionId), payload);
}

/** Read-and-delete a session's pending injection. Returns null when absent/unsafe/corrupt. */
export function claimPendingInjection(scope: Scope, sessionId: string): PendingInjection | null {
  if (!SAFE_SESSION_ID.test(sessionId)) return null;

  const file = pendingInjectionPath(scope, sessionId);
  if (!existsSync(file)) return null;
  try {
    const parsed = PendingInjectionSchema.safeParse(readJsonFile(file));
    rmSync(file); // claimed once — drop regardless of validity so it cannot be re-claimed
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Drop pending injections older than maxAgeMs (sessions that never created a task). */
export function sweepPendingInjections(scope: Scope, maxAgeMs = 24 * 60 * 60 * 1000): void {
  const dir = sessionsDir(scope);
  if (!existsSync(dir)) return;

  const cutoff = Date.now() - maxAgeMs;
  for (const name of readdirSync(dir)) {
    const file = `${dir}/${name}`;
    try {
      if (statSync(file).mtimeMs < cutoff) rmSync(file);
    } catch {
      // tolerate a vanished/locked file — sweeping is best-effort
    }
  }
}
