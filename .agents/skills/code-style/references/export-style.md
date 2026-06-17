# Export 风格规则

本文件定义 `code-style` 的 `default TS/JS preset` 中的 `export/barrel` 规则。

## 适用范围

- 目标范围内的 `index.ts`、`index.tsx`、`index.js`、`index.jsx`
- 其他以“集中导出”为职责的 barrel 文件

## 期望输出

- 仅改 `export` 相关顺序、分组、空行与格式。
- 不改变业务语义、不新增/删除导出成员（除非用户明确要求）。
- 保持最小 diff。

## 规则

1. 按声明形态分层

- 单行 `export` 在前。
- 多行 `export` 在后。
- 单行与多行之间保留 1 个空行。

2. 单行 `export` 行排序

- 按整行字符长度从长到短排序。

3. 命名风格分组

- 按成员命名风格分组，组间保留 1 个空行。
- 分组顺序：`PascalCase` -> `camelCase` -> `UPPER_SNAKE_CASE`。

4. `PascalCase` 组内约束

- 单行 `PascalCase export` 在前。
- 多行 `PascalCase export`（如 `export type { ... }`）在后。

5. 多行 `export` 规则

- 多行块之间保留 1 个空行。
- 每个多行块内部成员按成员名长度从长到短排序。

6. 单行成员规则

- 单行 `export { ... }` 内成员按成员名长度从长到短排序。
