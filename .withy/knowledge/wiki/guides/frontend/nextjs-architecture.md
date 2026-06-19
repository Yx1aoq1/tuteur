---
id: nextjs-architecture
title: 'Next.js 核心架构规范'
scope: project
kind: spec
tags: [guide, frontend, nextjs, app-router, convention]
summary: '前端规范指南:Next.js App Router 项目分层目录、appTemplates 页面模块结构、命名约定、文件路由、next-intl 国际化、错误边界。'
inject: index
injectByDefault: false
updated: 2026-06-19
---

# Next.js 核心架构规范

## 1. 项目结构

### 完整目录树结构

```text
├── messages/                   # 国际化 多语言翻译 (next-intl)
├── public/                     # 公共资源，放一些不需要经过编译的文件
├── scripts/                    # 自定义脚本，工程化相关
│   ├── manage.mjs              # 核心脚本：根据不同环境变量启动服务，构建服务
│   ├── next/                   # Next.js 相关特定脚本
│   │   ├── genDesignToken.mjs  # 生成样式变量，执行后创建 src/styles/css-variables.css
│   │   ├── genRoutes.mjs       # 动态监听 src/app/[locale] 目录结构生成 src/constants/routes.ts
│   │   └── ...
│   └── utils.mjs               # 脚本通用工具函数
├── src/                        # 源代码目录 (见下文详细 breakdown)
├── .env.*                      # 环境变量文件
├── next.config.mjs             # Next.js 配置文件
└── package.json                # 项目依赖配置
```

### Src 源码目录详解

`src` 目录是项目的核心，采用了模块化与分层设计的原则：

```text
src/
├── apis/                   # 接口请求层
│   ├── queries/            # Get 请求封装 (React Query useQuery)
│   ├── mutations/          # Post/Put/Delete 请求封装 (React Query useMutation)
│   └── ...                 # 请求工具类与类型定义
├── app/                    # Next.js App Router 路由层
│   └── [locale]/           # 国际化路由入口，仅负责路由定义，具体实现委托给 appTemplates
├── appTemplates/           # 页面逻辑层 (扁平化目录)
│   └── [PageName]/         # 每个页面一个独立文件夹，包含该页面独有的组件、样式、Hooks
├── assets/                 # 静态资源层
│   ├── images/             # 图片资源
│   ├── fonts/              # 字体文件
│   └── ...
├── components/             # 全局组件层
│   # 仅存放被多个页面 (appTemplates) 复用的通用组件
│   # 页面私有组件应存放在 appTemplates/[PageName]/components
├── constants/              # 全局常量层
│   # 存放路由表、枚举值、配置项等静态数据
├── contexts/               # 全局状态层
│   # 基于 Context API 或 Zustand 的全局状态管理
├── hooks/                  # 全局 Hooks 层
│   # 存放通用的自定义 Hooks (如 useWindowSize, useAuth 等)
├── i18n/                   # 国际化配置层
│   # next-intl 的配置与导航封装
├── icons/                  # 图标组件层
│   # SVG Icon 组件集合
├── middlewares/            # 中间件逻辑层
│   # 拆分的中间件处理函数 (如 路由重定向、权限校验逻辑)
├── navigation/             # 导航组件层
│   # 封装的 Link 组件与路由跳转逻辑 (含登录拦截等)
├── services/               # 业务服务层
│   # 复杂的业务逻辑封装，独立于 UI 组件之外的处理层
├── store/                  # 全局状态管理 (Zustand Stores)
│   # 定义全局 Store Slices
├── styles/                 # 全局样式层
│   # 全局 CSS 变量、Mixins、Antd 主题覆盖
├── types/                  # 全局类型层
│   # 通用的 TypeScript 类型定义 (.d.ts)
├── utils/                  # 工具函数层
│   # 纯函数工具集合
├── global.d.ts             # 全局类型声明补充
├── instrumentation.ts      # 监控埋点配置 (Sentry)
└── middleware.ts           # Next.js 中间件入口 (聚合 middlewares 目录下的逻辑)
```

