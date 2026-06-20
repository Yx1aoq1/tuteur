import { getTranslations } from 'next-intl/server';
import { KnowledgeWorkspace } from './components/KnowledgeWorkspace';
import { EmptyState } from '@/components/EmptyState';
import { resolveScopeByName } from '@/server/dashboard';
import { getKnowledgeTree } from '@/server/knowledge';

interface KnowledgePageProps {
  params: Promise<{ project: string }>;
}

// 知识库工作台(/<name>/knowledge):三栏(文件树 / 文档 / 章节目录),默认文档视图。
// 首屏 Server 读 wiki 文件树下传;无 scope 渲染空态。
export async function KnowledgePage({ params }: KnowledgePageProps) {
  const { project } = await params;
  const t = await getTranslations('empty');

  const scope = resolveScopeByName(decodeURIComponent(project));
  if (!scope) {
    return <EmptyState title={t('unselectedTitle')} hint={t('unselectedHint')} />;
  }

  return <KnowledgeWorkspace tree={getKnowledgeTree(scope)} project={scope.root} />;
}
