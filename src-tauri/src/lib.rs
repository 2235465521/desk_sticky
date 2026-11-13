mod env_check;
mod storage;
mod win32_window;

use std::sync::Mutex;
use storage::{
    atomic_write_json, load_json_or_default, settings_path, todos_path, AppSettings, AppStateData,
    TodoItem,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use win32_window::{
    apply_backdrop, apply_window_rect, compute_edge_peek_rect, compute_edge_restore_rect,
    compute_top_right_rect, configure_tool_window, get_window_containing_monitor,
    install_win_d_hook, is_window_on_any_monitor, list_monitors, probe_edge_hide_state,
    resize_window_preserving_position, resolve_target_monitor, set_window_topmost,
    start_display_change_watcher, update_visibility_tracking, EdgeHideProbe, MonitorDescriptor,
};
use winreg::enums::*;
use winreg::RegKey;

struct RuntimeState {
    settings: Mutex<AppSettings>,
    logical_height: Mutex<f64>,
    is_edge_hidden: Mutex<bool>,
    pre_hide_top: Mutex<Option<i32>>,
}

fn get_hwnd(window: &tauri::WebviewWindow) -> Result<isize, String> {
    window
        .hwnd()
        .map(|h| h.0 as isize)
        .map_err(|e| format!("获取窗口句柄失败: {}", e))
}

fn reposition_window(
    window: &tauri::WebviewWindow,
    settings: &AppSettings,
    logical_height: f64,
) -> Result<(), String> {
    let hwnd = get_hwnd(window)?;
    let monitors = list_monitors();
    let target = resolve_target_monitor(&monitors, settings.target_monitor_id.as_deref())
        .ok_or_else(|| "未检测到可用显示器".to_string())?;

    let rect = compute_top_right_rect(
        target.work_left,
        target.work_top,
        target.work_right,
        target.work_bottom,
        target.scale_factor,
        400.0,
        logical_height,
    );
    apply_window_rect(hwnd, rect);
    Ok(())
}

#[tauri::command]
fn load_app_state(
    app: AppHandle,
    state: State<RuntimeState>,
) -> Result<AppStateData, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

    let todos: Vec<TodoItem> = load_json_or_default(&todos_path(&data_dir))?;
    let settings: AppSettings = load_json_or_default(&settings_path(&data_dir))?;

    if let Ok(mut guard) = state.settings.lock() {
        *guard = settings.clone();
    }

    Ok(AppStateData { todos, settings })
}

#[tauri::command]
fn save_todos(app: AppHandle, todos: Vec<TodoItem>) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    atomic_write_json(&todos_path(&data_dir), &todos)
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<RuntimeState>,
    settings: AppSettings,
) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    atomic_write_json(&settings_path(&data_dir), &settings)?;

    if let Ok(mut guard) = state.settings.lock() {
        *guard = settings;
    }
    Ok(())
}

#[tauri::command]
fn get_monitors() -> Vec<MonitorDescriptor> {
    list_monitors()
}

#[tauri::command]
fn apply_window_layout(
    app: AppHandle,
    state: State<RuntimeState>,
    logical_height: f64,
    monitor_id: Option<String>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    if let Ok(mut h_guard) = state.logical_height.lock() {
        *h_guard = logical_height;
    }

    let mut settings = state
        .settings
        .lock()
        .map_err(|_| "状态锁异常".to_string())?
        .clone();
    if monitor_id.is_some() {
        settings.target_monitor_id = monitor_id;
    }

    reposition_window(&window, &settings, logical_height)
}

#[tauri::command]
fn set_backdrop(
    app: AppHandle,
    opacity: u8,
    blur_mode: String,
    is_dark: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let hwnd = get_hwnd(&window)?;
    apply_backdrop(hwnd, opacity, &blur_mode, is_dark);
    Ok(())
}

#[tauri::command]
fn set_always_on_top(
    app: AppHandle,
    state: State<RuntimeState>,
    always_on_top: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let hwnd = get_hwnd(&window)?;
    set_window_topmost(hwnd, always_on_top);
    let visible = window.is_visible().unwrap_or(true);
    update_visibility_tracking(hwnd, visible, always_on_top);

    if let Ok(mut guard) = state.settings.lock() {
        guard.always_on_top = always_on_top;
    }
    Ok(())
}

