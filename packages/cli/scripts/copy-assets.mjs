import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(packageRoot, 'src/templates');
const targetRoot = resolve(packageRoot, 'dist/templates');

if (!existsSync(sourceRoot)) {
  process.exit(0);
}

copyAssetTree(sourceRoot, targetRoot);

function copyAssetTree(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = resolve(sourceDir, entry.name);
    const target = resolve(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyAssetTree(source, target);
      continue;
    }

    if (extname(entry.name) === '.ts') {
      continue;
    }

    if (existsSync(target)) {
      rmSync(target);
    }
    cpSync(source, target);
  }
}
