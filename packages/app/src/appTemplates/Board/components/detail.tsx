'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { PHASE_ORDER } from './phase';
import { TaskDocsModal } from './TaskDocsModal';
import { formatLocalDateTime } from './time';
import { Scroller } from '@/components/Scroller';
import type { Phase, TimelineEventView, ImplementationView } from '@/types/dashboard';

// 详情面板的共享展示子件(活跃 ViewDetail 与归档 ArchivedDetail 共用):整块详情主体 + 带标题的分层块 + 主体阶段步进器。
// 仅客户端读(产物懒加载),无写操作、无 core 依赖。活跃/归档差异经 TaskDetailBody 的 header/footer 插槽注入。

interface TaskDetailBodyProps {
  panelTitle: string; // 面板标题(活跃「执行视图」/ 归档「归档详情」)
  taskId: string;
  project: string; // ?project=<path> 用于产物 API 解析 scope
  title: string;
  phase: Phase | null;
  completed: boolean; // 阶段步进器是否走完(活跃=done 列 / 归档=终态 completed)
  node: string | null;
  stuck: boolean; // 仅活跃可能为真 → 红 ✗ + 连败徽章;归档恒 false → 绿 ✓
  implementation: ImplementationView;
  timeline: TimelineEventView[];
  header?: React.ReactNode; // 标题下方插槽:归档状态徽章(活跃无)
  footer?: React.ReactNode; // 末尾插槽:活跃归档按钮 / 归档生命周期时间
}

