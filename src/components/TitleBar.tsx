import { GearSix, Lock, LockOpen, Minus } from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TitleBarProps {
  activeCount: number;
  isLocked: boolean;
  hasPassword: boolean;
  showSettings: boolean;
  onToggleLock: () => void;
  onToggleSettings: () => void;
  onHide: () => void;
}

export function TitleBar({
  activeCount,
  isLocked,
  hasPassword,
  showSettings,
  onToggleLock,
  onToggleSettings,
  onHide,
}: TitleBarProps) {
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }
    if (e.button === 0) {
      void getCurrentWindow().startDragging();
    }
  };

  return (
    <header
      onPointerDown={handlePointerDown}
      className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 cursor-default"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: "var(--action-primary)" }}
        />
        <span className="title-4 truncate" style={{ color: "var(--text-primary)" }}>
          便利贴
        </span>
        <span
          className="caption-4 px-1.5 py-0.5 rounded-md tabular-nums"
          style={{
            backgroundColor: "var(--action-secondary)",
            color: "var(--text-secondary)",
          }}
        >
          {activeCount}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleLock}
          title={isLocked ? "已锁定" : hasPassword ? "立即锁定" : "设置密码锁"}
          aria-label={isLocked ? "已锁定" : hasPassword ? "立即锁定" : "设置密码锁"}
          className="interactive-btn w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: isLocked ? "var(--action-primary)" : "transparent",
            color: isLocked ? "var(--text-inverted)" : "var(--icon-secondary)",
          }}
        >
          {isLocked ? (
            <Lock size={15} weight="fill" />
          ) : (
            <LockOpen size={15} weight="regular" />
          )}
        </button>

        {!isLocked && (
          <button
            type="button"
            onClick={onToggleSettings}
            title="设置"
            aria-label="设置"
            className="interactive-btn w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: showSettings ? "var(--action-secondary-hover)" : "transparent",
              color: showSettings ? "var(--icon-default)" : "var(--icon-secondary)",
            }}
          >
            <GearSix size={15} weight={showSettings ? "fill" : "regular"} />
          </button>
        )}

        <button
          type="button"
          onClick={onHide}
          title="隐藏到托盘"
          aria-label="隐藏到托盘"
          className="interactive-btn w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--action-secondary)]"
          style={{ color: "var(--icon-secondary)" }}
        >
          <Minus size={15} weight="bold" />
        </button>
      </div>
    </header>
  );
}