### 页面模块结构规范 (appTemplates)

`src/appTemplates` 目录下的每个页面文件夹应遵循以下结构：

```text
src/appTemplates/A_SPECIFIC_PAGE/
├── Banner/                     # 页面内模块拆分的子组件
│   ├── index.module.scss       # 组件私有样式
│   └── index.tsx               # 组件逻辑
├── index.module.scss           # 页面主样式 (模块化隔离)
├── index.tsx                   # 页面主入口 (src/app 路由直接引用此处)
├── store.ts                    # 模块所需的状态存储管理 (Zustand Slice)
├── type.ts                     # 模块私有类型声明 (公共类型抽离至全局)
├── use[Feature].ts             # 模块私有 Hooks (逻辑复用)
└── demo.tsx                    # (可选) Demo 展示或测试用例
```

### 文件命名约定

| 类型     | 约定                  | 示例             |
| -------- | --------------------- | ---------------- |
| 组件     | PascalCase            | `HabitCard.tsx`  |
| Hooks    | camelCase, `use` 前缀 | `useHabits.ts`   |
| 工具函数 | camelCase             | `formatDate.ts`  |
| 常量     | SCREAMING_SNAKE_CASE  | `API_BASE_URL`   |
| CSS/样式 | kebab-case            | `habit-card.css` |

### Barrel 导出

```javascript
// features/habits/index.js
export { HabitCard } from './components/HabitCard';
export { HabitForm } from './components/HabitForm';
export { useHabits } from './hooks/useHabits';

// 在其他地方使用
import { HabitCard, useHabits } from '@/features/habits';
```

**注意**：Barrel 导出可能会影响大型项目的 tree-shaking 和构建时间。请谨慎使用。

---

## 8. 路由（Next.js App Router）

### 文件系统路由

Next.js 使用基于文件系统的路由，无需配置：

```text
app/
├── layout.tsx           # 根布局
├── page.tsx            # 首页 (/)
├── habits/
│   ├── page.tsx        # 习惯列表 (/habits)
│   └── [habitId]/
│       └── page.tsx    # 习惯详情 (/habits/:habitId)
├── settings/
│   └── page.tsx        # 设置页面 (/settings)
└── not-found.tsx       # 404 页面
```

### 页面组件

```tsx
// app/page.tsx (首页)
export default function HomePage() {
  return <Dashboard />;
}

// app/habits/page.tsx (列表页)
export default function HabitsPage() {
  return <HabitList />;
}

// app/habits/[habitId]/page.tsx (动态路由)
export default function HabitDetailPage({ params }: { params: { habitId: string } }) {
  return <HabitDetail habitId={params.habitId} />;
}
```

### 布局组件

```tsx
// app/layout.tsx (根布局)
import Link from 'next/link';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen">
          <nav className="bg-white shadow">
            <Link href="/">Dashboard</Link>
            <Link href="/settings">Settings</Link>
          </nav>
          <main className="container mx-auto p-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

### 路由参数与查询参数

```tsx
// app/habits/[habitId]/page.tsx
import { notFound } from 'next/navigation';

type Props = {
  params: { habitId: string };
  searchParams: { month?: string };
};

export default function HabitDetailPage({ params, searchParams }: Props) {
  const { habitId } = params;
  const month = searchParams.month || getCurrentMonth();

  if (!habitId) {
    notFound(); // 跳转到 404 页面
  }

  return (
    <div>
      <h1>习惯详情: {habitId}</h1>
      <p>月份: {month}</p>
    </div>
  );
}
```

### 导航

```tsx
'use client'; // 客户端组件

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

