'use client';

import { useCallback, useRef, useState } from 'react';

export interface DragPosition {
  left: number;
  top: number;
}

interface UseDraggableResult {
  // 当前位置(未拖动过为 null,沿用 CSS 默认定位)
  position: DragPosition | null;
  dragging: boolean;
  // 绑到目标元素的 onPointerDown
  onPointerDown: (e: React.PointerEvent) => void;
  // 本次按下是否发生了拖动(用于区分「点击」与「拖拽」)
  movedRef: React.RefObject<boolean>;
}

const DRAG_THRESHOLD = 4;
const EDGE = 8;

/**
 * 让元素可用指针拖动;移动超过阈值才算拖拽,便于区分点击。
 * 拖动中实时夹在视口内;返回 left/top 由调用方应用为 fixed 定位。
 * @param onMove 每次位置更新回调(如让浮层跟随)。
 */
export function useDraggable(onMove?: () => void): UseDraggableResult {
  const [position, setPosition] = useState<DragPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);
  const startRef = useRef({ px: 0, py: 0, ox: 0, oy: 0, w: 0, h: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      el.setPointerCapture(e.pointerId);
      movedRef.current = false;
      startRef.current = { px: e.clientX, py: e.clientY, ox: rect.left, oy: rect.top, w: rect.width, h: rect.height };
      setDragging(true);

      const handleMove = (ev: PointerEvent) => {
        const { px, py, ox, oy, w, h } = startRef.current;
        const dx = ev.clientX - px;
        const dy = ev.clientY - py;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) movedRef.current = true;
        const left = Math.max(EDGE, Math.min(window.innerWidth - w - EDGE, ox + dx));
        const top = Math.max(EDGE, Math.min(window.innerHeight - h - EDGE, oy + dy));
        setPosition({ left, top });
        onMove?.();
      };
      const handleUp = (ev: PointerEvent) => {
        setDragging(false);
        el.releasePointerCapture?.(ev.pointerId);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [onMove],
  );

  return { position, dragging, onPointerDown, movedRef };
}
