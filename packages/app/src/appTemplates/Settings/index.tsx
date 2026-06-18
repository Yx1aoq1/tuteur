import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';

// 全局视图(/settings):全局配置 + 跨项目知识库占位,独立空布局,待实现。
export async function SettingsPage() {
  const t = await getTranslations('empty');
  return <EmptyState title={t('globalTitle')} hint={t('globalHint')} icon="◍" />;
}
