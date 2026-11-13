import { ArrowUUpLeft, X } from "@phosphor-icons/react";

interface UndoToastProps {
  visible: boolean;
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ visible, label, onUndo, onDismiss }: UndoToastProps) {
  if (!visible) return null;

  return (
    <div className="px-3 pb-2 shrink-0">
      <div
        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border"
        style={{
          backgroundColor: "var(--surface-popover)",
          borderColor: "var(--border-primary)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <span className="caption-4 truncate" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onUndo}
            className="interactive-btn button-xsm flex items-center gap-1 px-2 py-1 rounded-md"
            style={{
              backgroundColor: "var(--action-primary)",
              color: "var(--text-inverted)",
            }}
          >
            <ArrowUUpLeft size={12} weight="bold" />
            撤销
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="关闭提示"
            className="interactive-btn w-6 h-6 rounded-md flex items-center justify-center hover:bg-[var(--action-secondary)]"
            style={{ color: "var(--icon-secondary)" }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
