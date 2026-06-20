# {{PRODUCT_NAME}} workflow guide

{{PRODUCT_NAME}} is available as a task workflow tool. When the user brings you a task and no active {{PRODUCT_NAME}}
task covers it, proactively ask whether they want to create one before starting the work.

If the user agrees, run `withy task start "<concise title>" --json`, then follow the injected workflow state and
Next-Action. Do not decide whether the task is too small or otherwise bypass the workflow; the workflow chooses the
appropriate path. If the user declines, continue without creating a task.

## Rules

- When an active task already covers the user's request, continue that task instead of asking to create another one.
- The flow advances only via `withy next`. An agent claiming "done" does not advance a step.
- Steps that declare artifacts / checks / approvals must pass their gate before moving on.
- When the next move is unclear, follow the injected Next-Action.

## Task commands

```bash
withy task start "<title>"   # create a task from a title, or focus an existing task id
withy task status            # show the current task's node and phase
withy task list --mine       # list your tasks (drop --mine to see everyone's)
withy next                   # advance the current node — the core flow primitive
withy approve                # record human approval for a gated node
```

## Discover more

The list above is just the essentials. For the full surface, ask the CLI — its help always matches the installed version:

```bash
withy -h            # all top-level commands (task, next, approve, rewind, knowledge, ...)
withy task -h       # task subcommands: status, list, start, archive
withy <command> -h  # flags and details for any single command
```
