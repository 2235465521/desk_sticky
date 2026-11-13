import { Trash, WarningCircle } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfiniteTodoList } from "./components/InfiniteTodoList";
import { LockOverlay } from "./components/LockOverlay";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import { TodoInput } from "./components/TodoInput";
import { UndoToast } from "./components/UndoToast";
import { useResolvedTheme } from "./hooks/useTheme";
import { hashPassword } from "./utils/password";
import { computeTiltAngles } from "./utils/tilt3d";
import {
  AppSettings,
  AppStateData,
  DEFAULT_SETTINGS,
  MonitorDescriptor,
  TodoItem,
} from "./types/todo";

interface DeletedRecord {
  item: TodoItem;
  index: number;
}

const FIXED_LOGICAL_HEIGHT = 450;

export function App() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [monitors, setMonitors] = useState<MonitorDescriptor[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [settingUpPassword, setSettingUpPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletedRecord, setDeletedRecord] = useState<DeletedRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isEdgeHidden, setIsEdgeHidden] = useState(false);

  const undoTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const outsideSinceRef = useRef<number | null>(null);
  const lastTypingTimeRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());
  const tiltCardRef = useRef<HTMLDivElement>(null);
  const tiltRafRef = useRef<number | null>(null);
  const resolvedTheme = useResolvedTheme(settings.theme);

  const activeCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos]
  );
  const completedCount = useMemo(
    () => todos.filter((t) => t.completed).length,
    [todos]
  );

  // Initial load from Rust backend
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [state, mons] = await Promise.all([
          invoke<AppStateData>("load_app_state"),
          invoke<MonitorDescriptor[]>("get_monitors"),
        ]);
        if (!mounted) return;
        setTodos(state.todos);
        setSettings(state.settings);
        if (state.settings.lockPasswordHash) {
          setIsLocked(true);
        }
        setMonitors(mons);
        setLoaded(true);
      } catch (err) {
        if (!mounted) return;
        setErrorMsg(`加载本地数据失败：${String(err)}`);
        setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Listen to tray "open-settings" event
  useEffect(() => {
    const unlistenPromise = listen("open-settings", async () => {
      try {
        const mons = await invoke<MonitorDescriptor[]>("get_monitors");
        setMonitors(mons);
      } catch {
        // ignore monitor refresh error
      }
      setShowSettings(true);
    });
    return () => {
      void unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Sync DWM backdrop whenever opacity, blurMode, or theme changes
  useEffect(() => {
    if (!loaded) return;
    void invoke("set_backdrop", {
      opacity: settings.opacity,
      blurMode: settings.blurMode,
      isDark: resolvedTheme === "dark",
    }).catch((err) => {
      setErrorMsg(`应用毛玻璃效果失败：${String(err)}`);
    });
  }, [loaded, settings.opacity, settings.blurMode, resolvedTheme]);

  // Fixed window size at top-right of target monitor (does not grow with items)
  useEffect(() => {
    if (!loaded) return;
    void invoke("apply_window_layout", {
      logicalHeight: FIXED_LOGICAL_HEIGHT,
      monitorId: settings.targetMonitorId,
    }).catch(() => {
      // ignore transient layout errors
    });
  }, [loaded, settings.targetMonitorId]);

  const persistTodos = useCallback(async (nextTodos: TodoItem[]) => {
    try {
      await invoke("save_todos", { todos: nextTodos });
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(`保存失败（数据未写入磁盘）：${String(err)}`);
    }
  }, []);

  const persistSettings = useCallback(async (nextSettings: AppSettings) => {
    try {
      await invoke("save_settings", { settings: nextSettings });
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(`保存设置失败：${String(err)}`);
    }
  }, []);

  const handleAddTodo = useCallback(
    (content: string) => {
      const now = Date.now();
      const nextItem: TodoItem = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        content,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      setTodos((prev) => {
        const next = [nextItem, ...prev];
        void persistTodos(next);
        return next;
      });
    },
    [persistTodos]
  );

  const handleEditTodo = useCallback(
    (id: string, nextContent: string) => {
      const now = Date.now();
      setTodos((prev) => {
        const next = prev.map((t) =>
          t.id === id ? { ...t, content: nextContent, updatedAt: now } : t
        );
        void persistTodos(next);
        return next;
      });
    },
    [persistTodos]
  );

  const handleToggleComplete = useCallback(
    (id: string) => {
      const now = Date.now();
      setTodos((prev) => {
        const next = prev.map((t) =>
          t.id === id ? { ...t, completed: !t.completed, updatedAt: now } : t
        );
        void persistTodos(next);
        return next;
      });
    },
    [persistTodos]
  );

  const handleDeleteTodo = useCallback(
    (id: string) => {
      setTodos((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
        const target = prev[idx];
        const next = prev.filter((t) => t.id !== id);
        void persistTodos(next);

        setDeletedRecord({ item: target, index: idx });
        if (undoTimerRef.current) {
          window.clearTimeout(undoTimerRef.current);
        }
        undoTimerRef.current = window.setTimeout(() => {
          setDeletedRecord(null);
        }, 5000);

        return next;
      });
    },
    [persistTodos]
  );

  const handleClearCompleted = useCallback(() => {
    setTodos((prev) => {
      const next = prev.filter((t) => !t.completed);
      void persistTodos(next);
      return next;
    });
  }, [persistTodos]);

  const handleUndoDelete = useCallback(() => {
    if (!deletedRecord) return;
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const { item, index } = deletedRecord;
    setDeletedRecord(null);

    setTodos((prev) => {
      const next = [...prev];
      const insertAt = Math.min(index, next.length);
      next.splice(insertAt, 0, item);
      void persistTodos(next);
      return next;
    });
  }, [deletedRecord, persistTodos]);

  const handleUpdateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        void persistSettings(next);

        if (patch.alwaysOnTop !== undefined) {
          void invoke("set_always_on_top", { alwaysOnTop: patch.alwaysOnTop }).catch(
            (err) => setErrorMsg(`切换置顶失败：${String(err)}`)
          );
        }
        if (patch.launchAtStartup !== undefined) {
          void invoke("set_launch_at_startup", {
            enabled: patch.launchAtStartup,
          }).catch((err) => setErrorMsg(`设置开机启动失败：${String(err)}`));
        }
        return next;
      });
    },
    [persistSettings]
  );

  const handleToggleSettings = useCallback(async () => {
    if (!showSettings) {
      try {
        const mons = await invoke<MonitorDescriptor[]>("get_monitors");
        setMonitors(mons);
      } catch {
        // ignore
      }
    }
    setShowSettings((prev) => !prev);
  }, [showSettings]);

  const handleToggleLock = useCallback(() => {
    if (isLocked) {
      return;
    }
    if (settings.lockPasswordHash) {
      setShowSettings(false);
      setIsLocked(true);
    } else {
      setShowSettings(false);
      setSettingUpPassword(true);
    }
  }, [isLocked, settings.lockPasswordHash]);

  const handleUnlock = useCallback(
    async (password: string): Promise<boolean> => {
      if (!settings.lockPasswordHash) {
        setIsLocked(false);
        return true;
      }
      const hashed = await hashPassword(password);
      if (hashed === settings.lockPasswordHash) {
        setIsLocked(false);
        return true;
      }
      return false;
    },
    [settings.lockPasswordHash]
  );

  const handleSavePassword = useCallback(
    async (password: string) => {
      const hashed = await hashPassword(password);
      handleUpdateSettings({ lockPasswordHash: hashed });
      setSettingUpPassword(false);
      setIsLocked(true);
    },
    [handleUpdateSettings]
  );

  const handleHide = useCallback(() => {
    void invoke("hide_window");
  }, []);

  const noopMeasure = useCallback(() => {}, []);

  const handleTiltMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const el = tiltCardRef.current;
      if (!el) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      if (tiltRafRef.current !== null) {
        cancelAnimationFrame(tiltRafRef.current);
      }
      tiltRafRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const { rotateX, rotateY } = computeTiltAngles(clientX, clientY, rect, 12);
        el.style.transition = "transform 90ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });
    },
    []
  );

  const handleTiltMouseLeave = useCallback(() => {
    if (tiltRafRef.current !== null) {
      cancelAnimationFrame(tiltRafRef.current);
      tiltRafRef.current = null;
    }
    const el = tiltCardRef.current;
    if (!el) return;
    el.style.transition = "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg)";
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const isActivelyTyping = useCallback(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !document.hasFocus()) return false;
    const tag = el.tagName;
    if (tag !== "TEXTAREA" && tag !== "INPUT") return false;
    const textVal = (el as HTMLInputElement | HTMLTextAreaElement).value ?? "";
    return textVal.trim().length > 0 || Date.now() - lastTypingTimeRef.current < 1500;
  }, []);

  const probeAndMaybeHide = useCallback(async () => {
    if (
      !loaded ||
      !settings.edgeAutoHide ||
      isEdgeHidden ||
      showSettings ||
      settingUpPassword
    ) {
      outsideSinceRef.current = null;
      return;
    }
    if (isActivelyTyping()) {
      outsideSinceRef.current = null;
      return;
    }
    try {
      const probe = await invoke<{ dockedRight: boolean; cursorInside: boolean }>(
        "get_edge_hide_probe"
      );
      if (!probe.dockedRight || probe.cursorInside) {
        outsideSinceRef.current = null;
        return;
      }
      const now = Date.now();
      // Give user 2.0s after app startup before first auto-hide if they haven't touched it yet
      if (now - mountedAtRef.current < 2000) {
        return;
      }
      if (outsideSinceRef.current === null) {
        outsideSinceRef.current = now;
        return;
      }
      if (now - outsideSinceRef.current >= 400) {
        outsideSinceRef.current = null;
        await invoke("set_edge_hidden", {
          hidden: true,
          logicalHeight: FIXED_LOGICAL_HEIGHT,
        });
        setIsEdgeHidden(true);
      }
    } catch {
      // ignore transient errors
    }
  }, [
    loaded,
    settings.edgeAutoHide,
    isEdgeHidden,
    showSettings,
    settingUpPassword,
    isActivelyTyping,
  ]);

  const scheduleEdgeHideCheck = useCallback(() => {
    clearHideTimer();
    if (
      !loaded ||
      !settings.edgeAutoHide ||
      isEdgeHidden ||
      showSettings ||
      settingUpPassword
    ) {
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      void probeAndMaybeHide();
    }, 420);
  }, [
    clearHideTimer,
    loaded,
    settings.edgeAutoHide,
    isEdgeHidden,
    showSettings,
    settingUpPassword,
    probeAndMaybeHide,
  ]);

  const handleUnhideFromEdge = useCallback(async () => {
    clearHideTimer();
    outsideSinceRef.current = null;
    if (!isEdgeHidden) return;
    try {
      await invoke("set_edge_hidden", {
        hidden: false,
        logicalHeight: FIXED_LOGICAL_HEIGHT,
      });
    } catch {
      // ignore
    }
    setIsEdgeHidden(false);
  }, [clearHideTimer, isEdgeHidden]);

  useEffect(() => {
    const markTyping = () => {
      lastTypingTimeRef.current = Date.now();
    };
    window.addEventListener("keydown", markTyping, true);
    window.addEventListener("input", markTyping, true);
    return () => {
      window.removeEventListener("keydown", markTyping, true);
      window.removeEventListener("input", markTyping, true);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !settings.edgeAutoHide || isEdgeHidden || showSettings || settingUpPassword) {
      outsideSinceRef.current = null;
      return;
    }
    const intervalId = window.setInterval(() => {
      void probeAndMaybeHide();
    }, 300);
    return () => window.clearInterval(intervalId);
  }, [
    loaded,
    settings.edgeAutoHide,
    isEdgeHidden,
    showSettings,
    settingUpPassword,
    probeAndMaybeHide,
  ]);

  useEffect(() => {
    const unlistenMoved = listen("window-moved", () => {
      outsideSinceRef.current = null;
      scheduleEdgeHideCheck();
    });
    const unlistenUnhide = listen("edge-unhide", () => {
      clearHideTimer();
      outsideSinceRef.current = null;
      setIsEdgeHidden(false);
    });
    const onWindowBlur = () => {
      outsideSinceRef.current = Date.now();
      scheduleEdgeHideCheck();
    };
    window.addEventListener("blur", onWindowBlur);
    return () => {
      clearHideTimer();
      window.removeEventListener("blur", onWindowBlur);
      void unlistenMoved.then((fn) => fn());
      void unlistenUnhide.then((fn) => fn());
    };
  }, [clearHideTimer, scheduleEdgeHideCheck]);

  useEffect(() => {
    if (!settings.edgeAutoHide && isEdgeHidden) {
      void handleUnhideFromEdge();
    }
  }, [settings.edgeAutoHide, isEdgeHidden, handleUnhideFromEdge]);

  const glassBackground =
    resolvedTheme === "light"
      ? `rgba(255, 255, 255, ${settings.opacity / 100})`
      : `rgba(24, 24, 24, ${settings.opacity / 100})`;

  if (isEdgeHidden) {
    return (
      <div
        className="w-full h-full flex items-center justify-end bg-transparent"
        onMouseEnter={() => void handleUnhideFromEdge()}
        onClick={() => void handleUnhideFromEdge()}
        title="移入展开便利贴"
      >
        <div
          className="w-3.5 h-28 rounded-l-xl border-y border-l flex flex-col items-center justify-center gap-1.5 cursor-pointer shadow-lg"
          style={{
            backgroundColor:
              resolvedTheme === "light"
                ? "rgba(255, 255, 255, 0.72)"
                : "rgba(30, 41, 59, 0.78)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderColor: "rgba(37, 99, 235, 0.75)",
          }}
        >
          <span
            className="w-1 h-8 rounded-full"
            style={{ backgroundColor: "var(--action-primary)" }}
          />
          {activeCount > 0 && (
            <span
              className="text-[10px] font-bold leading-none tabular-nums"
              style={{ color: "var(--action-primary)" }}
            >
              {activeCount}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full p-5 bg-transparent"
      onMouseEnter={() => {
        outsideSinceRef.current = null;
        clearHideTimer();
      }}
      onMouseLeave={() => {
        outsideSinceRef.current = Date.now();
        scheduleEdgeHideCheck();
      }}
    >
      <div
        ref={tiltCardRef}
        onMouseMove={handleTiltMouseMove}
        onMouseLeave={handleTiltMouseLeave}
        className="relative w-full h-full overflow-hidden rounded-2xl border"
        style={{
          borderColor: "var(--border-window)",
          boxShadow: "0 14px 32px rgba(0, 0, 0, 0.14)",
          transformStyle: "preserve-3d",
          transform: "perspective(800px) rotateX(0deg) rotateY(0deg)",
          willChange: "transform",
        }}
      >
      {/* Layer 1: Soft colorful shapes behind the frosted glass layer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ filter: "blur(36px)" }}
      >
        <div
          className="absolute -top-10 -left-10 w-44 h-44 rounded-full"
          style={{ backgroundColor: "rgba(96, 165, 250, 0.55)" }}
        />
        <div
          className="absolute top-24 -right-8 w-40 h-40 rounded-full"
          style={{ backgroundColor: "rgba(192, 132, 252, 0.48)" }}
        />
        <div
          className="absolute -bottom-10 left-12 w-48 h-48 rounded-full"
          style={{ backgroundColor: "rgba(52, 211, 153, 0.42)" }}
        />
      </div>

      {/* Layer 2: Frosted glass surface (rgba(255,255,255,0.15) + backdrop-filter: blur(16px)) */}
      <div
        className="relative z-10 w-full h-full flex flex-col"
        style={{
          backgroundColor: glassBackground,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <TitleBar
          activeCount={activeCount}
          isLocked={isLocked}
          hasPassword={Boolean(settings.lockPasswordHash)}
          showSettings={showSettings}
          onToggleLock={handleToggleLock}
          onToggleSettings={() => void handleToggleSettings()}
          onHide={handleHide}
        />

        {isLocked ? (
          <LockOverlay
            mode="unlock"
            onUnlock={handleUnlock}
            onSavePassword={handleSavePassword}
            onCancelSetup={() => setSettingUpPassword(false)}
          />
        ) : settingUpPassword ? (
          <LockOverlay
            mode="setup"
            onUnlock={handleUnlock}
            onSavePassword={handleSavePassword}
            onCancelSetup={() => setSettingUpPassword(false)}
          />
        ) : (
          <>
            <TodoInput onAdd={handleAddTodo} />

            {errorMsg && (
              <div className="px-3 pb-2 shrink-0">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border caption-5"
                  style={{
                    backgroundColor: "var(--surface-popover)",
                    borderColor: "var(--border-error)",
                    color: "var(--text-error)",
                  }}
                >
                  <WarningCircle size={14} className="shrink-0" />
                  <span className="flex-1 break-words">{errorMsg}</span>
                </div>
              </div>
            )}

            {showSettings ? (
              <div className="flex-1 min-h-0 overflow-y-auto sticky-scroll">
                <SettingsPanel
                  settings={settings}
                  monitors={monitors}
                  onUpdate={handleUpdateSettings}
                  onRequestChangePassword={() => {
                    setShowSettings(false);
                    setSettingUpPassword(true);
                  }}
                  onClearPassword={() => handleUpdateSettings({ lockPasswordHash: null })}
                  onClose={() => setShowSettings(false)}
                />
              </div>
            ) : (
              <>
                <InfiniteTodoList
                  items={todos}
                  onToggleComplete={handleToggleComplete}
                  onEdit={handleEditTodo}
                  onDelete={handleDeleteTodo}
                  onMeasureContentHeight={noopMeasure}
                />

                <UndoToast
                  visible={deletedRecord !== null}
                  label="已删除一条待办"
                  onUndo={handleUndoDelete}
                  onDismiss={() => setDeletedRecord(null)}
                />

                {completedCount > 0 && (
                  <footer className="px-3 pb-2.5 pt-1 shrink-0 flex items-center justify-between">
                    <span className="caption-5" style={{ color: "var(--text-secondary)" }}>
                      已完成 {completedCount} 项
                    </span>
                    <button
                      type="button"
                      onClick={handleClearCompleted}
                      className="interactive-btn caption-4 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--action-secondary)]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Trash size={12} />
                      清理已完成
                    </button>
                  </footer>
                )}
              </>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

export default App;
