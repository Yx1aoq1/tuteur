import { defineConfig, configDefaults } from 'vitest/config';

// 仅排除 Next 构建产物(standalone 会复制 src,含 *.test.ts);其余沿用 vitest 默认。
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
});
