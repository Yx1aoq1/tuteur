# 更新文档

## 2026-04-15

- :sparkles: 将 `code-style` 明确为面向 TypeScript / JavaScript 项目的 `default TS/JS preset`，补齐通用安装方式、宿主接入方式与 skill 本体和项目 overlay 的职责边界。 (_郑少鹏_)
- :sparkles: 新增宽泛风格请求的默认规则层映射，扩展 `import` / `export/barrel` 的 TS/JS 文件适用范围，并明确普通源文件与 barrel 文件的分层命中策略。 (_郑少鹏_)
- :memo: 细化 `comment-doc` 与 `layout-readability` 规则及检查清单，统一 TypeScript 下 `@return` 使用约束，收紧局部函数补注释范围，并补充顶层 `const` 声明组空行与 Promise 透传样板精简规范。 (_郑少鹏_)

## 2026-04-14

- :sparkles: 拆分 `comment-doc` 与 `layout-readability` 规则层，明确纯可读性排版与注释文档任务的边界。 (_郑少鹏_)
- :sparkles: 强化规则层命中、自检输出与 spillover 检查约束，收紧“最小改动”执行边界。 (_郑少鹏_)
- :memo: 补齐安装说明、触发矩阵与 `layout-readability` 参考文档，完善按需加载与收尾校验指引。 (_郑少鹏_)

## 2026-04-01

- :tada: 初始化项目 (_郑少鹏_)
