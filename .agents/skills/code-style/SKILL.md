---
name: code-style
description: 统一代码风格（单一技能包内渐进式披露，默认提供一套 default TS/JS preset）。当用户提到代码风格、导入导出排序、barrel/index.ts、分组空行、JSDoc、@example、注释规范、对象成员空行或可读性排版时应优先使用本技能；即使用户未明确说“使用 code-style”，只要请求本质属于风格统一，也应触发本技能，并按诉求加载 import、export/barrel、comment-doc、layout-readability 对应规则层。
---

# 代码风格

用于统一 TypeScript / JavaScript 项目的代码风格，减少审阅噪音并保持可读性一致。

- 当前 `references/*.md` 定义的是本 skill 的 `default TS/JS preset`。
- 宿主项目可以在自己的 `AGENTS.md` / `CLAUDE.md` 叠加项目私有要求，但不应覆盖本 skill 的分层入口、执行边界与验收契约。

## 触发矩阵

- `import`
  - 触发场景：导入顺序、分组空行、`type import` 摆放、导入成员排序。
  - 读取：`references/import-style.md`
- `export/barrel`
  - 触发场景：`index.ts`、barrel、集中导出顺序、导出分组、导出成员排序。
  - 读取：`references/export-style.md`
- `comment-doc`
  - 触发场景：注释规范、JSDoc、`@example`、顶层说明、字段说明、注释形态统一。
  - 读取：`references/comment-style.md`
- `layout-readability`
  - 触发场景：空行规范、声明后空行、控制块后空行、顶层摘要注释 + 顶层 `const` 成组空行、对象成员分组空行、冗余 `async` / `return await` / Promise 透传精简、纯可读性排版。
  - 读取：`references/layout-readability.md`

## 规则选择

根据用户诉求选择要读取的引用文档：

- `import` 诉求（如：导入顺序、分组空行、命名风格分组）：
  - 读取 `references/import-style.md`
- `export/barrel` 诉求（如：`index.ts`、barrel、导出顺序、分组、排序）：
  - 读取 `references/export-style.md`
- `comment-doc` 诉求（如：注释规范、JSDoc、`@example`、`interface/type/enum/const` 顶层说明、字段说明）：
  - 读取 `references/comment-style.md`
- `layout-readability` 诉求（如：空行规范、声明后空行、`if` 块后空行、对象字面量 / 状态对象 / 配置对象成员空行、对象分组排版）：
  - 读取 `references/layout-readability.md`
- 多类诉求同时存在：
  - 同时读取对应引用文档

## 宽泛风格请求默认映射

当用户请求是“统一代码风格”“顺手规范一下这个文件”这类宽泛风格诉求，且没有进一步限定规则层时，默认按文件职责选择：

- 普通源文件：
  - 默认命中 `import + comment-doc + layout-readability`
- barrel / `index.ts[x]` / 集中导出文件：
  - 默认命中 `import + export/barrel + comment-doc + layout-readability`
- 若用户明确只要某一层（如只调导入顺序、只调空行、只补注释）：
  - 收缩到用户明确指定的规则层，不额外扩层

完成规则应用后，统一读取 `references/checklist.md` 做收尾校验。

## 规则层命中与强制执行

- 一旦根据用户诉求命中某个规则层，该层内适用规则全部视为硬约束，不能降级成“可选润色”。
- `layout-readability` 与 `comment-doc` 是两个独立层；纯排版请求不得自动升级成补 JSDoc、`@example` 或顶层说明的文档任务。
- “最小改动”指的是保持语义不变、控制 diff 范围，不是允许跳过本次已命中的硬规则。
- 文件中已有的旧风格不能覆盖本次命中的规则层要求。
- `prettier`、lint、`tsc` 只能验证格式或类型，不能作为规则层完成的证明。
- 输出结果时必须说明本次命中的规则层，以及按哪些规则完成了自检。

## 默认策略

- 未明确要求语义重写时，`comment-doc` 任务默认执行“保守格式化 / 结构统一”，不主动重写已有说明文案。
- “保守格式化”指优先统一注释形态、空行、分组和单行/多行块写法，尽量保留现有注释覆盖率；除规则要求的最小补充外，不主动扩大文案改写范围。
- 对已纳入 `comment-doc` 覆盖范围的函数（如对外 API、复用型 Hook、复用型工具函数，以及用户明确指定需要统一注释的其他函数），仍需补最小必需的 JSDoc 字段：概述、`@param`、`@example`，以及确有必要时的 `@return`。
- 在 TypeScript 文件中，`comment-doc` 对 `@return` 默认执行“标签统一、语义优先、类型去重”：
  - 返回标签统一使用 `@return`，不要使用 `@returns`
  - 仅当返回值的业务语义、边界条件、单位、空值 / 异常约束等信息需要额外说明时，才补 `@return`
  - `@return` 只写补充说明，不重复函数签名里已经表达的类型声明
  - 若返回语义显然，或只会机械重复 TypeScript 类型信息，则省略 `@return`
