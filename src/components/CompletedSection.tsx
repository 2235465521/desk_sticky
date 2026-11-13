import { ArrowCounterClockwise, CaretDown, CaretRight, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { TodoItem } from "../types/todo";

interface CompletedSectionProps {
  items: TodoItem[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CompletedSection({ items, onRestore, onDelete }: CompletedSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="px-3 pb-3 pt-1 shrink-0">
      <div
        className="h-px w-full mb-2"
        style={{ backgroundColor: "var(--border-subtle)" }}
      />
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="interactive-btn w-full flex items-center justify-between px-2 py-1 rounded-md hover:bg-[var(--action-secondary)]"
        style={{ color: "var(--text-secondary)" }}
      >
        <span className="flex items-center gap-1.5 caption-4">
          {expanded ? <CaretDown size={13} /> : <CaretRight size={13} />}
          已完成
        </span>
        <span className="caption-5 tabular-nums">{items.length}</span>
      </button>

      {expanded && (
        <div className="sticky-scroll mt-1.5 max-h-36 overflow-y-auto flex flex-col gap-1.5 pr-0.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-start gap-2 px-2.5 py-1.5 rounded-lg border"
              style={{
                backgroundColor: "var(--surface-card)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <span
                className="body-6 flex-1 min-w-0 line-through opacity-60 whitespace-pre-wrap break-words"
                style={{ color: "var(--text-secondary)" }}
              >
                {item.content}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onRestore(item.id)}
                  title="恢复为待办"
                  aria-label="恢复为待办"
                  className="interactive-btn w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--action-secondary)]"
                  style={{ color: "var(--icon-secondary)" }}
                >
                  <ArrowCounterClockwise size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  title="删除"
                  aria-label="删除已完成事项"
                  className="interactive-btn w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--action-danger-hover)]"
                  style={{ color: "var(--icon-error)" }}
                >
                  <Trash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
