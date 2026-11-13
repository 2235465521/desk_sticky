import { X } from "@phosphor-icons/react";
import { AppSettings, MonitorDescriptor, ThemePreference } from "../types/todo";

interface SettingsPanelProps {
  settings: AppSettings;
  monitors: MonitorDescriptor[];
  onUpdate: (patch: Partial<AppSettings>) => void;
  onRequestChangePassword: () => void;
  onClearPassword: () => void;
  onClose: () => void;
}

export function SettingsPanel({
  settings,
  monitors,
  onUpdate,
  onRequestChangePassword,
  onClearPassword,
  onClose,
}: SettingsPanelProps) {
  return (
    <div
      className="settings-panel mx-3 mb-3 p-3 rounded-lg border flex flex-col gap-3 shrink-0"
      style={{
        backgroundColor: "var(--surface-popover)",
        borderColor: "var(--border-primary)",
        boxShadow: "var(--shadow-popover)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="title-4" style={{ color: "var(--text-primary)" }}>
          外观与窗口设置
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭设置"
          className="interactive-btn w-6 h-6 rounded-md flex items-center justify-center hover:bg-[var(--action-secondary)]"
          style={{ color: "var(--icon-secondary)" }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Opacity Slider */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="opacity-slider" className="caption-4" style={{ color: "var(--text-secondary)" }}>
            背景不透明度
          </label>
          <span className="caption-4 tabular-nums" style={{ color: "var(--text-primary)" }}>
            {settings.opacity}%
          </span>
        </div>
        <input
          id="opacity-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={settings.opacity}
          aria-valuetext={`${settings.opacity}%`}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
          className="w-full accent-[var(--action-primary)] cursor-pointer"
        />
      </div>

      {/* Theme */}
      <div className="flex items-center justify-between">
        <span className="caption-4" id="theme-label" style={{ color: "var(--text-secondary)" }}>
          外观主题
        </span>
        <div className="flex gap-1" role="group" aria-labelledby="theme-label">
          {(
            [
              { value: "system", label: "跟随系统" },
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ] as { value: ThemePreference; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
                type="button"
                aria-pressed={settings.theme === opt.value}
                onClick={() => onUpdate({ theme: opt.value })}
              className="interactive-btn button-xsm px-2 py-1 rounded-md border"
              style={{
                backgroundColor:
                  settings.theme === opt.value
                    ? "var(--action-secondary-hover)"
                    : "transparent",
                borderColor:
                  settings.theme === opt.value
                    ? "var(--border-primary)"
                    : "var(--border-subtle)",
                color:
                  settings.theme === opt.value
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target Monitor */}
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="monitor-select" className="caption-4 shrink-0" style={{ color: "var(--text-secondary)" }}>
          显示屏幕
        </label>
        <select
          id="monitor-select"
          value={settings.targetMonitorId ?? ""}
          onChange={(e) =>
            onUpdate({ targetMonitorId: e.target.value ? e.target.value : null })
          }
          className="caption-4 px-2 py-1 rounded-md border focus-ring max-w-[190px] truncate"
          style={{
            backgroundColor: "var(--surface-input)",
            borderColor: "var(--border-primary)",
            color: "var(--text-primary)",
          }}
        >
          <option value="">默认主显示器</option>
          {monitors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Toggles */}
      <label className="flex items-center justify-between">
        <span className="caption-4" style={{ color: "var(--text-secondary)" }}>
          贴近右侧自动隐藏
        </span>
        <input
          type="checkbox"
          checked={settings.edgeAutoHide}
          onChange={(e) => onUpdate({ edgeAutoHide: e.target.checked })}
          className="w-4 h-4 accent-[var(--action-primary)] cursor-pointer"
        />
      </label>

      <label className="flex items-center justify-between">
        <span className="caption-4" style={{ color: "var(--text-secondary)" }}>
          始终置顶
        </span>
        <input
          type="checkbox"
          checked={settings.alwaysOnTop}
          onChange={(e) => onUpdate({ alwaysOnTop: e.target.checked })}
          className="w-4 h-4 accent-[var(--action-primary)] cursor-pointer"
        />
      </label>

      <label className="flex items-center justify-between">
        <span className="caption-4" style={{ color: "var(--text-secondary)" }}>
          开机自动启动
        </span>
        <input
          type="checkbox"
          checked={settings.launchAtStartup}
          onChange={(e) => onUpdate({ launchAtStartup: e.target.checked })}
          className="w-4 h-4 accent-[var(--action-primary)] cursor-pointer"
        />
      </label>

      {/* Password Lock Management */}
      <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <span className="caption-4" style={{ color: "var(--text-secondary)" }}>
          密码锁
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRequestChangePassword}
            className="interactive-btn button-xsm px-2 py-1 rounded-md border"
            style={{
              backgroundColor: "var(--action-secondary)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            {settings.lockPasswordHash ? "修改密码" : "设置密码"}
          </button>
          {settings.lockPasswordHash && (
            <button
              type="button"
              onClick={onClearPassword}
              className="interactive-btn button-xsm px-2 py-1 rounded-md border"
              style={{
                backgroundColor: "var(--action-danger-hover)",
                borderColor: "var(--border-error)",
                color: "var(--text-error)",
              }}
            >
              清除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
