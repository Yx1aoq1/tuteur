import { readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Command } from 'commander';

type CommandRegistrar = (program: Command) => void | Promise<void>;

const commandModuleDir = dirname(fileURLToPath(import.meta.url));
const excludedModuleNames = new Set(['index']);

export async function registerCommands(program: Command): Promise<void> {
  const commandFiles = readdirSync(commandModuleDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(isCommandModule)
    .sort();

  for (const commandFile of commandFiles) {
    const moduleUrl = pathToFileURL(resolve(commandModuleDir, commandFile)).href;
    const commandModule = (await import(moduleUrl)) as { default?: CommandRegistrar };

    if (typeof commandModule.default !== 'function') {
      throw new Error(`Command module ${commandFile} must export a default registrar function.`);
    }

    await commandModule.default(program);
  }
}

function isCommandModule(fileName: string): boolean {
  const extension = extname(fileName);
  if (extension !== '.ts' && extension !== '.js') {
    return false;
  }

  const moduleName = fileName.slice(0, -extension.length);
  return !moduleName.endsWith('.d') && !excludedModuleNames.has(moduleName);
}
