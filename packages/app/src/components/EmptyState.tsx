interface EmptyStateProps {
  title: string;
  hint: string;
  icon?: string;
}

// 通用空态/占位:用于未选项目、全局视图、以及尚未实现的视图。
export function EmptyState({ title, hint, icon = '⌇' }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-paper text-2xl text-teal shadow-card">
        {icon}
      </div>
      <div className="font-serif text-2xl font-semibold text-ink">{title}</div>
      <p className="max-w-sm text-sm leading-relaxed text-ink-soft">{hint}</p>
    </div>
  );
}
