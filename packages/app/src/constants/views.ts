// 顶栏功能视图切换的菜单项;href 对应 src/app 下的路由,label 文案经 i18n(views.<key>)。
export interface ViewItem {
  key: string;
  icon: string;
  href: string;
}

export const VIEW_ITEMS: ViewItem[] = [
  { key: 'board', icon: '▦', href: '/' },
  { key: 'canvas', icon: '✎', href: '/canvas' },
  { key: 'knowledge', icon: '❋', href: '/knowledge' },
  { key: 'context', icon: '⇲', href: '/context' },
];
