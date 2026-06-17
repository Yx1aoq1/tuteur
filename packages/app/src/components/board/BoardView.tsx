'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TaskCard } from './TaskCard';
import { ViewDetail } from './ViewDetail';
import type { BoardCard, BoardColumn, BoardData } from '@/types/dashboard';

interface BoardViewProps {
  board: BoardData;
  hasIdentity: boolean;
  project: string;
}

const COLUMNS: BoardColumn[] = ['todo', 'doing', 'done'];

// 看板视图:三列(虚线分隔)+ 右侧 view detail;点卡片选中并展开详情。
// 「我的/全部」按卡片 mine 标记在客户端过滤并重算计数(无身份时只能看全部)。
export function BoardView({ board, hasIdentity, project }: BoardViewProps) {
  const t = useTranslations('board');
  const tDetail = useTranslations('viewDetail');
  const [mineOnly, setMineOnly] = useState(hasIdentity);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => filterBoard(board, mineOnly && hasIdentity), [board, mineOnly, hasIdentity]);
  const allCards = useMemo(
    () => [...filtered.columns.todo, ...filtered.columns.doing, ...filtered.columns.done],
    [filtered],
  );

  // 选中态:用户显式选中优先;否则按 doing → todo → done 取默认(过滤后选中项消失也回退默认)。
  // 详情面板常驻不可关闭;全部为空时下方渲染空态占位。
  const selected = (selectedId ? allCards.find(card => card.id === selectedId) : undefined) ?? pickDefault(filtered);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 px-[18px] pt-3">
          <span className="mr-auto text-[11px] font-semibold text-ink-faint">{t('filterHint')}</span>
          <span className="inline-flex rounded-full border border-line-strong bg-paper-sunken p-[3px]">
            <button
              type="button"
              disabled={!hasIdentity}
              onClick={() => setMineOnly(true)}
              className={segClass(mineOnly && hasIdentity)}
            >
              {t('mine')}
            </button>
            <button type="button" onClick={() => setMineOnly(false)} className={segClass(!mineOnly || !hasIdentity)}>
              {t('all')}
            </button>
          </span>
        </div>

        <div className="grid grid-cols-3 px-[18px] pt-2.5 pb-2.5">
          {COLUMNS.map((col, i) => (
            <div
              key={col}
              className={`flex items-center gap-2 pl-1 font-serif text-[15px] font-semibold ${
                i > 0 ? 'border-l border-dashed border-line-strong pl-4' : ''
              }`}
            >
              {t(col)}
              <span className="rounded-full border border-line bg-paper-sunken px-2 py-px text-[11px] font-bold text-ink-soft">
                {filtered.counts[col]}
              </span>
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-3 overflow-y-auto px-[18px] pb-[18px]">
          {COLUMNS.map((col, i) => (
            <div
              key={col}
              className={`flex flex-col gap-3 py-1.5 pr-3.5 pl-1 ${
                i > 0 ? 'border-l border-dashed border-line-strong pl-4' : ''
              }`}
            >
              {filtered.columns[col].map(card => (
                <TaskCard
                  key={card.id}
                  card={card}
                  selected={card.id === selected?.id}
                  onSelect={() => setSelectedId(card.id)}
                />
              ))}
              {filtered.columns[col].length === 0 && (
                <p className="px-1 py-3 text-[12px] text-ink-faint">{t('empty')}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <ViewDetail card={selected} project={project} />
      ) : (
        <aside className="flex w-[336px] shrink-0 flex-col overflow-y-auto border-l border-line-strong bg-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
          <div className="flex items-center px-4 pt-3.5 pb-2.5">
            <span className="font-serif text-[15px] font-semibold">{tDetail('title')}</span>
          </div>
          <div className="flex flex-1 items-center justify-center px-6 pb-12 text-center">
            <p className="text-[12px] text-ink-faint">{tDetail('detailEmpty')}</p>
          </div>
        </aside>
      )}
    </div>
  );
}

// 默认选中:优先正在执行(doing),其次待办(todo),最后已完成(done);全空返回 null
function pickDefault(board: BoardData): BoardCard | null {
  return board.columns.doing[0] ?? board.columns.todo[0] ?? board.columns.done[0] ?? null;
}

function filterBoard(board: BoardData, mineOnly: boolean): BoardData {
  if (!mineOnly) return board;
  const pick = (cards: BoardCard[]) => cards.filter(card => card.mine);
  const columns = {
    todo: pick(board.columns.todo),
    doing: pick(board.columns.doing),
    done: pick(board.columns.done),
  };
  const counts = { todo: columns.todo.length, doing: columns.doing.length, done: columns.done.length };
  return { columns, counts, total: counts.todo + counts.doing + counts.done };
}

function segClass(active: boolean): string {
  const base = 'cursor-pointer rounded-full px-[13px] py-[5px] text-[13px] font-semibold disabled:opacity-40';
  return active ? `${base} bg-brand text-brand-ink` : `${base} text-ink-soft`;
}