// 任务详情主体:三层进度(主体阶段 / 节点门禁 / 实施计划)+ 执行时间线 + 产物快查,活跃与归档共用同一套渲染。
// 产物清单按 taskId 懒加载(归档任务经 core 的 taskReadPath 回退仍可读),点开弹三栏只读窗;头/尾差异由插槽注入。
export function TaskDetailBody({
  panelTitle,
  taskId,
  project,
  title,
  phase,
  completed,
  node,
  stuck,
  implementation,
  timeline,
  header,
  footer,
}: TaskDetailBodyProps) {
  const t = useTranslations('viewDetail');
  const [docsState, setDocsState] = useState<{ id: string; docs: string[] } | null>(null); // 已取清单(按 id 标记)
  const [docsFailedId, setDocsFailedId] = useState<string | null>(null); // 取清单失败的 id(派生失败态)
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const { done, total, items } = implementation;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const query = `?project=${encodeURIComponent(project)}`;

  // 加载/失败态由 taskId 派生:清单与当前任务不一致即视作加载中(切任务自动回到加载态、清除旧失败态)。
  const docs = docsState?.id === taskId ? docsState.docs : null; // null = 加载中
  const docsFailed = docsFailedId === taskId;

  // 选中任务变化时按需取产物清单(只在详情读,不挂卡片,避免每卡 readdir)。setState 仅落异步回调。
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks/${encodeURIComponent(taskId)}/docs${query}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.docs)) setDocsState({ id: taskId, docs: data.docs });
        else setDocsFailedId(taskId);
      })
      .catch(() => {
        if (cancelled) return;
        setDocsFailedId(taskId);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, query]);

  return (
    <>
      <aside className="flex w-[336px] min-w-0 shrink-0 flex-col border-l border-line-strong bg-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
        <Scroller className="min-h-0 flex-1">
          <div className="flex items-center px-4 pt-3.5 pb-2.5">
            <span className="font-serif text-[15px] font-semibold">{panelTitle}</span>
          </div>

          <div className="px-4 pb-[18px]">
            <h2 className="mt-0.5 mb-4 break-words font-serif text-[20px] font-semibold leading-tight">{title}</h2>

            {header}

            <Layer label={t('phaseLayer')}>
              <PhaseStepper current={phase} completed={completed} />
            </Layer>

            <Layer label={t('gateLayer')}>
              {node ? (
                <div
                  className={`flex items-center justify-between gap-2 rounded-[9px] border px-2.5 py-2.5 text-[12.5px] font-semibold ${
                    stuck
                      ? 'border-terracotta/30 bg-terracotta-bg text-terracotta'
                      : 'border-teal/30 bg-teal-bg text-teal'
                  }`}
                >
                  <span>
                    {stuck ? '✗' : '✓'} {node}
                  </span>
                  {stuck && <span className="text-[11px] font-bold">{t('consecutiveFail')}</span>}
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-faint">{t('noNode')}</p>
              )}
            </Layer>

            <Layer label={t('implementationLayer', { done, total })}>
              <div className="mb-2.5 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-line bg-paper-sunken">
                  <span className="block h-full bg-teal" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] font-semibold text-ink-soft">
                  {done}/{total}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-[12px] text-ink-faint">{t('implementationEmpty')}</p>
              ) : (
                <details className="rounded-lg border border-line bg-paper/60 px-2.5 py-2">
                  <summary className="cursor-pointer text-[12px] font-semibold text-ink-soft">
                    {t('implementationSteps', { count: items.length })}
                  </summary>
                  <ul className="mt-2.5 flex min-w-0 flex-col gap-1.5 border-t border-dashed border-line pt-2.5">
                    {items.map(item => (
                      <li key={item.id} className="flex min-w-0 items-start gap-2 text-[12.5px] leading-snug">
                        <span className={`mt-0.5 shrink-0 text-[11px] ${item.done ? 'text-teal' : 'text-ink-faint'}`}>
                          {item.done ? '✓' : '○'}
                        </span>
                        <span
                          className={`min-w-0 break-words ${item.done ? 'text-ink-faint line-through' : 'text-ink-soft'}`}
                        >
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Layer>

            <Layer label={t('timelineLayer')}>
              {timeline.length === 0 ? (
                <p className="text-[12px] text-ink-faint">{t('timelineEmpty')}</p>
              ) : (
                <details className="rounded-lg border border-line bg-paper/60 px-2.5 py-2">
                  <summary className="cursor-pointer text-[12px] font-semibold text-ink-soft">
                    {t('timelineToggle', { count: timeline.length })}
                  </summary>
                  <ul className="mt-2.5 flex flex-col border-t border-dashed border-line pt-2.5">
                    {timeline.map((event, index) => (
                      <TimelineRow key={`${event.ts}-${index}`} event={event} />
                    ))}
                  </ul>
                </details>
              )}
            </Layer>

            {docsFailed ? (
              <Layer label={t('docsLayer')}>
                <p className="text-[12px] text-terracotta">{t('docsFailed')}</p>
              </Layer>
            ) : docs === null ? (
              <Layer label={t('docsLayer')}>
                <p className="text-[12px] text-ink-faint">{t('docsLoading')}</p>
              </Layer>
            ) : docs.length > 0 ? (
              <Layer label={t('docsLayer')}>
                <div className="flex flex-wrap gap-1.5">
                  {docs.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setOpenDoc(name)}
                      className="cursor-pointer rounded-md border border-line bg-paper px-2 py-1 font-mono text-[11.5px] text-ink-soft hover:border-line-strong hover:text-ink"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </Layer>
            ) : null}

            {footer}
          </div>
        </Scroller>
      </aside>

      {openDoc && (
        <TaskDocsModal
          taskId={taskId}
          project={project}
          docs={docs ?? []}
          initialName={openDoc}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </>
  );
}

// 带小标题的分层容器
export function Layer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-bold text-ink-faint">{label}</div>
      {children}
    </div>
  );
}

// 主体阶段步进器:已过=✓(teal)、当前=●(mustard)、未到=○(中性);current 为 null 时全部视作未到。
// completed=true(任务已完成):三阶段都走完 → 全绿,不把终点节点所在阶段误标为「进行中」。
export function PhaseStepper({ current, completed = false }: { current: Phase | null; completed?: boolean }) {
  const tPhase = useTranslations('phase');
  const currentIdx = completed ? PHASE_ORDER.length : current ? PHASE_ORDER.indexOf(current) : -1;

  return (
    <div className="flex items-center gap-1">
      {PHASE_ORDER.map((phase, i) => {
        const state = currentIdx < 0 ? 'todo' : i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo';
        return (
          <div key={phase} className="flex items-center gap-1">
            {i > 0 && <span className="h-px w-3 bg-line-strong" />}
            <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${stepTextClass(state)}`}>
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] ${stepMarkClass(state)}`}
              >
                {state === 'done' ? '✓' : state === 'active' ? '●' : '○'}
              </span>
              {tPhase(phase)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function stepTextClass(state: 'done' | 'active' | 'todo'): string {
  if (state === 'done') return 'text-teal';
  if (state === 'active') return 'text-mustard';
  return 'text-ink-soft';
}

function stepMarkClass(state: 'done' | 'active' | 'todo'): string {
  if (state === 'done') return 'bg-teal border-teal text-brand-ink border-[1.5px]';
  if (state === 'active') return 'bg-mustard border-mustard text-brand-ink border-[1.5px]';
  return 'bg-paper-sunken border-line-strong text-ink-faint border-[1.5px]';
}

// 时间线事件的语义色调:验收通过/小结/检查点=ok(teal)、验收未过=fail(terracotta)、
// 审批/回退/跳过=warn(mustard)、分支判定/会话注入/任务创建=neutral(ink-faint)。对齐 visual-design §6.5。
type EventTone = 'ok' | 'fail' | 'warn' | 'neutral';

function eventTone(event: TimelineEventView): EventTone {
  if (event.type === 'complete_attempt') return event.ok ? 'ok' : 'fail';
  if (event.type === 'note' || event.type === 'checkpoint') return 'ok';
  if (event.type === 'approval' || event.type === 'rewind' || event.type === 'skip') return 'warn';
  return 'neutral';
}

function eventDotClass(tone: EventTone): string {
  if (tone === 'ok') return 'bg-teal';
  if (tone === 'fail') return 'bg-terracotta';
  if (tone === 'warn') return 'bg-mustard';
  return 'bg-ink-faint';
}

function eventTextClass(tone: EventTone): string {
  if (tone === 'ok') return 'text-teal';
  if (tone === 'fail') return 'text-terracotta';
  if (tone === 'warn') return 'text-mustard';
  return 'text-ink-soft';
}

// 事件类型 → viewDetail.event.* 文案 key
function eventLabelKey(event: TimelineEventView): string {
  switch (event.type) {
    case 'complete_attempt':
      return event.ok ? 'event.completePass' : 'event.completeFail';
    case 'decision':
      return 'event.decision';
    case 'rewind':
      return 'event.rewind';
    case 'skip':
      return 'event.skip';
    case 'approval':
      return 'event.approval';
    case 'task_created':
      return 'event.taskCreated';
    case 'note':
      return 'event.note';
    case 'checkpoint':
      return 'event.checkpoint';
    case 'prompt':
      return 'event.prompt';
    default:
      return 'event.sessionStart'; // session_start
  }
}

// 时间线单条事件:左侧连续轴 + 语义色点,右侧时间 / 文案(节点·操作人)/ 详情。
// note 展小结、checkpoint 展条目文本;session_start 快照与 prompt 正文同构折叠;其余 reason 单行截断。纯展示。
export function TimelineRow({ event }: { event: TimelineEventView }) {
  const t = useTranslations('viewDetail');
  const tone = eventTone(event);

  // 折叠正文:session_start 用快照、prompt 用消息正文(同一展开交互,不同提示文案)。
  const foldBody = event.snapshot ?? (event.type === 'prompt' ? event.text : null);
  const foldToggleKey = event.type === 'prompt' ? 'event.promptToggle' : 'event.snapshotToggle';

  return (
    <li className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <span className={`mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full ring-2 ring-paper ${eventDotClass(tone)}`} />
        <span className="mt-1 w-px flex-1 bg-line" />
      </div>
      <div className="min-w-0 flex-1 pb-2.5">
        <time suppressHydrationWarning className="font-mono text-[11px] text-ink-soft">
          {formatLocalDateTime(event.ts)}
        </time>
        <div className="text-[12.5px] leading-snug">
          <span className={`font-semibold ${eventTextClass(tone)}`}>{t(eventLabelKey(event))}</span>
          {event.node && <span className="ml-1.5 text-ink-soft">{t('event.node', { node: event.node })}</span>}
          {event.by && <span className="ml-1.5 text-ink-faint">{t('event.by', { by: event.by })}</span>}
        </div>
        {event.summary && (
          <div className="mt-0.5 whitespace-pre-wrap break-words text-[11.5px] text-ink-soft">{event.summary}</div>
        )}
        {event.type === 'checkpoint' && event.text && (
          <div className="mt-0.5 truncate text-[11.5px] text-ink-soft">{event.text}</div>
        )}
        {event.reason && <div className="mt-0.5 truncate text-[11.5px] text-ink-soft">{event.reason}</div>}
        {foldBody && (
          <details className="mt-0.5">
            <summary className="cursor-pointer text-[11px] text-ink-faint">{t(foldToggleKey)}</summary>
            <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-paper-sunken/60 p-2 font-mono text-[11px] text-ink-soft">
              {foldBody}
            </pre>
          </details>
        )}
      </div>
    </li>
  );
}
