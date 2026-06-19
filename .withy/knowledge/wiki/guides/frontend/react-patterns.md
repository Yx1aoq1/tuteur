---
id: react-patterns
title: 'React 开发模式与逻辑规范'
scope: project
kind: spec
tags: [guide, frontend, react, hooks, convention]
summary: '前端规范指南:React 组件设计与组合、状态管理选型、自定义 Hooks 与 useEffect 陷阱、常见反例。'
inject: index
injectByDefault: false
updated: 2026-06-19
---

# React 开发模式与逻辑规范

## 2. 组件设计

### 函数组件

```jsx
// 简单组件
function HabitCard({ habit, onComplete }) {
  return (
    <div className="p-4 border rounded">
      <h3>{habit.name}</h3>
      <button onClick={() => onComplete(habit.id)}>Complete</button>
    </div>
  );
}

// 带默认 props
function HabitCard({ habit, onComplete, showStreak = true }) {
  // ...
}

// 在参数中解构
function HabitCard({ habit: { id, name, streak }, onComplete }) {
  // ...
}
```

### 组件组合

```jsx
// 复合组件模式
function Card({ children, className }) {
  return <div className={`border rounded ${className}`}>{children}</div>;
}

Card.Header = function CardHeader({ children }) {
  return <div className="p-4 border-b font-bold">{children}</div>;
};

Card.Body = function CardBody({ children }) {
  return <div className="p-4">{children}</div>;
};

// 使用方式
<Card>
  <Card.Header>Habit Details</Card.Header>
  <Card.Body>Content here</Card.Body>
</Card>;
```

### Props 设计

```jsx
// 优先使用具体的 props 而非展开
// 好的做法
function Button({ onClick, disabled, children, variant = 'primary' }) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// 避免过度展开
// 不好的做法 - 难以知道接受哪些 props
function Button(props) {
  return <button {...props} />;
}

// 接受 className 以提供样式灵活性
function Card({ children, className = '' }) {
  return <div className={`base-styles ${className}`}>{children}</div>;
}
```

### Children 模式

```jsx
// 使用 Children 进行组合
function Layout({ children }) {
  return (
    <div className="container mx-auto">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

// Render props 提供更多控制
function HabitList({ habits, renderItem }) {
  return (
    <ul>
      {habits.map(habit => (
        <li key={habit.id}>{renderItem(habit)}</li>
      ))}
    </ul>
  );
}

// 使用方式
<HabitList habits={habits} renderItem={habit => <HabitCard habit={habit} />} />;
```

---

## 3. 状态管理

### 何时使用什么

| 状态类型        | 解决方案                    |
| --------------- | --------------------------- |
| 服务器/异步数据 | TanStack Query              |
| 表单状态        | react-hook-form 或 useState |
| 本地 UI 状态    | useState                    |
| 共享 UI 状态    | Context 或 Zustand          |
| URL 状态        | Next.js Router              |

### useState 最佳实践

```jsx
// 将相关状态分组
const [habit, setHabit] = useState({ name: '', description: '' });

// vs 多个 useState（独立值时可以）
const [name, setName] = useState('');
const [isOpen, setIsOpen] = useState(false);

// 基于先前值的函数式更新
setCount(prev => prev + 1);

// 延迟初始化昂贵的状态
const [data, setData] = useState(() => expensiveComputation());
```

### 状态提升

```jsx
// 父组件拥有状态，子组件通过 props 接收
function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());

  return (
    <>
      <DatePicker date={selectedDate} onChange={setSelectedDate} />
      <HabitList date={selectedDate} />
      <Stats date={selectedDate} />
    </>
  );
}
```

### Context API

```jsx
// 创建 context
const HabitContext = createContext(null);

// Provider 组件
function HabitProvider({ children }) {
  const [habits, setHabits] = useState([]);

  const value = {
    habits,
    addHabit: habit => setHabits(prev => [...prev, habit]),
    removeHabit: id => setHabits(prev => prev.filter(h => h.id !== id)),
  };

  return <HabitContext.Provider value={value}>{children}</HabitContext.Provider>;
}

// 消费 context 的自定义 hook
function useHabitContext() {
  const context = useContext(HabitContext);
  if (!context) {
    throw new Error('useHabitContext must be used within HabitProvider');
  }
  return context;
}

// 使用方式
function HabitList() {
  const { habits, removeHabit } = useHabitContext();
  // ...
}
```

