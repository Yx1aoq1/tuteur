import { getTranslations } from 'next-intl/server';
import { BoardView } from './components/BoardView';
import { EmptyState } from '@/components/EmptyState';
import { getBoard, getArchivedBoard, getIdentity, resolveScopeByName } from '@/server/dashboard';

interface BoardPageProps {
  params: Promise<{ project: string }>;
}

// 看板页(/<name>/board):按名解析 scope,读任务按 todo/doing/done 分组 + 归档视图。
export async function BoardPage({ params }: BoardPageProps) {
  const { project } = await params;
  const scope = resolveScopeByName(decodeURIComponent(project));

  if (!scope) {
    const t = await getTranslations('empty');
    return <EmptyState title={t('unselectedTitle')} hint={t('unselectedHint')} />;
  }

  const identity = getIdentity();
  const board = getBoard(scope, identity);
  const archived = getArchivedBoard(scope, identity);

  return <BoardView board={board} archived={archived} identityName={identity?.name ?? null} project={scope.root} />;
}
