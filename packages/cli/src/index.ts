#!/usr/bin/env node
import { createCliProgram } from './program.js';

const program = await createCliProgram();
await program.parseAsync();
