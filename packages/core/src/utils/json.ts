import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ensureDir } from './fs.js';

/** Read and JSON-parse a file. Throws with the path on missing/invalid input. */
export function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    throw new Error(`file not found: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`invalid JSON: ${path}\n  ${(error as Error).message}`);
  }
}

/** Write a value as pretty JSON (trailing newline), creating parent dirs. */
export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Write JSON only when the file is absent; records the created path. */
export function writeJsonFileIfMissing(path: string, value: unknown, createdPaths: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }
  ensureDir(dirname(path), createdPaths);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  createdPaths.push(path);
  return true;
}
