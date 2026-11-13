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
import {
  applySaveResult,
  canPersistDomain,
  describeDataStatus,
  resolveDomainLoad,
} from "./utils/loadGate";
import { hashPassword } from "./utils/password";
import { computeTiltAngles } from "./utils/tilt3d";
import {
  AppSettings,
  AppStateData,
  DEFAULT_SETTINGS,
  MonitorDescriptor,
  TodoItem,
} from "./types/todo";

const TILT_PERSPECTIVE = "1100px";
const TILT_MAX_DEG = 7;
const TILT_REST = `perspective(${TILT_PERSPECTIVE}) rotateX(0deg) rotateY(0deg)`;
const UNFOCUSED_OPACITY_FACTOR = 0.85;

interface DeletedRecord {
  item: TodoItem;
  index: number;
}

const FIXED_LOGICAL_HEIGHT = 450;

function DataStatus({
  todosLoad,
  settingsLoad,
  todosLoadError,
  settingsLoadError,
  monitorsError,
  onRetry,
}: {
  todosLoad: "loading" | "ready" | "error";
  settingsLoad: "loading" | "ready" | "error";
  todosLoadError: string | null;
  settingsLoadError: string | null;
  monitorsError: string | null;
  onRetry: () => void;
}) {
  const status = describeDataStatus({
    todosPhase: todosLoad,
    settingsPhase: settingsLoad,
    todosError: todosLoadError,
    settingsError: settingsLoadError,
    monitorsError,
  });
  if (status.messages.length === 0) return null;
  return (
    <div className="px-3 pb-2 shrink-0">
      <div
        className="flex flex-col gap-2 px-3 py-2 rounded-lg border caption-5"
        style={{
          backgroundColor: "var(--surface-popover)",
          borderColor: status.showRetry ? "var(--border-error)" : "var(--border-primary)",
          color: status.showRetry ? "var(--text-error)" : "var(--text-secondary)",
        }}
      >
        {status.messages.map((message) => (
          <span key={message} className="break-words">
            {message}
          </span>
        ))}
        {status.showRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="interactive-btn button-xsm self-start px-2 py-1 rounded-md"
            style={{
              backgroundColor: "var(--action-primary)",
              color: "var(--text-inverted)",
            }}
          >
            重试加载
          </button>
        )}
      </div>
    </div>
  );
}

