import { Plus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

interface TodoInputProps {
  value: string;
  onChange: (value: string) => void;
  onAdd: (content: string) => void;
}

export function TodoInput({ value, onChange, onAdd }: TodoInputProps) {
  const [focused, setFocused] = useState(false);
  const isComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const syncHeight = () => {
      if (!el.value) {
        el.style.height = "auto";
        return;
      }
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
    };
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (isComposingRef.current || e.nativeEvent.isComposing) {
        return;
      }
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="px-3 pb-2 shrink-0">
      <div
        className="todo-input-frame flex items-end gap-2 px-3 py-2 rounded-xl border transition-colors"
        style={{
          backgroundColor: focused ? "var(--surface-input-focus)" : "var(--surface-input)",
          borderColor: focused ? "var(--border-action-primary)" : "var(--border-subtle)",
          transitionDuration: "var(--duration-color)",
          transitionTimingFunction: "var(--ease-decel)",
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onKeyDown={handleKeyDown}
          placeholder="添加待办，Enter 保存，Shift+Enter 换行"
          className="body-6 w-full resize-none bg-transparent outline-none select-text placeholder:text-[var(--text-tertiary)]"
          style={{
            color: "var(--text-primary)",
            maxHeight: "96px",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          title="添加"
          aria-label="添加待办"
          className="interactive-btn w-6 h-6 rounded-md flex items-center justify-center shrink-0 disabled:opacity-35"
          style={{
            backgroundColor: value.trim() ? "var(--action-primary)" : "var(--action-secondary)",
            color: value.trim() ? "var(--text-inverted)" : "var(--icon-secondary)",
          }}
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
