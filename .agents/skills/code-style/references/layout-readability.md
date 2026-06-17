# 可读性排版规则

本文件定义 `code-style` 的 `default TS/JS preset` 中的 `layout-readability` 规则。

## 适用范围

- 函数、Hook 与对象方法内部的语句级空行
- 顶层摘要注释与顶层 `const` 声明组成的声明组空行
- 状态对象 / 配置对象 / 普通对象字面量的成员分组
- 字典对象成员排版与按需排序
- 直接透传 Promise 的异步样板精简
- 不涉及 JSDoc、`@example`、顶层说明或字段说明的纯可读性排版请求

## 规则

1. 语句空行

- 变量声明段结束后，若后续是控制流或副作用调用，保留 1 个空行。
- `if/else if/else`、`try/catch/finally`、`switch` 分支块结束后，若后续仍有语句，保留 1 个空行。
- 不允许仅为“看起来整齐”而机械插入空行，优先减少噪音 diff。

2. 顶层声明组空行

- 顶层单行摘要注释与其后紧邻的顶层 `const` 视为一个声明组。
- 相邻声明组之间保留 1 个空行。
- 该规则仅适用于顶层，不自动扩展到函数内部或局部 `const`。
- 没有前置摘要注释的顶层 `const`，不因本规则被强制补空行。

3. 对象成员分组

- 状态对象 / 配置对象 / 普通对象字面量内，成员按语义分组，组间保留 1 个空行。
- 对象内方法成员之间保留 1 个空行。
- 只调整分组与空行，不改键名、方法名与值语义。

4. 字典对象排版

- 键值项按逻辑分组，组间保留 1 个空行。
- 若用户明确要求排序：按“键名字符长度”执行排序，并遵循用户指定方向（升序或降序）。
- 当键名长度相同：按键名字母序排序（A-Z）。
- 若用户未明确要求排序：保持原有顺序不变。

5. Promise 透传精简

- 直接返回 Promise 的透传函数不使用 `async`。
- `async` 函数中不保留无意义的 `return await`。
- 仅当本地错误处理、`try/catch`、`finally` 或后续控制流确实依赖 awaited rejection 时，才保留 `return await`。
- 这类调整属于可读性 / 样板精简，不属于业务重构；不改变返回类型标注，也不改动实际请求参数与控制流结构。

6. 分层边界

- 命中本层时，不主动补 JSDoc、`@example`、顶层说明或字段说明。
- 若用户同时提出文档规范与空行可读性，需同时命中 `comment-doc` 与 `layout-readability`。

## 示例

### 对象成员分组空行

调整前：

```ts
const state = {
  expiresAt: null,
  hydrate() {
    const value = load();
    if (!value) {
      clear();
      return;
    }
    apply({ expiresAt: value });
  },
  clear() {
    clearLocal();
  },
};
```

调整后：

```ts
const state = {
  expiresAt: null,

  hydrate() {
    const value = load();

    if (!value) {
      clear();
      return;
    }

    apply({ expiresAt: value });
  },

  clear() {
    clearLocal();
  },
};
```

### 声明段与控制流空行

调整前：

```ts
const value = readValue();
const isReady = checkReady(value);
if (!isReady) {
  return null;
}
sendMetric(value);
```

调整后：

```ts
const value = readValue();
const isReady = checkReady(value);

if (!isReady) {
  return null;
}

sendMetric(value);
```

### 顶层摘要注释 + 顶层 `const` 组间空行

调整前：

```ts
// 发布灵感
export const PUBLISH_INSPIRATION_URL = '/v1/inspiration/publish';
// 用户预加载信息
export const USER_PRELOAD_URL = '/v1/user/preload';
```

调整后：

```ts
// 发布灵感
export const PUBLISH_INSPIRATION_URL = '/v1/inspiration/publish';

// 用户预加载信息
export const USER_PRELOAD_URL = '/v1/user/preload';
```

### Promise 透传精简

调整前：

- 直接透传 Promise 却保留 `async` 包裹，或在 `async` 函数里保留无意义的 `return await`。

调整后：

```ts
export const queryAgentTask = (id: string): Promise<Result> => {
  return request<Result>({
    url: QUERY_URL,
    params: { id },
  });
};
```