#[tauri::command]
fn set_launch_at_startup(enabled: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_WRITE,
        )
        .map_err(|e| format!("无法打开注册表启动项: {}", e))?;

    if enabled {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("获取程序路径失败: {}", e))?;
        let value = format!("\"{}\"", exe_path.display());
        run_key
            .set_value("DeskSticky", &value)
            .map_err(|e| format!("写入开机启动项失败: {}", e))?;
    } else {
        match run_key.delete_value("DeskSticky") {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("移除开机启动项失败: {}", e)),
        }
    }
    Ok(())
}

#[tauri::command]
fn get_edge_hide_probe(app: AppHandle) -> EdgeHideProbe {
    let Some(window) = app.get_webview_window("main") else {
        return EdgeHideProbe {
            docked_right: false,
            cursor_inside: false,
        };
    };
    let Ok(hwnd) = get_hwnd(&window) else {
        return EdgeHideProbe {
            docked_right: false,
            cursor_inside: false,
        };
    };
    probe_edge_hide_state(hwnd)
}

#[tauri::command]
fn is_docked_right(app: AppHandle) -> bool {
    get_edge_hide_probe(app).docked_right
}

#[tauri::command]
fn set_edge_hidden(
    app: AppHandle,
    state: State<RuntimeState>,
    hidden: bool,
    logical_height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let hwnd = get_hwnd(&window)?;
    let monitors = list_monitors();
    let Some((rect, monitor)) = get_window_containing_monitor(hwnd, &monitors) else {
        return Ok(());
    };

    if hidden {
        if let Ok(mut guard) = state.pre_hide_top.lock() {
            *guard = Some(rect.top);
        }
        if let Ok(mut guard) = state.is_edge_hidden.lock() {
            *guard = true;
        }
        let peek_rect = compute_edge_peek_rect(&monitor, rect.top, 20.0, 140.0);
        apply_window_rect(hwnd, peek_rect);
    } else {
        let saved_top = state
            .pre_hide_top
            .lock()
            .ok()
            .and_then(|g| *g)
            .unwrap_or(rect.top);
        if let Ok(mut guard) = state.is_edge_hidden.lock() {
            *guard = false;
        }
        let restore_rect = compute_edge_restore_rect(&monitor, saved_top, 400.0, logical_height);
        apply_window_rect(hwnd, restore_rect);
    }
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle, state: State<RuntimeState>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let hwnd = get_hwnd(&window)?;
    let topmost = state
        .settings
        .lock()
        .map(|g| g.always_on_top)
        .unwrap_or(false);
    update_visibility_tracking(hwnd, false, topmost);
    window
        .hide()
        .map_err(|e| format!("隐藏窗口失败: {}", e))
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        if let Ok(hwnd) = get_hwnd(&window) {
            let state = app.state::<RuntimeState>();
            let settings = state
                .settings
                .lock()
                .map(|g| g.clone())
                .unwrap_or_default();
            let h = state
                .logical_height
                .lock()
                .map(|g| *g)
                .unwrap_or(450.0);
            update_visibility_tracking(hwnd, true, settings.always_on_top);
            let was_edge_hidden = state
                .is_edge_hidden
                .lock()
                .map(|g| *g)
                .unwrap_or(false);
            let monitors = list_monitors();
            if was_edge_hidden {
                if let Ok(mut guard) = state.is_edge_hidden.lock() {
                    *guard = false;
                }
                if let Some((rect, monitor)) = get_window_containing_monitor(hwnd, &monitors) {
                    let saved_top = state
                        .pre_hide_top
                        .lock()
                        .ok()
                        .and_then(|g| *g)
                        .unwrap_or(rect.top);
                    let restore_rect = compute_edge_restore_rect(&monitor, saved_top, 400.0, h);
                    apply_window_rect(hwnd, restore_rect);
                } else {
                    let _ = reposition_window(&window, &settings, h);
                }
                let _ = app.emit("edge-unhide", ());
            } else if !is_window_on_any_monitor(hwnd, &monitors) {
                let _ = reposition_window(&window, &settings, h);
            }
        }
    }
}

