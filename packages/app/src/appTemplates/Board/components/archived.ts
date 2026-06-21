import type { ArchivedStatus } from '@/types/dashboard';
import { formatLocalDate, formatLocalDay } from './time';

// 归档终态 → 展示样式(label 文案经 i18n,archived.status.<key>)。纯客户端安全,无 core 依赖。
// icon/text 用于列表行(单字图标 + 文本色),pill 用于详情面板的状态徽标。复用语义色:通过=teal、取消=terracotta、其它=中性。
export const ARCHIVED_STATUS_META: Record<ArchivedStatus, { icon: string; text: string; pill: string }> = {
  completed: { icon: '✓', text: 'text-teal', pill: 'text-teal bg-teal-bg' },
  cancelled: { icon: '✗', text: 'text-terracotta', pill: 'text-terracotta bg-terracotta-bg' },
  in_progress: { icon: '○', text: 'text-ink-faint', pill: 'text-ink-soft bg-paper-sunken' },
  planning: { icon: '○', text: 'text-ink-faint', pill: 'text-ink-soft bg-paper-sunken' },
};

/**
 * 归档时间戳取本地时区 MM-DD,用于列表行右侧。
 * @param iso 形如 2026-06-12T08:30:00.000Z 的 ISO 时间戳
 */
export function formatArchivedDay(iso: string): string {
  return formatLocalDay(iso);
}

/**
 * 归档时间戳取本地时区 YYYY-MM-DD,用于详情面板。
 * @param iso 形如 2026-06-12T08:30:00.000Z 的 ISO 时间戳
 */
export function formatArchivedDate(iso: string): string {
  return formatLocalDate(iso);
}
