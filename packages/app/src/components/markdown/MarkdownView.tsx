'use client';

import { Crepe } from '@milkdown/crepe';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './milkdown-tokens.css';

interface MarkdownViewProps {
  // markdown 正文(只读渲染;父层按文档键 remount,故内容由 defaultValue 一次固化)
  body: string;
}

// 共享只读 markdown 渲染面:Crepe defaultValue + setReadonly(true),无保存/编辑逻辑。
// 滚动容器挂 data-doc-scroll + .doc-scroll(细滚动条),保持原生滚动 —— 不套 OverlayScrollbars,
// 以免换掉真实滚动元素破坏 DocOutline 的 IntersectionObserver root 与 scrollIntoView。
function ReadonlyCrepe({ body }: MarkdownViewProps) {
  useEditor(root => {
    const crepe = new Crepe({ root, defaultValue: body });
    crepe.setReadonly(true);
    return crepe;
  }, []);

  return (
    <div className="doc-scroll min-h-0 flex-1 overflow-auto" data-doc-scroll>
      <Milkdown />
    </div>
  );
}

// 入口:MilkdownProvider 包裹(每个文档一个实例,父层按文档键 key remount)。
// Crepe 触碰 document,消费方须经 dynamic(ssr:false) 动态导入本组件。
export function MarkdownView(props: MarkdownViewProps) {
  return (
    <MilkdownProvider>
      <ReadonlyCrepe {...props} />
    </MilkdownProvider>
  );
}