function Navigation() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav>
      {/* 简单链接 */}
      <Link href="/settings">设置</Link>

      {/* 活动状态样式 */}
      <Link href="/" className={pathname === '/' ? 'text-primary' : 'text-gray-600'}>
        Dashboard
      </Link>

      {/* 编程式导航 */}
      <button onClick={() => router.push('/habits/1')}>查看习惯</button>
      <button onClick={() => router.back()}>返回</button>
      <button onClick={() => router.replace('/')}>替换历史</button>
    </nav>
  );
}
```

---

## 9. 国际化 (i18n)

项目使用 `next-intl` 实现多语言支持，支持服务端和客户端翻译。

### 翻译文件结构

```text
messages/
├── zh-CN.json    # 简体中文翻译
└── en-US.json    # 英文翻译
```

### 路由结构

Next.js 自动为每个语言创建独立路由：

```text
app/
└── [locale]/
    ├── layout.tsx      # 语言布局
    ├── page.tsx        # 首页 (支持 /zh-CN 和 /en-US)
    └── dashboard/
        └── page.tsx    # /zh-CN/dashboard 和 /en-US/dashboard
```

### 服务端组件翻译

```tsx
// app/[locale]/page.tsx
import { getTranslations } from 'next-intl/server'

export default async function HomePage() {
  const t = await getTranslations('HomePage')

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </div>
  )
}

// messages/zh-CN.json
{
  "HomePage": {
    "title": "欢迎",
    "description": "这是首页"
  }
}
```

### 客户端组件翻译

```tsx
'use client';

import { useTranslations } from 'next-intl';

export default function ClientComponent() {
  const t = useTranslations('ClientComponent');

  return (
    <div>
      <h2>{t('heading')}</h2>
      <button>{t('submit')}</button>
    </div>
  );
}
```

### 带参数的翻译

```tsx
// messages/zh-CN.json
{
  "greeting": "你好，{name}！",
  "itemCount": "你有 {count} 个项目"
}

// 使用
const t = useTranslations()
<p>{t('greeting', { name: '张三' })}</p>
<p>{t('itemCount', { count: 5 })}</p>
```

### 语言切换

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLanguage = (newLocale: string) => {
    // 替换路径中的 locale
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <div>
      <button onClick={() => switchLanguage('zh-CN')}>中文</button>
      <button onClick={() => switchLanguage('en-US')}>English</button>
    </div>
  );
}
```

### 配置 next-intl

```typescript
// src/i18n/request.ts
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`../../messages/${locale}.json`)).default,
}));

// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh-CN', 'en-US'],
  defaultLocale: 'zh-CN',
});
```

### 中间件配置

```typescript
// src/middleware.ts
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
```

---

## 10. 错误处理

### 错误边界（Error Boundaries）

```tsx
// app/error.tsx (Next.js 错误边界)
'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded">
      <h2>出错了</h2>
      <p className="text-sm text-red-600">{error.message}</p>
      <button onClick={reset}>重试</button>
    </div>
  );
}

// app/global-error.tsx (全局错误边界)
('use client');

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <h2>全局错误</h2>
        <p>{error.message}</p>
        <button onClick={reset}>重试</button>
      </body>
    </html>
  );
}
```

### 异步错误处理

```tsx
function HabitList() {
  const { data, error, isError, refetch } = useHabits();

  if (isError) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded">
        <p>加载习惯失败: {error.message}</p>
        <button onClick={() => refetch()}>重试</button>
      </div>
    );
  }

  return <ul>{/* ... */}</ul>;
}
```

### Toast 通知（使用 Ant Design）

```tsx
import { App } from 'antd';

function useCreateHabit() {
  const { message } = App.useApp();

  return useMutation({
    mutationFn: createHabit,
    onSuccess: () => {
      message.success('习惯创建成功！');
    },
    onError: error => {
      message.error(`创建失败: ${error.message}`);
    },
  });
}
```

---

## 参考资源

- [Next.js 文档](https://nextjs.org/docs)
- [next-intl](https://next-intl.dev/)

---

## 关联页

- [[react-patterns]] · [[web]]
