/** Current time as an ISO-8601 string. Single source so call sites stay uniform. */
export function nowIso(): string {
  return new Date().toISOString();
}
