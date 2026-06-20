import type { z } from 'zod';
import { readJsonFile } from '../utils/index.js';

/** Raised when a `.withy/` file is missing or fails schema validation. */
export class StoreError extends Error {}

/**
 * Read a JSON file and validate it against `schema`, raising {@link StoreError}
 * (with the path + issue list) on any read or validation failure. The shared
 * typed-read primitive behind every reader in the store layer.
 *
 * @param path absolute file path to read
 * @param schema zod schema the parsed JSON must satisfy
 * @param label human label used in the error message (e.g. "task.json")
 */
export function readValidated<S extends z.ZodTypeAny>(path: string, schema: S, label: string): z.output<S> {
  let raw: unknown;
  try {
    raw = readJsonFile(path);
  } catch (error) {
    throw new StoreError(`${label}: ${(error as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StoreError(
      `${label} failed validation: ${path}\n  ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ')}`,
    );
  }
  return parsed.data;
}
