import { getTranslations } from 'next-intl/server';
import { BoardView } from '@/components/board/BoardView';
import { EmptyState } from '@/components/EmptyState';
import { getBoard, getArchivedBoard, getIdentity, resolveScopeForRequest } from '@/server/dashboard';

interface BoardPageProps {
  searchParams: Promise<{ project?: string; scope?: string }>;
}

// 看板页(默认视图):读当前项目 scope 的任务,按 todo/doing/done 分组展示。
export default async function BoardPage({ searchParams }: BoardPageProps) {
  const { project, scope: scopeParam } = await searchParams;
  const t = await getTranslations('empty');

  if (scopeParam === 'global') {
    return <EmptyState title={t('globalTitle')} hint={t('globalHint')} icon="◍" />;
  }

  const scope = resolveScopeForRequest(project);
  if (!scope) {
    return <EmptyState title={t('unselectedTitle')} hint={t('unselectedHint')} />;
  }

  const identity = getIdentity();
  const board = getBoard(scope, identity);
  const archived = getArchivedBoard(scope, identity);

  return <BoardView board={board} archived={archived} identityName={identity?.name ?? null} project={scope.root} />;
}
