import { getTranslations } from 'next-intl/server';
import { CanvasView } from './components/CanvasView';
import { EmptyState } from '@/components/EmptyState';
import { getCanvas, resolveScopeByName } from '@/server/dashboard';

interface WorkflowPageProps {
  params: Promise<{ project: string }>;
}

// workflow 画布页(/<name>/workflow):自由画布 + 横向软泳道(规划/执行/收尾)+ skill/switch 节点。
export async function WorkflowPage({ params }: WorkflowPageProps) {
  const { project } = await params;
  const t = await getTranslations('empty');

  const scope = resolveScopeByName(decodeURIComponent(project));
  if (!scope) {
    return <EmptyState title={t('unselectedTitle')} hint={t('unselectedHint')} />;
  }

  const canvas = getCanvas(scope);
  if (!canvas) {
    return <EmptyState title={t('canvasTitle')} hint={t('canvasHint')} icon="✎" />;
  }

  return <CanvasView data={canvas} project={scope.root} />;
}
