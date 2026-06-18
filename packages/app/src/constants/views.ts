// 顶栏功能视图切换的菜单项;subpath 拼到 /<project> 之后(看板为 ''),label 文案经 i18n(views.<key>)。
export interface ViewItem {
  key: string;
  icon: string;
  subpath: string;
}

export const VIEW_ITEMS: ViewItem[] = [
  { key: 'board', icon: '▦', subpath: '/board' },
  { key: 'canvas', icon: '✎', subpath: '/workflow' },
  { key: 'knowledge', icon: '❋', subpath: '/knowledge' },
  { key: 'context', icon: '⇲', subpath: '/context' },
];

// 功能子路径集合(供 pathname 解析:首段之后是否为已知功能段)。
export const VIEW_SUBPATHS = VIEW_ITEMS.map(item => item.subpath.replace(/^\//, '')).filter(Boolean);

// 保留名:与静态路由冲突,不可作为项目名(/<name> 会被静态段抢占)。
export const RESERVED_PROJECT_NAMES = ['settings', 'api'];

// 当前路由的项目维度与功能维度。
export interface RouteParts {
  // 项目名(已解码);全局/根路由为 null。
  project: string | null;

  // 功能子路径('' = 看板,'/canvas' 等);用于切项目时保持当前功能。
  featureSuffix: string;

  // 是否处于全局视图(/settings)。
  isGlobal: boolean;
}

/**
 * 从 pathname 解析项目名与功能段(/<name>/<feature>)。
 * @param pathname next usePathname() 的返回
 */
export function parseRoute(pathname: string): RouteParts {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'settings') return { project: null, featureSuffix: '', isGlobal: true };
  if (segments.length === 0) return { project: null, featureSuffix: '', isGlobal: false };

  const feature = segments[1] && VIEW_SUBPATHS.includes(segments[1]) ? `/${segments[1]}` : '';
  return { project: decodeURIComponent(segments[0]), featureSuffix: feature, isGlobal: false };
}
