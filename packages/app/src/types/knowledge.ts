// 知识库视图模型类型。纯类型、无 @withy/core 依赖,供服务端读取层与客户端组件共享
// (客户端组件不可 import @withy/core —— 会把 node:fs 带进浏览器包)。

// 文件树一个节点(目录可含 children;叶子为 .md 文件)。
export interface KnowledgeTreeNode {
  // 展示标签:目录名 / 去 .md 的文件名
  name: string;

  // 相对 wiki/ 的 posix 路径
  relPath: string;

  type: 'file' | 'dir';

  // 生成的 index.md → 只读(可看不可编辑)
  readonly: boolean;

  // 仅目录有;空目录为 []
  children?: KnowledgeTreeNode[];
}

// 中栏编辑所需的单文件内容(只下发正文,frontmatter 仅 core 持有)。
export interface KnowledgeFileView {
  relPath: string;
  readonly: boolean;
  body: string;
}

// 关系图节点(xyflow 友好;位置由客户端布局计算)。
export interface KnowledgeGraphNodeView {
  id: string;
  label: string;

  // 条目类别;source=被引用的原始源,missing=断链指向的缺页
  kind?: string;
  scope: 'global' | 'project';

  // 入链数(仅 [[link]] 边);力导向视图按此定节点大小。missing/synthesized 节点缺省无
  inDegree?: number;

  // 对应页的 wiki 相对路径(真实页才有;source/missing 节点为空,不可打开)
  relPath?: string;
}

// 关系图边;broken=指向不存在的页(标红)。
export interface KnowledgeGraphEdgeView {
  id: string;
  source: string;
  target: string;
  broken: boolean;
  kind: 'link' | 'source';
}

export interface KnowledgeGraphView {
  nodes: KnowledgeGraphNodeView[];
  edges: KnowledgeGraphEdgeView[];
}
