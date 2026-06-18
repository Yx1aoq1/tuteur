import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/EmptyState';

// 知识库管理视图(待实现:全局/项目两区 CRUD + md 渲染 + 图谱)。
export async function KnowledgePage() {
  const t = await getTranslations('empty');
  return <EmptyState title={t('knowledgeTitle')} hint={t('knowledgeHint')} icon="❋" />;
}
