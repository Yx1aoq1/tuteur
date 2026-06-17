import { getTranslations } from 'next-intl/server';
import { CanvasView } from '@/components/canvas/CanvasView';
import { EmptyState } from '@/components/EmptyState';
import { getCanvas, resolveScopeForRequest } from '@/server/dashboard';

interface CanvasPageProps {
  searchParams: Promise<{ project?: string; scope?: string }>;
}

// workflow 画布视图:三固定阶段容器 + skill/switch 节点(React Flow Sub Flow),右栏 skill 可拖入编辑。
export default async function CanvasPage({ searchParams }: CanvasPageProps) {
  const { project, scope: scopeParam } = await searchParams;
  const t = await getTranslations('empty');

  if (scopeParam === 'global') {
    return <EmptyState title={t('globalTitle')} hint={t('globalHint')} icon="◍" />;
  }

  const scope = resolveScopeForRequest(project);
  if (!scope) {
    return <EmptyState title={t('unselectedTitle')} hint={t('unselectedHint')} />;
  }

  const canvas = getCanvas(scope);
  if (!canvas) {
    return <EmptyState title={t('canvasTitle')} hint={t('canvasHint')} icon="✎" />;
  }

  return <CanvasView data={canvas} project={scope.root} />;
}