### Zustand（Redux 的简单替代）

```javascript
// store/habits.js
import { create } from 'zustand';

const useHabitStore = create(set => ({
  selectedHabitId: null,
  filterStatus: 'all',
  setSelectedHabit: id => set({ selectedHabitId: id }),
  setFilter: status => set({ filterStatus: status }),
}));

// 在组件中使用
function HabitFilter() {
  const { filterStatus, setFilter } = useHabitStore();
  // ...
}
```

---

## 7. Hooks 模式

### 自定义 Hooks

```typescript
// useLocalStorage
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

// useDebounce
function useDebounce<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// useToggle
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle] as const;
}
```

### useEffect 模式

```tsx
// 清理函数
useEffect(() => {
  const controller = new AbortController();

  fetch('/api/data', { signal: controller.signal })
    .then(res => res.json())
    .then(setData);

  return () => controller.abort(); // 组件卸载时清理
}, []);

// 事件监听器
useEffect(() => {
  const handleResize = () => setWidth(window.innerWidth);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);

// 与外部系统同步
useEffect(() => {
  const subscription = externalStore.subscribe(setData);
  return () => subscription.unsubscribe();
}, []);
```

### useEffect 常见陷阱

```tsx
// ❌ 错误：缺少依赖项
useEffect(() => {
  fetchData(userId); // userId 不在依赖项中 - 过时的闭包
}, []);

// ✅ 正确：包含所有依赖项
useEffect(() => {
  fetchData(userId);
}, [userId]);

// ❌ 错误：依赖项中的对象/数组（每次渲染创建新引用）
useEffect(() => {
  doSomething(options); // options = {} 每次渲染创建新对象
}, [options]);

// ✅ 正确：缓存或使用原始值
const memoizedOptions = useMemo(() => options, [options.key1, options.key2]);
useEffect(() => {
  doSomething(memoizedOptions);
}, [memoizedOptions]);
```

---

## 13. 反例

### 常见错误

| 反例                      | 问题               | 解决方案                |
| ------------------------- | ------------------ | ----------------------- |
| Props 层层传递            | 难以维护           | 使用 Context 或组合模式 |
| 巨型组件                  | 难以测试和维护     | 拆分为更小的组件        |
| 用 useEffect 处理派生状态 | 不必要的复杂性     | 在渲染期间计算          |
| 用 index 作为 key         | 重新排序时出现 bug | 使用稳定的唯一 ID       |
| 直接操作 DOM              | 与 React 冲突      | 谨慎使用 refs           |

### 代码示例

```tsx
// ❌ 错误：用 useEffect 处理派生状态
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// ✅ 正确：在渲染期间计算
const fullName = `${firstName} ${lastName}`;

// ❌ 错误：用 index 作为 key（列表变化时会出现 bug）
{
  items.map((item, index) => <Item key={index} item={item} />);
}

// ✅ 正确：使用稳定的唯一 ID
{
  items.map(item => <Item key={item.id} item={item} />);
}

// ❌ 错误：在 useEffect 中获取数据但没有清理
useEffect(() => {
  fetch('/api/data')
    .then(res => res.json())
    .then(setData);
}, []);

// ✅ 正确：使用 TanStack Query 或添加清理函数
useEffect(() => {
  let cancelled = false;
  fetch('/api/data')
    .then(res => res.json())
    .then(data => {
      if (!cancelled) setData(data);
    });
  return () => {
    cancelled = true;
  };
}, []);
```

---

## 参考资源

- [React 文档](https://react.dev/)
- [Zustand](https://zustand-demo.pmnd.rs/)

---

## 关联页

- [[nextjs-architecture]] · [[web]]
