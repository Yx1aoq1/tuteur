'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { FileTree } from './FileTree';
import { KnowledgeGraph } from './KnowledgeGraph';
import { DocOutline } from '@/components/markdown/DocOutline';
import type { KnowledgeTreeNode, KnowledgeFileView } from '@/types/knowledge';

// Crepe 触碰 document,必须 client-only 动态导入(ssr:false)。
const MarkdownEditor = dynamic(() => import('./MarkdownEditor').then(m => m.MarkdownEditor), { ssr: false });

type Mode = 'doc' | 'graph';

interface KnowledgeWorkspaceProps {
  tree: KnowledgeTreeNode[];
  project: string;
}

// 知识库工作台壳:文件树(左)+ 文档/关系图主区切换。模式与选中为组件内部 state(不写 URL),
// 每次进入默认文档模式。关系图点击节点 → 切回文档并打开对应页。
export function KnowledgeWorkspace({ tree, project }: KnowledgeWorkspaceProps) {
  const t = useTranslations('knowledge');
  const [mode, setMode] = useState<Mode>('doc');
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<KnowledgeFileView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSelect = useCallback((node: KnowledgeTreeNode) => {
    if (node.type !== 'file') return;
    setSelected(node.relPath);
  }, []);

  const onDeleted = useCallback(
    (relPath: string) => {
      // 删除当前文件或其所在目录 → 清空中栏
      if (selected && (selected === relPath || selected.startsWith(`${relPath}/`))) {
        setSelected(null);
        setFile(null);
      }
    },
    [selected],
  );

  // 关系图点击节点:切回文档模式并打开该页。
  const openFromGraph = useCallback((relPath: string) => {
    setSelected(relPath);
    setMode('doc');
  }, []);

  // 切换文件:按需取正文(只刷新中栏/右栏)。所有 setState 落在异步回调里,避免 effect 体同步置态。
  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    fetch(`/api/knowledge/file?project=${encodeURIComponent(project)}&relPath=${encodeURIComponent(selected)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok && data.file) {
          setFile(data.file);
          setError(null);
        } else {
          setError(data?.error ?? t('loadFailed'));
        }
      })
      .catch(() => !cancelled && setError(t('loadFailed')));

    return () => {
      cancelled = true;
    };
  }, [selected, project, t]);

  // 仅当已加载文件与当前选中一致才显示编辑器(切换瞬间避免显示上一篇,且 selected=null 即回空态)。
  const activeFile = selected && file?.relPath === selected ? file : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-line-strong bg-canvas-tint px-3 py-1.5">
        <ModeButton active={mode === 'doc'} onClick={() => setMode('doc')}>
          {t('modeDoc')}
        </ModeButton>
        <ModeButton active={mode === 'graph'} onClick={() => setMode('graph')}>
          {t('modeGraph')}
        </ModeButton>
      </div>

      <div className="flex min-h-0 w-full flex-1">
        <FileTree tree={tree} selected={selected} project={project} onSelect={onSelect} onDeleted={onDeleted} />

        {mode === 'graph' ? (
          <KnowledgeGraph project={project} onOpen={openFromGraph} />
        ) : (
          <>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-paper">
              {activeFile ? (
                <MarkdownEditor key={activeFile.relPath} file={activeFile} project={project} />
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-[13px] text-ink-faint">
                  {selected && error ? error : t('selectHint')}
                </div>
              )}
            </section>

            <DocOutline docKey={activeFile?.relPath ?? null} />
          </>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-semibold ${
        active ? 'bg-paper text-ink shadow-card' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
