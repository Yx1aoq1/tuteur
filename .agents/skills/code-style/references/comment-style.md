# 注释与文档规则

本文件定义 `code-style` 的 `default TS/JS preset` 中的 `comment-doc` 规则。

## 适用范围

- 目标范围内已纳入 `comment-doc` 覆盖范围的函数注释（对外 API、复用型 Hook、复用型工具函数，以及用户明确指定需要统一注释的其他函数）
- TypeScript 顶层声明说明（`interface/type/enum/const`）
- TypeScript 对象类型与内联对象字段排版
- 一次性局部帮助函数或未纳入覆盖范围的内部函数，默认不因宽泛风格请求而补完整 JSDoc；仅在已有注释基础上做保守格式化

## 规则

1. 顶层声明注释形态

- 函数使用 `/** ... */`（JSDoc）。
- 单行的 `const/interface/type/enum` 顶层摘要优先使用 `//`。
- 字段与成员的单行注释使用 `//`，仅当说明需要写成多行解释时才使用 `/** ... */`。
- 仅当顶层说明必须写成多行解释时，才对非函数声明使用块注释。

2. JSDoc 字段

- 以下字段要求仅适用于已纳入 `comment-doc` 覆盖范围的函数，不默认扩展到所有局部函数。
- 至少包含一句“做什么”的概述。
- 有参数时补 `@param`。
- 返回标签统一使用 `@return`，不要使用 `@returns`。
- 返回值需要补充业务语义、边界条件、单位、空值 / 异常约束时补 `@return`。
- 在 TypeScript 文件中，`@return` 只写补充说明，不重复函数签名里已经表达的类型声明；类型信息优先依赖 TypeScript 类型注解与推导。
- 若返回语义显然，或 `@return` 只会机械重复类型签名，则省略 `@return`。
- 复杂行为再补 `@description`，避免冗余。

3. `@example` 规则

- 仅在本次任务命中 `comment-doc`，且函数属于对外 API、复用型 Hook 或复用型工具函数时，才要求补 `@example`。
- React Component、一次性局部帮助函数、显然的简单透传函数，默认不要求补 `@example`。
- pure function 示例应包含调用与结果：
  - `fn(args);`
  - `// => expected`
- 非确定性函数（随机、时间、外部状态）只保留调用示例。
- API 请求封装、IO、时间、随机、外部状态读取等函数均视为非确定性函数。

4. `interface/type/enum` 可读性

- `interface/type/enum` 顶层声明需要摘要说明。
- `enum` 本身需要顶层说明；成员在语义不显然时保留成员注释，并在同一 `enum` 内保持风格一致。
- `enum` 成员按“注释 + 成员”为一组，组间保留 1 个空行。
- `enum` 成员注释单行使用 `//`，仅当成员说明必须写成多行解释时才使用 `/** ... */`。
- `interface/type` 字段按“注释 + 字段”为一组，组间保留 1 个空行。
- `interface/type` 字段注释单行使用 `//`，仅当字段说明必须写成多行解释时才使用 `/** ... */`。
- 内联对象字段遵循同样规则。
- 只有一句话的字段说明优先收敛为单行 `//`；需要补充取值、约束或上下文时再使用多行块。
- 不要机械为每个显而易见的字段补无信息增量的注释；优先为缩写、嵌套结构、约束、单位、枚举含义或跨上下文字段补说明。

5. 注释文案风格

- 优先使用短语式、定义式说明，避免机械句号腔。
- 不要只重复标识符字面含义；优先补语义、用途、约束、单位或上下文。
- 同一声明块内保持注释粒度和语气一致。
- 未明确要求语义重写时，默认执行保守格式化：不主动重写已有说明文案，优先统一注释形态与结构；除规则要求的最小补充外，尽量保留现有注释覆盖率，不主动扩大文案改写范围。

## 示例

### 顶层声明注释形态

```ts
// Agent 任务状态
export enum AgentTaskStatus {
  // 待执行
  Pending = 0,

  // 执行中
  Running = 1,
}

// 任务配置项
export interface QueryTaskConfigItem {
  // 配置 ID
  id: number | string;

  // 配置名称
  name: string;
}
```

### 字段单行 / 多行切换

```ts
export interface QueryTaskHistoryResponse {
  list: {
    // 消息 ID
    msg_id: string;

    /**
     * 任务状态
     * 0 待执行、1 执行中、2 失败、9 超时、10 成功
     */
    task_status: number;
  }[];
}
```

### API 请求函数注释

```ts
/**
 * 查询任务执行结果
 *
 * @param id 消息 ID
 *
 * @example
 * await queryAgentTask('msg-id');
 */
export const queryAgentTask = (id: string): Promise<BaseResult<QueryAgentTaskResponse>> => {
  return request<QueryAgentTaskResponse>({
    url: QUERY_AGENT_TASK_URL,
    method: 'GET',
    params: {
      msg_id: id,
    },
  });
};
```

### 返回值说明非显然时补 `@return`

```ts
/**
 * 读取当前模板的可打印区域
 *
 * @param view 当前视角配置
 * @return 返回首个可用打印区域；未配置时返回 `null`
 */
export const getPaintingBox = (view: ProductView): PaintingBox | null => {
  return view.meta_data?.painting_box ?? null;
};
```
