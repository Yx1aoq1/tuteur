// ──────────────────────────────────────────────────────────────────────────
// Generic finite-state-machine engine. Domain-agnostic on purpose: it knows
// only states, labeled (optionally guarded) transitions, and a cursor over them.
// It never sees Withy's workflow schema, gates, or event shapes — callers
// compile their domain into a `MachineDef`, evaluate guards themselves, and feed
// the results in. This file should not change when business fields/gates change.
// ──────────────────────────────────────────────────────────────────────────

// One outgoing edge. `on` is the event label that fires it; `target` is the
// destination state (null = terminal). `guard` is looked up in the GuardReport;
// `default` is the edge a forced send (escape hatch / skip) takes.
export interface Transition {
  on: string;
  target: string | null;
  guard?: string;
  default?: boolean;
}

export interface MachineNode {
  id: string;
  transitions: Transition[];
}

// A compiled machine: a set of states + the entry state. Pure data.
export interface MachineDef {
  initial: string;
  nodes: MachineNode[];
}

// The dynamic position: the current state + the trail of states left behind.
export interface Cursor {
  current: string | null;
  visited: string[];
}

// Guard results injected by the caller (guards may need IO; the engine stays pure).
export type GuardReport = Record<string, { ok: boolean; reasons?: string[] }>;

export type SendResult =
  | { status: 'done' }
  | { status: 'moved'; cursor: Cursor; from: string; target: string | null; via: Transition }
  | { status: 'blocked'; from: string; reasons: string[] }
  | { status: 'unhandled'; from: string; transitions: Transition[] };

export interface SendOptions {
  // Ignore the event label and guards, take the `default` transition. The escape
  // hatch a host maps to "skip" — host decides whether it is allowed.
  forced?: boolean;
}

export function nodeOf(def: MachineDef, id: string | null): MachineNode | undefined {
  return id === null ? undefined : def.nodes.find(n => n.id === id);
}

export function initialCursor(def: MachineDef): Cursor {
  return { current: def.initial, visited: [] };
}

/**
 * Fire one transition. Resolution: a forced send takes the `default` edge (or the
 * sole edge); otherwise the edge whose `on` matches `event`. A matched edge with a
 * failing guard `blocks` (cursor unchanged); no matching edge is `unhandled` (the
 * caller decides what that means — e.g. a branch point awaiting a choice).
 */
export function send(
  def: MachineDef,
  cursor: Cursor,
  event: string,
  guards: GuardReport = {},
  opts: SendOptions = {},
): SendResult {
  const { current } = cursor;
  if (current === null) return { status: 'done' };

  const node = nodeOf(def, current);
  if (!node) return { status: 'unhandled', from: current, transitions: [] };

  const chosen = opts.forced
    ? (node.transitions.find(t => t.default) ?? node.transitions[0])
    : node.transitions.find(t => t.on === event);

  if (!chosen) return { status: 'unhandled', from: current, transitions: node.transitions };

  if (!opts.forced && chosen.guard) {
    const report = guards[chosen.guard];
    if (report && !report.ok) return { status: 'blocked', from: current, reasons: report.reasons ?? [] };
  }

  const visited = cursor.visited.includes(current) ? cursor.visited : [...cursor.visited, current];
  return {
    status: 'moved',
    cursor: { current: chosen.target, visited },
    from: current,
    target: chosen.target,
    via: chosen,
  };
}

/**
 * Move the cursor back to `to`: drop it and everything visited after it. The
 * no-back-edge rule constrains the static graph, not host-driven cursor moves.
 */
export function rewind(def: MachineDef, cursor: Cursor, to: string): Cursor {
  if (!def.nodes.some(n => n.id === to)) throw new Error(`rewind: unknown state "${to}"`);
  const idx = cursor.visited.indexOf(to);
  const visited = idx === -1 ? cursor.visited : cursor.visited.slice(0, idx);
  return { current: to, visited };
}
