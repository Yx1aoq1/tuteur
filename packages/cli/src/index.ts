#!/usr/bin/env node
import { createCliProgram } from './program.js';

try {
  const program = await createCliProgram();
  await program.parseAsync();
} catch (error) {
  console.error(`Error: ${formatErrorMessage(error)}`);
  process.exit(1);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
