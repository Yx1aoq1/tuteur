// 本地时区时间格式化(单一来源,活跃时间线与归档展示共用)。
// 用 Intl.formatToParts 按开发者本机时区取分量,再拼成稳定的 MM-DD / YYYY-MM-DD / MM-DD HH:mm,
// 避开直接切 UTC 串导致的跨午夜日期漂移;消费方用 <time suppressHydrationWarning> 兜住 SSR/CSR 残余差异。
// hourCycle:'h23' 保证午夜显示 00 而非 24。

type Part = 'year' | 'month' | 'day' | 'hour' | 'minute';

function localParts(iso: string): Record<Part, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));

  const get = (type: Part): string => parts.find(part => part.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** 本地时区 MM-DD HH:mm,用于执行时间线单条事件。 */
export function formatLocalDateTime(iso: string): string {
  const p = localParts(iso);
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** 本地时区 MM-DD,用于归档列表行。 */
export function formatLocalDay(iso: string): string {
  const p = localParts(iso);
  return `${p.month}-${p.day}`;
}

/** 本地时区 YYYY-MM-DD,用于归档详情面板。 */
export function formatLocalDate(iso: string): string {
  const p = localParts(iso);
  return `${p.year}-${p.month}-${p.day}`;
}
