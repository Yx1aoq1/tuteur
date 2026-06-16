import { execFileSync } from 'node:child_process';

// 单次 git 命令的超时(毫秒);只跑本地命令,几秒足够,避免会话启动卡死
const GIT_TIMEOUT_MS = 3000;

// 最近提交注入条数上限
const MAX_RECENT_COMMITS = 5;

// 改动文件注入条数上限(仅作定向,不全量列出)
const MAX_CHANGED_FILES = 5;

// 仓库根的 git 只读快照(session-start 定向用;非仓库或 git 缺失时 isRepo=false)
export interface GitStatus {
  // 是否在 git 工作树内(false 时其余字段为空)
  isRepo: boolean;

  // 当前分支名;分离 HEAD 或读取失败时为 'unknown'
  branch: string;

  // 未提交改动条数(git status --porcelain 行数)
  dirtyCount: number;

  // 改动文件清单(取前 MAX_CHANGED_FILES 条)
  changedFiles: string[];

  // 最近若干条提交,形如 "<hash> <message>"
  recentCommits: string[];
}

const EMPTY_STATUS: GitStatus = {
  isRepo: false,
  branch: '',
  dirtyCount: 0,
  changedFiles: [],
  recentCommits: [],
};

// 跑一条只读 git 命令,失败(无 git、非仓库、超时)统一返回 null;不经 shell,无注入风险
function runGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', ['-c', 'i18n.logOutputEncoding=UTF-8', ...args], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function splitLines(output: string | null): string[] {
  return (output ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * 读取 cwd 所在 git 仓库的只读快照,供 session-start 给 agent 定向。
 * 只跑本地、只读命令(rev-parse/branch/status/log)且带超时;任何失败(无 git、非仓库、超时)
 * 都软失败返回 isRepo=false 的空快照,绝不抛错阻断 hook。
 *
 * @param cwd 解析 git 的工作目录,通常是项目仓库根(scope.root)
 * @return 非仓库或 git 不可用时返回 isRepo=false 的空快照
 *
 * @example
 * readGitStatus(scope.root);
 */
export function readGitStatus(cwd: string): GitStatus {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], cwd);
  if (inside?.trim() !== 'true') {
    return EMPTY_STATUS;
  }

  const branch = runGit(['branch', '--show-current'], cwd)?.trim() || 'unknown';
  const changed = splitLines(runGit(['status', '--porcelain'], cwd));
  const recentCommits = splitLines(runGit(['log', '--oneline', `-${MAX_RECENT_COMMITS}`], cwd));

  return {
    isRepo: true,
    branch,
    dirtyCount: changed.length,
    changedFiles: changed.slice(0, MAX_CHANGED_FILES),
    recentCommits,
  };
}
