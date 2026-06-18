// 全局 /settings 的独立布局(先留空):不含项目侧栏,仅承托内容。
// 后续将放全局配置专属的导航/外框。
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="tt-grain flex min-h-screen flex-col">{children}</div>;
}