pub fn run() {
    if !env_check::ensure_webview2_or_prompt() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .manage(RuntimeState {
            settings: Mutex::new(AppSettings::default()),
            logical_height: Mutex::new(450.0),
            is_edge_hidden: Mutex::new(false),
            pre_hide_top: Mutex::new(None),
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let initial_settings: AppSettings =
                load_json_or_default(&settings_path(&data_dir)).unwrap_or_default();

            {
                let state = app.state::<RuntimeState>();
                let mut guard = state.settings.lock().unwrap();
                *guard = initial_settings.clone();
            }

            let handle_for_display = app.handle().clone();
            start_display_change_watcher(move || {
                let app_handle = handle_for_display.clone();
                let inner_handle = app_handle.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    let state = inner_handle.state::<RuntimeState>();
                    let settings = state
                        .settings
                        .lock()
                        .map(|g| g.clone())
                        .unwrap_or_default();
                    let h = state
                        .logical_height
                        .lock()
                        .map(|g| *g)
                        .unwrap_or(280.0);
                    if let Some(w) = inner_handle.get_webview_window("main") {
                        if let Ok(hwnd) = get_hwnd(&w) {
                            let monitors = list_monitors();
                            if !is_window_on_any_monitor(hwnd, &monitors) {
                                let _ = reposition_window(&w, &settings, h);
                            }
                        }
                    }
                });
            });

            if let Some(window) = app.get_webview_window("main") {
                if let Ok(hwnd) = get_hwnd(&window) {
                    configure_tool_window(hwnd);
                    install_win_d_hook(hwnd);
                    update_visibility_tracking(hwnd, true, initial_settings.always_on_top);
                    set_window_topmost(hwnd, initial_settings.always_on_top);
                    apply_backdrop(
                        hwnd,
                        initial_settings.opacity,
                        &initial_settings.blur_mode,
                        initial_settings.theme == "dark",
                    );
                    let _ = reposition_window(&window, &initial_settings, 450.0);
                }
            }

            // Tray Menu
            let show_item = MenuItem::with_id(app, "show", "显示便利贴", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "隐藏便利贴", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &settings_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DeskSticky 桌面便利贴")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            if let Ok(hwnd) = get_hwnd(&w) {
                                let topmost = app
                                    .state::<RuntimeState>()
                                    .settings
                                    .lock()
                                    .map(|g| g.always_on_top)
                                    .unwrap_or(false);
                                update_visibility_tracking(hwnd, false, topmost);
                            }
                            let _ = w.hide();
                        }
                    }
                    "settings" => {
                        show_main_window(app);
                        let _ = app.emit("open-settings", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                if let Ok(hwnd) = get_hwnd(&w) {
                                    let topmost = app
                                        .state::<RuntimeState>()
                                        .settings
                                        .lock()
                                        .map(|g| g.always_on_top)
                                        .unwrap_or(false);
                                    update_visibility_tracking(hwnd, false, topmost);
                                }
                                let _ = w.hide();
                            } else {
                                show_main_window(app);
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    if let Ok(hwnd) = window.hwnd().map(|h| h.0 as isize) {
                        let topmost = window
                            .app_handle()
                            .state::<RuntimeState>()
                            .settings
                            .lock()
                            .map(|g| g.always_on_top)
                            .unwrap_or(false);
                        update_visibility_tracking(hwnd, false, topmost);
                    }
                    let _ = window.hide();
                }
                WindowEvent::Moved(_) => {
                    let app = window.app_handle();
                    let is_hidden = app
                        .state::<RuntimeState>()
                        .is_edge_hidden
                        .lock()
                        .map(|g| *g)
                        .unwrap_or(false);
                    if !is_hidden {
                        let _ = app.emit("window-moved", ());
                    }
                }
                WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                    let app = window.app_handle();
                    let state = app.state::<RuntimeState>();
                    let h = state
                        .logical_height
                        .lock()
                        .map(|g| *g)
                        .unwrap_or(450.0);
                    if let Some(w) = app.get_webview_window("main") {
                        if let Ok(hwnd) = get_hwnd(&w) {
                            // Keep current dragged (x, y) when crossing monitors with different DPIs
                            resize_window_preserving_position(hwnd, *scale_factor, 400.0, h);
                        }
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_todos,
            save_settings,
            get_monitors,
            apply_window_layout,
            set_backdrop,
            set_always_on_top,
            set_launch_at_startup,
            get_edge_hide_probe,
            is_docked_right,
            set_edge_hidden,
            hide_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