export function App() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [monitors, setMonitors] = useState<MonitorDescriptor[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [settingUpPassword, setSettingUpPassword] = useState(false);
  const [todosSaveError, setTodosSaveError] = useState<string | null>(null);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deletedRecord, setDeletedRecord] = useState<DeletedRecord | null>(null);
  const [todosLoad, setTodosLoad] = useState<"loading" | "ready" | "error">("loading");
  const [settingsLoad, setSettingsLoad] = useState<"loading" | "ready" | "error">("loading");
  const [todosLoadError, setTodosLoadError] = useState<string | null>(null);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [monitorsError, setMonitorsError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isEdgeHidden, setIsEdgeHidden] = useState(false);
  const [windowFocused, setWindowFocused] = useState(() =>
    typeof document !== "undefined" ? document.hasFocus() : true
  );
  const [shellHot, setShellHot] = useState(false);

  const undoTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const outsideSinceRef = useRef<number | null>(null);
  const lastTypingTimeRef = useRef<number>(0);
  const mountedAtRef = useRef<number>(Date.now());
  const tiltCardRef = useRef<HTMLDivElement>(null);
  const tiltRafRef = useRef<number | null>(null);
  const tiltSettledRef = useRef(true);
  const liquidSpringRef = useRef({ glow: 0, glowV: 0 });
  const todosLoadRef = useRef(todosLoad);
  const settingsLoadRef = useRef(settingsLoad);
  const settingsRef = useRef(settings);
  const todosRevisionRef = useRef(0);
  const settingsRevisionRef = useRef(0);
  const failedTodosRef = useRef<TodoItem[] | null>(null);
  const failedSettingsRef = useRef<AppSettings | null>(null);
  todosLoadRef.current = todosLoad;
  settingsLoadRef.current = settingsLoad;
  settingsRef.current = settings;
  const settingsReady = settingsLoad === "ready";
  const todosReady = todosLoad === "ready";
  const resolvedTheme = useResolvedTheme(settings.theme);

  const activeCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos]
  );
  const completedCount = useMemo(
    () => todos.filter((t) => t.completed).length,
    [todos]
  );

  useEffect(() => {
    let active = true;
    setTodosLoad("loading");
    setSettingsLoad("loading");
    setTodosLoadError(null);
    setSettingsLoadError(null);
    setMonitorsError(null);
    (async () => {
      try {
        const state = await invoke<AppStateData>("load_app_state");
        if (!active) return;
        const todosResult = resolveDomainLoad(state.todos, state.todosError);
        const settingsResult = resolveDomainLoad(state.settings, state.settingsError);
        if (todosResult.phase === "ready" && todosResult.data !== null) {
          setTodos(todosResult.data);
          setTodosLoad("ready");
          setTodosLoadError(null);
        } else {
          setTodosLoad("error");
          setTodosLoadError(todosResult.error);
        }
        if (settingsResult.phase === "ready" && settingsResult.data !== null) {
          setSettings(settingsResult.data);
          setSettingsLoad("ready");
          setSettingsLoadError(null);
          if (settingsResult.data.lockPasswordHash) {
            setIsLocked(true);
          }
        } else {
          setSettingsLoad("error");
          setSettingsLoadError(settingsResult.error);
        }
      } catch (err) {
        if (!active) return;
        const message = `加载本地数据失败：${String(err)}`;
        setTodosLoad("error");
        setSettingsLoad("error");
        setTodosLoadError(message);
        setSettingsLoadError(message);
      }

      try {
        const mons = await invoke<MonitorDescriptor[]>("get_monitors");
        if (!active) return;
        setMonitors(mons);
        setMonitorsError(null);
      } catch (err) {
        if (!active) return;
        setMonitorsError(String(err));
      }
    })();
    return () => {
      active = false;
    };
  }, [loadAttempt]);

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
    if (!settingsReady) return;
    void invoke("set_backdrop", {
      opacity: settings.opacity,
      blurMode: settings.blurMode,
      isDark: resolvedTheme === "dark",
    }).catch((err) => {
      setSettingsSaveError(`应用毛玻璃效果失败：${String(err)}`);
    });
  }, [settingsReady, settings.opacity, settings.blurMode, resolvedTheme]);

  // Fixed window size at top-right of target monitor (does not grow with items)
  useEffect(() => {
    if (!settingsReady) return;
    void invoke("apply_window_layout", {
      logicalHeight: FIXED_LOGICAL_HEIGHT,
      monitorId: settings.targetMonitorId,
    }).catch(() => {
      // ignore transient layout errors
    });
  }, [settingsReady, settings.targetMonitorId]);

  useEffect(() => {
    if (!settingsReady) return;
    let active = true;
    void (async () => {
      try {
        const actual = await invoke<boolean>("get_launch_at_startup");
        if (!active || actual === settingsRef.current.launchAtStartup) return;
        const next = { ...settingsRef.current, launchAtStartup: actual };
        await invoke("save_settings", { settings: next });
        if (!active) return;
        setSettings(next);
      } catch (err) {
        if (!active) return;
        setSettingsSaveError(`无法对齐开机启动状态：${String(err)}`);
      }
    })();
    return () => {
      active = false;
    };
  }, [settingsReady, loadAttempt]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resetTilt = () => {
      if (!media.matches) return;
      if (tiltRafRef.current !== null) {
        cancelAnimationFrame(tiltRafRef.current);
        tiltRafRef.current = null;
      }
      const card = tiltCardRef.current;
      if (!card) return;
      card.style.transition = "none";
      card.style.transform = TILT_REST;
      tiltSettledRef.current = true;
    };
    resetTilt();
    media.addEventListener("change", resetTilt);
    return () => media.removeEventListener("change", resetTilt);
  }, []);

  useEffect(() => {
    const card = tiltCardRef.current;
    if (!card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      liquidSpringRef.current.glow = 0;
      liquidSpringRef.current.glowV = 0;
      card.style.setProperty("--liquid-glow", "0");
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const spring = liquidSpringRef.current;
      const target = shellHot ? 1 : 0;
      const sub = dt / 8;
      for (let i = 0; i < 8; i += 1) {
        spring.glowV += (330 * (target - spring.glow) - 30 * spring.glowV) * sub;
        spring.glow += spring.glowV * sub;
      }
      card.style.setProperty("--liquid-glow", spring.glow.toFixed(4));
      const settled = Math.abs(target - spring.glow) < 0.01 && Math.abs(spring.glowV) < 0.01;
      if (!settled) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [shellHot, isEdgeHidden]);

  const persistTodos = useCallback(async (nextTodos: TodoItem[]) => {
    if (!canPersistDomain(todosLoadRef.current)) return;
    const finished = ++todosRevisionRef.current;
    failedTodosRef.current = nextTodos;
    try {
      await invoke("save_todos", { todos: nextTodos });
      if (applySaveResult(todosRevisionRef.current, finished, true) === "clear") {
        failedTodosRef.current = null;
        setTodosSaveError(null);
      }
    } catch (err) {
      if (applySaveResult(todosRevisionRef.current, finished, false) === "fail") {
        setTodosSaveError(`保存失败（数据未写入磁盘）：${String(err)}`);
      }
    }
  }, []);

  const persistSettings = useCallback(async (nextSettings: AppSettings) => {
    if (!canPersistDomain(settingsLoadRef.current)) return;
    const finished = ++settingsRevisionRef.current;
    failedSettingsRef.current = nextSettings;
    try {
      await invoke("save_settings", { settings: nextSettings });
      if (applySaveResult(settingsRevisionRef.current, finished, true) === "clear") {
        failedSettingsRef.current = null;
        setSettingsSaveError(null);
      }
    } catch (err) {
      if (applySaveResult(settingsRevisionRef.current, finished, false) === "fail") {
        setSettingsSaveError(`保存设置失败：${String(err)}`);
      }
    }
  }, []);

  const commitTodos = useCallback(
    (produce: (prev: TodoItem[]) => TodoItem[] | null) => {
      if (!canPersistDomain(todosLoadRef.current)) return;
      let snapshot: TodoItem[] | null = null;
      setTodos((prev) => {
        const next = produce(prev);
        if (!next) return prev;
        snapshot = next;
        return next;
      });
      if (snapshot) void persistTodos(snapshot);
    },
    [persistTodos],
  );

  const commitLaunch = useCallback(async (next: AppSettings) => {
    const finished = ++settingsRevisionRef.current;
    failedSettingsRef.current = next;
    try {
      const actual = await invoke<boolean>("commit_launch_at_startup", { settings: next });
      if (applySaveResult(settingsRevisionRef.current, finished, true) !== "clear") return;
      failedSettingsRef.current = null;
      setSettings((prev) => ({ ...prev, launchAtStartup: actual }));
      setSettingsSaveError(null);
    } catch (err) {
      if (applySaveResult(settingsRevisionRef.current, finished, false) !== "fail") return;
      setSettingsSaveError(`设置开机启动失败：${String(err)}`);
      try {
        const actual = await invoke<boolean>("get_launch_at_startup");
        setSettings((prev) => ({ ...prev, launchAtStartup: actual }));
      } catch {
        // 注册表也读不到时，保留进入这次操作之前的勾选值。
      }
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
      commitTodos((prev) => [nextItem, ...prev]);
    },
    [commitTodos],
  );

  const handleEditTodo = useCallback(
    (id: string, nextContent: string) => {
      const now = Date.now();
      commitTodos((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, content: nextContent, updatedAt: now } : item,
        ),
      );
    },
    [commitTodos],
  );

  const handleToggleComplete = useCallback(
    (id: string) => {
      const now = Date.now();
      commitTodos((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, completed: !item.completed, updatedAt: now } : item,
        ),
      );
    },
    [commitTodos],
  );

  const handleDeleteTodo = useCallback(
    (id: string) => {
      let removed: DeletedRecord | null = null;
      commitTodos((prev) => {
        const index = prev.findIndex((item) => item.id === id);
        if (index === -1) return null;
        removed = { item: prev[index], index };
        return prev.filter((item) => item.id !== id);
      });
      if (!removed) return;
      setDeletedRecord(removed);
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => {
        setDeletedRecord(null);
      }, 5000);
    },
    [commitTodos],
  );

  const handleClearCompleted = useCallback(() => {
    commitTodos((prev) => prev.filter((item) => !item.completed));
  }, [commitTodos]);

  const handleUndoDelete = useCallback(() => {
    if (!deletedRecord) return;
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const { item, index } = deletedRecord;
    setDeletedRecord(null);
    commitTodos((prev) => {
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, item);
      return next;
    });
  }, [deletedRecord, commitTodos]);

  const handleUpdateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      if (!canPersistDomain(settingsLoadRef.current)) return;
      const next = { ...settingsRef.current, ...patch };
      if (patch.launchAtStartup !== undefined) {
        void commitLaunch(next);
        return;
      }
      let committed: AppSettings | null = null;
      setSettings((prev) => {
        committed = { ...prev, ...patch };
        return committed;
      });
      if (!committed) return;
      settingsRef.current = committed;
      void persistSettings(committed);
      if (patch.alwaysOnTop !== undefined) {
        void invoke("set_always_on_top", { alwaysOnTop: patch.alwaysOnTop }).catch((err) => {
          setSettingsSaveError(`切换置顶失败：${String(err)}`);
        });
      }
    },
    [commitLaunch, persistSettings],
  );

  const handleToggleSettings = useCallback(async () => {
    if (!showSettings) {
      try {
        const mons = await invoke<MonitorDescriptor[]>("get_monitors");
        setMonitors(mons);
        setMonitorsError(null);
      } catch (err) {
        setMonitorsError(String(err));
      }
      if (canPersistDomain(settingsLoadRef.current)) {
        try {
          const actual = await invoke<boolean>("get_launch_at_startup");
          if (actual !== settingsRef.current.launchAtStartup) {
            const next = { ...settingsRef.current, launchAtStartup: actual };
            await invoke("save_settings", { settings: next });
            setSettings(next);
          }
        } catch (err) {
          setSettingsSaveError(`无法对齐开机启动状态：${String(err)}`);
        }
      }
    }
    setShowSettings((prev) => !prev);
  }, [showSettings]);

  const handleToggleLock = useCallback(() => {
    if (!settingsReady) return;
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
  }, [isLocked, settings.lockPasswordHash, settingsReady]);

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

  const handleSavePassword = useCallback(async (password: string) => {
    if (!canPersistDomain(settingsLoadRef.current)) {
      throw new Error("设置尚未加载完成，已取消保存");
    }
    const hashed = await hashPassword(password);
    const next: AppSettings = { ...settingsRef.current, lockPasswordHash: hashed };
    await invoke("save_settings", { settings: next });
    setSettings(next);
    setSettingUpPassword(false);
    setIsLocked(true);
  }, []);

  const handleHide = useCallback(() => {
    void invoke("hide_window");
  }, []);

  const noopMeasure = useCallback(() => {}, []);

  const settleTilt = useCallback((animate: boolean) => {
    if (tiltRafRef.current !== null) {
      cancelAnimationFrame(tiltRafRef.current);
      tiltRafRef.current = null;
    }
    const el = tiltCardRef.current;
    if (!el || tiltSettledRef.current) return;
    tiltSettledRef.current = true;
    el.style.transition = animate
      ? "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";
    el.style.transform = TILT_REST;
  }, []);

  const handleTiltMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      const el = tiltCardRef.current;
      if (!el) return;
      const field = document.activeElement;
      if (
        field instanceof HTMLElement &&
        (field.tagName === "INPUT" || field.tagName === "TEXTAREA") &&
        el.contains(field)
      ) {
        settleTilt(true);
        return;
      }
      const clientX = e.clientX;
      const clientY = e.clientY;
      if (tiltRafRef.current !== null) {
        cancelAnimationFrame(tiltRafRef.current);
      }
      tiltRafRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const { rotateX, rotateY } = computeTiltAngles(clientX, clientY, rect, TILT_MAX_DEG);
        tiltSettledRef.current = false;
        el.style.transition = "none";
        el.style.transform = `perspective(${TILT_PERSPECTIVE}) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });
    },
    [settleTilt]
  );

  const handleTiltMouseLeave = useCallback(() => {
    settleTilt(true);
  }, [settleTilt]);

  const handleTiltFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        settleTilt(true);
      }
    },
    [settleTilt]
  );

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
      !settingsReady ||
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
    settingsReady,
    settings.edgeAutoHide,
    isEdgeHidden,
    showSettings,
    settingUpPassword,
    isActivelyTyping,
  ]);

  const scheduleEdgeHideCheck = useCallback(() => {
    clearHideTimer();
    if (
      !settingsReady ||
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
    settingsReady,
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
    if (!settingsReady || !settings.edgeAutoHide || isEdgeHidden || showSettings || settingUpPassword) {
      outsideSinceRef.current = null;
      return;
    }
    const intervalId = window.setInterval(() => {
      void probeAndMaybeHide();
    }, 300);
    return () => window.clearInterval(intervalId);
  }, [
    settingsReady,
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
    const onWindowFocus = () => setWindowFocused(true);
    const onWindowBlur = () => {
      setWindowFocused(false);
      outsideSinceRef.current = Date.now();
      scheduleEdgeHideCheck();
    };
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      clearHideTimer();
      window.removeEventListener("focus", onWindowFocus);
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

  const liveText = [todosSaveError, settingsSaveError, deletedRecord ? "已删除一条待办，可以撤销" : null]
    .filter((part): part is string => Boolean(part))
    .join("。");

  const retryTodosSave = () => {
    const snapshot = failedTodosRef.current;
    if (snapshot) void persistTodos(snapshot);
  };

  const retrySettingsSave = () => {
    const snapshot = failedSettingsRef.current;
    if (!snapshot) return;
    if (snapshot.launchAtStartup !== settingsRef.current.launchAtStartup) {
      void commitLaunch(snapshot);
      return;
    }
    void persistSettings(snapshot);
  };

  const focusFactor = windowFocused ? 1 : UNFOCUSED_OPACITY_FACTOR;
  const shellAlpha = Math.min(1, Math.max(0, (settings.opacity / 100) * focusFactor));
  const edgeChipBackground = `rgba(14, 18, 32, ${Math.max(0.35, shellAlpha * 0.62)})`;

  if (isEdgeHidden) {
    return (
      <div
        className="w-full h-full flex items-center justify-end bg-transparent"
        onMouseEnter={() => void handleUnhideFromEdge()}
      >
        <button
          type="button"
          aria-label="展开便利贴"
          title="展开便利贴"
          onClick={() => void handleUnhideFromEdge()}
          className="interactive-btn w-3.5 h-28 rounded-l-xl border-y border-l flex flex-col items-center justify-center gap-1.5 cursor-pointer shadow-lg"
          style={{
            backgroundColor: edgeChipBackground,
            borderColor: "rgba(255, 255, 255, 0.45)",
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
        </button>
        <div className="sr-only" role="status" aria-live="polite">
          {liveText}
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
        onMouseEnter={() => setShellHot(true)}
        onMouseMove={handleTiltMouseMove}
        onMouseLeave={() => {
          setShellHot(false);
          handleTiltMouseLeave();
        }}
        onFocus={handleTiltFocus}
        className="relative w-full h-full overflow-hidden glass-shell-liquid"
        style={{
          transformStyle: "preserve-3d",
          transform: TILT_REST,
        }}
      >
      <>
          <div className="liquid-veil" style={{ opacity: shellAlpha }} />
          <div className="liquid-ambient" aria-hidden="true" style={{ opacity: shellAlpha }}>
            <div
              className="liquid-blob"
              style={{
                width: "58%",
                height: "58%",
                left: "-18%",
                top: "-22%",
                background:
                  "radial-gradient(circle, rgba(84, 134, 255, 0.58) 0%, rgba(84, 134, 255, 0.32) 42%, rgba(84, 134, 255, 0.09) 72%, rgba(84, 134, 255, 0) 100%)",
              }}
            />
            <div
              className="liquid-blob"
              style={{
                width: "50%",
                height: "50%",
                left: "58%",
                top: "6%",
                background:
                  "radial-gradient(circle, rgba(96, 238, 214, 0.47) 0%, rgba(96, 238, 214, 0.26) 42%, rgba(96, 238, 214, 0.08) 72%, rgba(96, 238, 214, 0) 100%)",
              }}
            />
            <div
              className="liquid-blob"
              style={{
                width: "62%",
                height: "62%",
                left: "-8%",
                top: "42%",
                background:
                  "radial-gradient(circle, rgba(178, 120, 255, 0.41) 0%, rgba(178, 120, 255, 0.22) 42%, rgba(178, 120, 255, 0.07) 72%, rgba(178, 120, 255, 0) 100%)",
              }}
            />
          </div>
          <div className="liquid-specular" aria-hidden="true" style={{ opacity: shellAlpha }} />
          <div className="liquid-sheen" aria-hidden="true" />
          <div className="liquid-rim" aria-hidden="true" />
        </>

      <div className="relative z-10 w-full h-full flex flex-col">
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
            key="unlock"
            mode="unlock"
            onUnlock={handleUnlock}
            onSavePassword={handleSavePassword}
            onCancelSetup={() => setSettingUpPassword(false)}
          />
        ) : settingUpPassword ? (
          <LockOverlay
            key="setup"
            mode="setup"
            onUnlock={handleUnlock}
            onSavePassword={handleSavePassword}
            onCancelSetup={() => setSettingUpPassword(false)}
          />
        ) : (
          <>
            <DataStatus
              todosLoad={todosLoad}
              settingsLoad={settingsLoad}
              todosLoadError={todosLoadError}
              settingsLoadError={settingsLoadError}
              monitorsError={monitorsError}
              onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
            />

            {todosReady && (
              <TodoInput
                value={draft}
                onChange={setDraft}
                onAdd={(content) => {
                  if (!canPersistDomain(todosLoadRef.current)) return;
                  handleAddTodo(content);
                  setDraft("");
                }}
              />
            )}

            {(todosSaveError || settingsSaveError) && (
              <div className="px-3 pb-2 shrink-0 flex flex-col gap-2">
                {todosSaveError && (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border caption-5"
                    style={{
                      backgroundColor: "var(--surface-popover)",
                      borderColor: "var(--border-error)",
                      color: "var(--text-error)",
                    }}
                  >
                    <WarningCircle size={14} className="shrink-0" />
                    <span className="flex-1 break-words">{todosSaveError}</span>
                    <button type="button" className="interactive-btn shrink-0" onClick={retryTodosSave}>
                      重试
                    </button>
                  </div>
                )}
                {settingsSaveError && (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border caption-5"
                    style={{
                      backgroundColor: "var(--surface-popover)",
                      borderColor: "var(--border-error)",
                      color: "var(--text-error)",
                    }}
                  >
                    <WarningCircle size={14} className="shrink-0" />
                    <span className="flex-1 break-words">{settingsSaveError}</span>
                    <button type="button" className="interactive-btn shrink-0" onClick={retrySettingsSave}>
                      重试
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="sr-only" role="status" aria-live="polite">
              {liveText}
            </div>

            {showSettings ? (
              settingsReady ? (
                <div id="settings-panel" className="flex-1 min-h-0 overflow-y-auto sticky-scroll">
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
                <p className="px-3 pb-3 caption-5" style={{ color: "var(--text-secondary)" }}>
                  设置表单已停用，避免把未加载的设置写回磁盘。
                </p>
              )
            ) : todosReady ? (
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
            ) : (
              <div className="flex-1" />
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

export default App;
