export const PRODUCT_DISPLAY_NAME = 'Tuteur';
export const PRODUCT_SLUG = toDirectoryName(PRODUCT_DISPLAY_NAME);
export const CLI_COMMAND_NAME = 'ttur';
export const PROJECT_DIR_NAME = `.${PRODUCT_SLUG}`;
export const SKILL_NAME_PREFIX = PRODUCT_SLUG;
export const DASHBOARD_PROJECT_ROOT_ENV = `${toEnvName(PRODUCT_SLUG)}_PROJECT_ROOT`;
export const DASHBOARD_SERVICE_NAME = `${PRODUCT_SLUG}-dashboard`;
export const DASHBOARD_PACKAGE_NAME = `@${PRODUCT_SLUG}/app`;

export function getBundledSkillName(baseName: string): string {
  return `${SKILL_NAME_PREFIX}-${toDirectoryName(baseName)}`;
}

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