- 只有在用户明确要求补全文案、提高语义信息密度、统一整块注释颗粒度或重写描述时，才进入更强的注释改写模式。
- `layout-readability` 包含 Promise 透传样板精简：直接返回 Promise 的透传函数不使用 `async`，`async` 函数中不保留无意义的 `return await`。

## 执行说明

- 搜索文件优先使用 `rg`；若 `rg` 不可用，回退（fallback）到 `find`。
- 格式化优先使用 `prettier --write <explicit_file_list>`，并始终限制在目标文件范围内。
- 不要直接调用可能隐式执行全仓格式化的项目包装脚本（例如内部包含 `prettier --write .` 的脚本）。
- 在执行格式化或项目脚本前，先记录一次 `git status --short` 作为 baseline。
- 若项目脚本不可避免，先评估其范围；执行后对比 baseline，仅处理本次命令新增且可安全分离的 spillover，禁止触碰执行前已存在的改动；若无法安全分离，停止并汇报。
- 字典对象排序场景：仅在用户明确要求排序时执行；按“键名字符长度”排序并遵循用户指定方向（升序/降序），同长度按字母序（A-Z）；若用户未明确要求排序，保持原顺序。

## 执行模板

当任务属于代码风格统一时，后续 agent 可直接按以下顺序执行：

1. 识别诉求并选规则

- 判断是否涉及 `import`、`export/barrel`、`comment-doc`、`layout-readability`。
- 若请求是“统一代码风格”等宽泛风格诉求：
  - 普通源文件默认命中 `import + comment-doc + layout-readability`
  - barrel / `index.ts[x]` / 集中导出文件默认再追加 `export/barrel`
- 将诉求映射到规则层：`import` -> `references/import-style.md`，`export/barrel` -> `references/export-style.md`，`comment-doc` -> `references/comment-style.md`，`layout-readability` -> `references/layout-readability.md`。
- 按需读取对应 `references/*.md`，不要提前加载无关层。
- 若请求仅涉及空行与可读性排版，只命中 `layout-readability`，不要顺带补 JSDoc、`@example` 或顶层说明。

2. 限定范围并扫描

- 只扫描用户指定路径，优先用 `rg`。
- 标记“仅风格问题”位置，不触碰业务逻辑。
- 若命中 `comment-doc`，先枚举已纳入覆盖范围且缺失或需要统一的说明项：对外 API/复用 Hook/复用工具函数的 JSDoc、`interface/type/enum/const` 顶层说明、字段注释分组，以及仅在返回语义需要额外说明时才补充的 `@return`。
- 若命中 `layout-readability`，先枚举声明段空行、控制块空行、顶层摘要注释 + 顶层 `const` 的声明组空行、对象字面量 / 状态对象 / 配置对象的成员分组、字典对象排版，以及冗余 `async` / `return await` / Promise 透传样板位置。

3. 最小改动实施

- 仅做本次命中规则层要求的风格改动。
- 若用户未明确要求重写文案，`comment-doc` 默认按“保守格式化”执行：统一注释形态与结构，不主动重写已有说明文案；但对已纳入覆盖范围的函数，仍需补齐规则要求的最小必需字段。
- 在 TypeScript 文件中，不机械为有返回值的函数补 `@return`；只有确实需要补充返回语义时才写，且统一使用 `@return`、不重复签名中的类型信息。
- `layout-readability` 只处理空行、顶层摘要注释 + 顶层 `const` 的声明组间距、对象成员分组、Promise 透传样板精简和纯排版问题，不主动补 JSDoc、`@example` 或字段说明。
- 已命中的硬规则必须全部落地，不能因为“最小改动”跳过该层要求。
- 不做未请求的重构、重命名、语义调整。

4. 定向格式化

- 仅对目标文件执行：`prettier --write <explicit_file_list>`。
- 禁止使用可能触发全仓格式化的包装脚本。

5. 差异与回滚保护

- 执行 `git --no-pager diff -- <target_files>` 确认 diff 受控。
- 对比执行前后的 `git status --short`，识别本次命令新增的 spillover。
- 仅在可以明确确认是本次命令引入、且不覆盖既有修改时，才处理非目标路径污染；否则停止并汇报。

6. 收尾检查

- 读取 `references/checklist.md` 逐项核对。
- 确认依赖可用、`.gitignore` 存在，再输出结果。
- 输出结果时，说明本次命中的规则层、关键自检项和检查结论。

## 常见误区

- 不要把 `prettier --write`、lint 或 `tsc` 通过当作规则完成证明。
- 不要因为文件已有旧风格，就跳过本次命中的规则层。
- 不要只处理 `import/export`，却遗漏其他已经命中的规则层。
- 不要把纯空行或可读性排版请求自动升级成 `comment-doc`。
- 不要用“最小改动”作为不补硬性注释或不做分组排版的理由。

## 安全约束

- 不改变业务逻辑。
- 默认只改用户指定目录或文件。
- 默认只格式化目标文件，避免全仓格式化。
