import { NotePencil } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TodoItem } from "../types/todo";
import { computeWrappedScrollTop, shouldEnableLoop } from "../utils/loopScroll";
import { TodoItemRow } from "./TodoItemRow";

interface InfiniteTodoListProps {
  items: TodoItem[];
  onToggleComplete: (id: string) => void;
  onEdit: (id: string, nextContent: string) => void;
  onDelete: (id: string) => void;
  onMeasureContentHeight: (height: number) => void;
}

interface EditingTarget {
  id: string;
  segmentKey: string;
}

export function InfiniteTodoList({
  items,
  onToggleComplete,
  onEdit,
  onDelete,
  onMeasureContentHeight,
}: InfiniteTodoListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const primarySegmentRef = useRef<HTMLDivElement>(null);

  const [segmentHeight, setSegmentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  const prevLoopEnabledRef = useRef(false);

  const loopEnabled = shouldEnableLoop(items.length, segmentHeight, viewportHeight);

  // Measure primary segment and viewport with ResizeObserver
  useEffect(() => {
    const primaryEl = primarySegmentRef.current;
    const containerEl = containerRef.current;
    if (!primaryEl || !containerEl) return;

    const updateSizes = () => {
      const nextSegH = primaryEl.offsetHeight;
      const nextViewH = containerEl.clientHeight;
      setSegmentHeight(nextSegH);
      setViewportHeight(nextViewH);
      onMeasureContentHeight(nextSegH);
    };

    updateSizes();
    const ro = new ResizeObserver(updateSizes);
    ro.observe(primaryEl);
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [items.length, onMeasureContentHeight]);

  // Initialize scrollTop to start of middle segment B when loop activates
  useLayoutEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    if (loopEnabled && !prevLoopEnabledRef.current && segmentHeight > 0) {
      containerEl.scrollTop = segmentHeight;
    } else if (!loopEnabled && prevLoopEnabledRef.current) {
      containerEl.scrollTop = 0;
    }
    prevLoopEnabledRef.current = loopEnabled;
  }, [loopEnabled, segmentHeight]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !loopEnabled || editingTarget !== null) {
      return;
    }
    const wrapped = computeWrappedScrollTop(el.scrollTop, segmentHeight, el.clientHeight);
    if (wrapped !== null) {
      el.scrollTop = wrapped;
    }
  }, [loopEnabled, segmentHeight, editingTarget]);

  const handleStartEdit = useCallback((id: string, segmentKey: string) => {
    setEditingTarget({ id, segmentKey });
  }, []);

  const handleCommitEdit = useCallback(
    (id: string, nextContent: string) => {
      onEdit(id, nextContent);
      setEditingTarget(null);
    },
    [onEdit]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingTarget(null);
  }, []);

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex flex-col items-center justify-center px-6 py-8 text-center"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 border"
          style={{
            backgroundColor: "var(--surface-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--icon-subtle)",
          }}
        >
          <NotePencil size={20} />
        </div>
        <p className="body-5 mb-1" style={{ color: "var(--text-secondary)" }}>
          记下接下来要做的事
        </p>
        <p className="caption-5" style={{ color: "var(--text-tertiary)" }}>
          输入后按 Enter 保存，随时查看
        </p>
      </div>
    );
  }

  const renderSegment = (segmentKey: string, isPrimary: boolean) => (
    <div
      key={segmentKey}
      ref={isPrimary ? primarySegmentRef : undefined}
      aria-hidden={!isPrimary ? true : undefined}
      className="flex flex-col gap-2 pb-2"
    >
      {items.map((item) => (
        <TodoItemRow
          key={`${segmentKey}-${item.id}`}
          item={item}
          segmentKey={segmentKey}
          isEditing={
            editingTarget?.id === item.id && editingTarget?.segmentKey === segmentKey
          }
          onStartEdit={handleStartEdit}
          onCommitEdit={handleCommitEdit}
          onCancelEdit={handleCancelEdit}
          onToggleComplete={onToggleComplete}
          onDelete={onDelete}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="sticky-scroll flex-1 min-h-0 overflow-y-auto px-3 pt-1.5 pb-1"
    >
      {loopEnabled ? (
        <>
          {renderSegment("seg-a", false)}
          {renderSegment("seg-b", true)}
          {renderSegment("seg-c", false)}
        </>
      ) : (
        renderSegment("seg-b", true)
      )}
    </div>
  );
}
