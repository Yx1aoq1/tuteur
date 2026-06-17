import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';

// workflow 画布视图(待实现:三固定容器 + skill/switch 节点,React Flow Sub Flow)。
export default async function CanvasPage() {
  const t = await getTranslations('empty');
  return <EmptyState title={t('canvasTitle')} hint={t('canvasHint')} icon="✎" />;
}
