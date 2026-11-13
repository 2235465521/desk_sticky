import { Check, PencilSimple, Trash } from "@phosphor-icons/react";
import { memo, useEffect, useRef, useState } from "react";
import { TodoItem } from "../types/todo";
import { ConfettiBurst } from "./ConfettiBurst";

interface TodoItemRowProps {
  item: TodoItem;
  segmentKey: string;
  isEditing: boolean;
  onStartEdit: (id: string, segmentKey: string) => void;
  onCommitEdit: (id: string, nextContent: string) => void;
  onCancelEdit: () => void;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  tabbable?: boolean;
}

export const TodoItemRow = memo(function TodoItemRow({
  item,
  segmentKey,
  isEditing,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onToggleComplete,
  onDelete,
  tabbable = true,
}: TodoItemRowProps) {
  const [draft, setDraft] = useState(item.content);
  const [celebrating, setCelebrating] = useState(false);
  const isComposingRef = useRef(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const celebrateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (celebrateTimerRef.current) {
        window.clearTimeout(celebrateTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isEditing) {
      setDraft(item.content);
      requestAnimationFrame(() => {
        const el = editRef.current;
        if (el) {
          el.focus();
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    }
  }, [isEditing, item.content]);

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onCancelEdit();
      return;
    }
    if (trimmed !== item.content) {
      onCommitEdit(item.id, trimmed);
    } else {
      onCancelEdit();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      if (isComposingRef.current || e.nativeEvent.isComposing) {
        return;
      }
      e.preventDefault();
      commit();
    }
  };

  const handleCheckClick = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!item.completed && !reduceMotion) {
      setCelebrating(true);
      if (celebrateTimerRef.current) {
        window.clearTimeout(celebrateTimerRef.current);
      }
      celebrateTimerRef.current = window.setTimeout(() => {
        setCelebrating(false);
      }, 1050);
    }
    onToggleComplete(item.id);
  };

  const innerBg = isEditing
    ? "var(--surface-input-focus)"
    : item.completed
      ? "var(--surface-card-completed)"
      : "var(--surface-card)";

  return (
    <div
      data-todo-id={item.id}
      className={`todo-card-border-wrap group relative ${
        isEditing ? "todo-card-editing" : ""
      }`}
    >
      <div
        className="todo-card-inner flex items-start gap-2 px-3 py-2"
        style={{ backgroundColor: innerBg }}
      >
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <textarea
              ref={editRef}
              rows={1}
              value={draft}
              onChange={handleDraftChange}
              onBlur={commit}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onKeyDown={handleEditKeyDown}
              tabIndex={tabbable ? undefined : -1}
              className="body-5 w-full resize-none bg-transparent outline-none select-text whitespace-pre-wrap break-words"
              style={{ color: "var(--text-primary)" }}
            />
          ) : (
            <div
              onDoubleClick={() => onStartEdit(item.id, segmentKey)}
              className="whitespace-pre-wrap break-words cursor-text select-text body-5"
              style={{
                color: item.completed ? "var(--text-completed)" : "var(--text-primary)",
                textDecoration: item.completed ? "line-through" : "none",
                opacity: item.completed ? 0.78 : 1,
              }}
            >
              {item.content}
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
              <button
                type="button"
                onClick={() => onStartEdit(item.id, segmentKey)}
                title="编辑"
                aria-label="编辑事项"
                tabIndex={tabbable ? undefined : -1}
                className="interactive-btn w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--action-secondary)]"
                style={{ color: "var(--icon-secondary)" }}
              >
                <PencilSimple size={12} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                title="删除"
                aria-label="删除事项"
                tabIndex={tabbable ? undefined : -1}
                className="interactive-btn w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--action-danger-hover)]"
                style={{ color: "var(--icon-error)" }}
              >
                <Trash size={12} />
              </button>
            </div>

            <div className="relative flex items-center justify-center">
              <ConfettiBurst active={celebrating} />
              <button
                type="button"
                onClick={handleCheckClick}
                title={item.completed ? "取消完成" : "标记完成"}
                aria-label={item.completed ? "取消完成" : "标记完成"}
                tabIndex={tabbable ? undefined : -1}
                className="interactive-btn w-4 h-4 rounded-full flex items-center justify-center shrink-0 border"
                style={{
                  borderColor: item.completed ? "var(--action-primary)" : "var(--border-primary)",
                  backgroundColor: item.completed ? "var(--action-primary)" : "transparent",
                  color: "var(--text-inverted)",
                }}
              >
                {item.completed && <Check size={11} weight="bold" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
