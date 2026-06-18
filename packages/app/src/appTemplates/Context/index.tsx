import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';

// 上下文注入编排器视图(待实现:default/node 两层勾选注入哪些知识 + 实时预览)。
export async function ContextPage() {
  const t = await getTranslations('empty');
  return <EmptyState title={t('contextTitle')} hint={t('contextHint')} icon="⇲" />;
}
