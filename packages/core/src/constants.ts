// Canonical product/runtime constants. The CLI re-exports these via its own
// constants/product.ts shim so existing CLI import sites keep working.

export const PRODUCT_DISPLAY_NAME = 'Withy';
export const PRODUCT_SLUG = toDirectoryName(PRODUCT_DISPLAY_NAME);
export const CLI_COMMAND_NAME = 'withy';
export const PROJECT_DIR_NAME = `.${PRODUCT_SLUG}`;
export const GLOBAL_DIR_NAME = `.${PRODUCT_SLUG}`;
export const SKILL_NAME_PREFIX = PRODUCT_SLUG;

export const DASHBOARD_PROJECT_ROOT_ENV = `${toEnvName(PRODUCT_SLUG)}_PROJECT_ROOT`;
export const DASHBOARD_SERVICE_NAME = `${PRODUCT_SLUG}-dashboard`;
export const DASHBOARD_PACKAGE_NAME = `@${PRODUCT_SLUG}/app`;

/** Fixed macro-phase ids (the three workflow containers). */
export const PHASE_PLANNING = 'planning';
export const PHASE_EXECUTE = 'execute';
export const PHASE_FINISH = 'finish';

/** Default consecutive-failure threshold for the "stuck" alarm (overridable by config.yaml). */
export const DEFAULT_STUCK_THRESHOLD = 3;

/** Max length a stored event `reason` is truncated to (compact JSONL lines). */
export const EVENT_REASON_MAX = 200;

/** Max length of a stored session-injection snapshot (session_start.snapshot). */
export const SNAPSHOT_MAX = 4000;

/** Max length of a recorded user prompt (prompt.text). */
export const PROMPT_MAX = 500;

// dispatch.json 种壳/正文里的填写指引(`_help` 键)。讲清填什么、描述写梗概、别放代码路径 — design §1.2。
export const DISPATCH_HELP =
  'Fill read:[{id|artifact, description}]; description is a one-line gist of the doc/knowledge, ' +
  'and the subagent decides from it whether to read in full. List only knowledge ids and task ' +
  'artifacts — never code paths (the subagent reads code itself). Run `withy knowledge index` to ' +
  'see available knowledge ids.';

/** Bundled skill name for a workflow base name, e.g. `dev` → `withy-dev`. */
export function getBundledSkillName(baseName: string): string {
  return `${SKILL_NAME_PREFIX}-${toDirectoryName(baseName)}`;
}

/** Slash-command prefix used by Claude skill invocation, e.g. `/withy:`. */
export function getSlashCommandPrefix(): string {
  return `/${PRODUCT_SLUG}:`;
}

export function toDirectoryName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function toEnvName(value: string): string {
  return toDirectoryName(value).replace(/-/g, '_').toUpperCase();
}
