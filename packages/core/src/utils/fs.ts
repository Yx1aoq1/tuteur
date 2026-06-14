import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Create a directory (recursive) if absent, tracking the created path. */
export function ensureDir(path: string, createdPaths: string[], writtenPaths?: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }
  mkdirSync(path, { recursive: true });
  createdPaths.push(path);
  writtenPaths?.push(path);
  return true;
}

/** Write text, creating parent dirs; records the path only when newly created. */
export function writeText(path: string, value: string, createdPaths: string[]): boolean {
  const existed = existsSync(path);
  ensureDir(dirname(path), createdPaths);
  writeFileSync(path, value, 'utf8');
  if (!existed) {
    createdPaths.push(path);
  }
  return !existed;
}

/** Write text only when the file is absent. */
export function writeTextIfMissing(path: string, value: string, createdPaths: string[]): boolean {
  if (existsSync(path)) {
    return false;
  }
  ensureDir(dirname(path), createdPaths);
  return writeText(path, value, createdPaths);
}

/** True when the path exists and is a non-empty file. */
export function existsNonEmpty(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

/** True when the path exists and is a directory. */
export function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Alias of {@link isDirectory} for call sites that read better as a guard. */
export function dirExists(path: string): boolean {
  return isDirectory(path);
}

/** Move a directory within the same volume (creates the target parent). */
export function moveDir(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}
