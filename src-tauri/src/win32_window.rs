use serde::Serialize;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicBool, Ordering};
use windows::core::{s, PCSTR};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_TRANSITIONS_FORCEDISABLED, DWMSBT_NONE,
};
use windows::Win32::Graphics::Gdi::{
    CreateRoundRectRgn, EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, SetWindowRgn,
    HDC, HMONITOR, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::LibraryLoader::{GetModuleHandleA, GetModuleHandleW};
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, GetDpiForWindow, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetClassNameW, GetCursorPos,
    GetForegroundWindow, GetMessageW, GetWindowLongW, GetWindowRect, IsIconic, RegisterClassW,
    SetWindowLongW, SetWindowPos, ShowWindow, TranslateMessage, EVENT_SYSTEM_FOREGROUND,
    GWL_EXSTYLE, GWL_STYLE, HWND_NOTOPMOST, HWND_TOP, HWND_TOPMOST, MONITORINFOF_PRIMARY, MSG,
    STYLESTRUCT, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    SW_RESTORE, SW_SHOWNOACTIVATE, WINEVENT_OUTOFCONTEXT, WM_DISPLAYCHANGE, WM_NCACTIVATE,
    WM_NCCALCSIZE, WM_NCDESTROY, WM_NCPAINT, WM_SETTEXT, WM_STYLECHANGING, WNDCLASSW,
    WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_OVERLAPPED,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorDescriptor {
    pub id: String,
    pub name: String,
    pub is_primary: bool,
    pub work_left: i32,
    pub work_top: i32,
    pub work_right: i32,
    pub work_bottom: i32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowRectPx {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub radius_px: i32,
}

pub fn compute_top_right_rect(
    work_left: i32,
    work_top: i32,
    work_right: i32,
    work_bottom: i32,
    scale_factor: f64,
    logical_width: f64,
    logical_height: f64,
) -> WindowRectPx {
    let scale = if scale_factor > 0.1 { scale_factor } else { 1.0 };
    // Window includes 20px transparent stage padding on all sides for 3D tilt,
    // so placing the outer window flush to work_right / work_top keeps the card 20px from edges.
    let margin_px = 0;
    let work_w = (work_right - work_left).max(240);
    let work_h = (work_bottom - work_top).max(240);

    let max_avail_w = (work_w - margin_px * 2).max(200);
    let max_avail_h = (work_h - margin_px * 2).max(160);
    let max_65_h = ((work_h as f64) * 0.72).floor() as i32;

    let desired_w = (logical_width * scale).round() as i32;
    let desired_h = (logical_height * scale).round() as i32;

    let width = desired_w.clamp(280, max_avail_w);
    let height = desired_h.clamp(120, max_65_h.min(max_avail_h).max(120));

    let raw_x = work_right - margin_px - width;
    let raw_y = work_top + margin_px;

    let x = raw_x.clamp(work_left, (work_right - width).max(work_left));
    let y = raw_y.clamp(work_top, (work_bottom - height).max(work_top));
    let radius_px = (16.0 * scale).round() as i32;

    WindowRectPx {
        x,
        y,
        width,
        height,
        radius_px,
    }
}

pub fn compute_scaled_size_px(
    scale_factor: f64,
    logical_width: f64,
    logical_height: f64,
) -> (i32, i32) {
    let scale = if scale_factor > 0.1 { scale_factor } else { 1.0 };
    let width = (logical_width * scale).round().max(280.0) as i32;
    let height = (logical_height * scale).round().max(120.0) as i32;
    (width, height)
}

#[cfg(test)]
pub fn is_point_on_any_monitor(monitors: &[MonitorDescriptor], x: i32, y: i32) -> bool {
    find_monitor_containing_point(monitors, x, y).is_some()
}

pub fn find_monitor_containing_point(
    monitors: &[MonitorDescriptor],
    x: i32,
    y: i32,
) -> Option<MonitorDescriptor> {
    monitors
        .iter()
        .find(|m| x >= m.work_left && x < m.work_right && y >= m.work_top && y < m.work_bottom)
        .cloned()
}

pub fn is_rect_docked_right(rect_right: i32, monitor_work_right: i32, scale_factor: f64) -> bool {
    let scale = if scale_factor > 0.1 { scale_factor } else { 1.0 };
    // Window includes 20px transparent tilt stage padding on the right;
    // 40px threshold means docking triggers whenever the visible card is within ~20px of the right edge.
    let threshold = (40.0 * scale).round() as i32;
    rect_right >= monitor_work_right - threshold
}

pub fn is_cursor_inside_rect(cursor_x: i32, cursor_y: i32, rect: RECT) -> bool {
    cursor_x >= rect.left
        && cursor_x < rect.right
        && cursor_y >= rect.top
        && cursor_y < rect.bottom
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeHideProbe {
    pub docked_right: bool,
    pub cursor_inside: bool,
}

pub fn compute_edge_peek_rect(
    monitor: &MonitorDescriptor,
    current_top: i32,
    peek_w_logical: f64,
    peek_h_logical: f64,
) -> WindowRectPx {
    let scale = if monitor.scale_factor > 0.1 {
        monitor.scale_factor
    } else {
        1.0
    };
    let width = (peek_w_logical * scale).round().max(14.0) as i32;
    let height = (peek_h_logical * scale).round().max(64.0) as i32;
    let x = monitor.work_right - width;
    let offset_y = (40.0 * scale).round() as i32;
    let y = (current_top + offset_y).clamp(
        monitor.work_top,
        (monitor.work_bottom - height).max(monitor.work_top),
    );
    WindowRectPx {
        x,
        y,
        width,
        height,
        radius_px: (8.0 * scale).round() as i32,
    }
}

pub fn compute_edge_restore_rect(
    monitor: &MonitorDescriptor,
    saved_top: i32,
    full_w_logical: f64,
    full_h_logical: f64,
) -> WindowRectPx {
    let scale = if monitor.scale_factor > 0.1 {
        monitor.scale_factor
    } else {
        1.0
    };
    let work_w = (monitor.work_right - monitor.work_left).max(240);
    let work_h = (monitor.work_bottom - monitor.work_top).max(240);
    let max_72_h = ((work_h as f64) * 0.72).floor() as i32;

    let (desired_w, desired_h) = compute_scaled_size_px(scale, full_w_logical, full_h_logical);
    let width = desired_w.clamp(280, work_w.max(280));
    let height = desired_h.clamp(120, max_72_h.min(work_h).max(120));

    let x = (monitor.work_right - width).max(monitor.work_left);
    let y = saved_top.clamp(
        monitor.work_top,
        (monitor.work_bottom - height).max(monitor.work_top),
    );
    WindowRectPx {
        x,
        y,
        width,
        height,
        radius_px: (16.0 * scale).round() as i32,
    }
}

unsafe extern "system" fn enum_monitor_proc(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<MonitorDescriptor>);
    if let Some((desc, _)) = descriptor_from_hmonitor(hmonitor, list.len() + 1) {
        list.push(desc);
    }
    BOOL(1)
}

pub fn list_monitors() -> Vec<MonitorDescriptor> {
    let mut monitors: Vec<MonitorDescriptor> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(enum_monitor_proc),
            LPARAM(&mut monitors as *mut _ as isize),
        );
    }
    monitors.sort_by_key(|m| (!m.is_primary, m.id.clone()));
    monitors
}

pub fn resolve_target_monitor(
    monitors: &[MonitorDescriptor],
    preferred_id: Option<&str>,
) -> Option<MonitorDescriptor> {
    if let Some(id) = preferred_id {
        if let Some(found) = monitors.iter().find(|m| m.id == id) {
            return Some(found.clone());
        }
    }
    monitors
        .iter()
        .find(|m| m.is_primary)
        .or_else(|| monitors.first())
        .cloned()
}

const NC_GUARD_SUBCLASS_ID: usize = 0xD5C1;

/// Style bits that make Windows draw a native caption / border / system buttons.
/// WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX
const NATIVE_FRAME_STYLE_BITS: u32 = 0x00C0_0000 | 0x0008_0000 | 0x0004_0000 | 0x0002_0000 | 0x0001_0000;
const GWL_STYLE_INDEX: i32 = -16;

/// Pure helper: remove every style bit that can produce a native frame.
pub fn strip_native_frame_bits(style: u32) -> u32 {
    style & !NATIVE_FRAME_STYLE_BITS
}

/// Window subclass that guarantees the window can never get a native frame.
/// tao keeps WS_CAPTION | WS_SYSMENU on undecorated windows and hides it only through
/// WM_NCCALCSIZE = 0, and it rewrites the whole style (apply_diff) whenever a window flag
/// changes (focus / visibility changes when clicking other apps). That re-adds the caption,
/// so Windows draws the classic frame again. WM_STYLECHANGING lets us veto those bits.
unsafe extern "system" fn nc_guard_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    _ref_data: usize,
) -> LRESULT {
    match msg {
        WM_STYLECHANGING if (wparam.0 as i32) == GWL_STYLE_INDEX => {
            let ss = lparam.0 as *mut STYLESTRUCT;
            if !ss.is_null() {
                (*ss).styleNew = strip_native_frame_bits((*ss).styleNew);
            }
            LRESULT(0)
        }
        WM_NCPAINT => LRESULT(0),
        WM_NCACTIVATE => {
            // lParam = -1 tells DefWindowProc not to repaint the caption on (de)activation
            DefSubclassProc(hwnd, msg, wparam, LPARAM(-1))
        }
        WM_NCCALCSIZE if wparam.0 != 0 => LRESULT(0),
        WM_SETTEXT => LRESULT(1), // ignore title changes: no caption text is ever drawn
        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(nc_guard_proc), NC_GUARD_SUBCLASS_ID);
            DefSubclassProc(hwnd, msg, wparam, lparam)
        }
        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}

pub fn configure_tool_window(hwnd_raw: isize) {
    let hwnd = HWND(hwnd_raw as *mut c_void);
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(nc_guard_proc), NC_GUARD_SUBCLASS_ID, 0);

        // Re-apply the current style: WM_STYLECHANGING (guard above) strips the frame bits.
        let style = GetWindowLongW(hwnd, GWL_STYLE);
        SetWindowLongW(hwnd, GWL_STYLE, style);

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_style = (ex_style | WS_EX_TOOLWINDOW.0 as i32) & !(WS_EX_APPWINDOW.0 as i32);
        SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);

        let disable_transitions: i32 = 1;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &disable_transitions as *const _ as *const c_void,
            size_of::<i32>() as u32,
        );

        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

pub fn apply_window_rect(hwnd_raw: isize, rect: WindowRectPx) {
    let hwnd = HWND(hwnd_raw as *mut c_void);
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            None,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
        apply_card_clip(hwnd);
    }
}

pub fn resize_window_preserving_position(
    hwnd_raw: isize,
    scale_factor: f64,
    logical_width: f64,
    logical_height: f64,
) {
    let hwnd = HWND(hwnd_raw as *mut c_void);
    let (width, height) = compute_scaled_size_px(scale_factor, logical_width, logical_height);
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            width,
            height,
            SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
        apply_card_clip(hwnd);
    }
}

pub fn get_window_rect_raw(hwnd_raw: isize) -> Option<RECT> {
    let hwnd = HWND(hwnd_raw as *mut c_void);
    let mut rect = RECT::default();
    unsafe {
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return None;
        }
    }
    Some(rect)
}

pub fn descriptor_from_hmonitor(hmonitor: HMONITOR, fallback_index: usize) -> Option<(MonitorDescriptor, RECT)> {
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
    unsafe {
        if !GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut _).as_bool() {
            return None;
        }
        let len = info
            .szDevice
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(info.szDevice.len());
        let device_id = String::from_utf16_lossy(&info.szDevice[..len]);
        let is_primary = (info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY) != 0;

        let mut dpi_x: u32 = 96;
        let mut dpi_y: u32 = 96;
        let _ = GetDpiForMonitor(hmonitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        let scale_factor = (dpi_x as f64) / 96.0;

        let short_name = device_id.trim_start_matches("\\\\.\\");
        let display_name = if is_primary {
            format!("主显示器 ({})", short_name)
        } else {
            format!("显示器 {} ({})", fallback_index, short_name)
        };

        Some((
            MonitorDescriptor {
                id: device_id,
                name: display_name,
                is_primary,
                work_left: info.monitorInfo.rcWork.left,
                work_top: info.monitorInfo.rcWork.top,
                work_right: info.monitorInfo.rcWork.right,
                work_bottom: info.monitorInfo.rcWork.bottom,
                scale_factor,
            },
            info.monitorInfo.rcMonitor,
        ))
    }
}

pub fn get_window_containing_monitor(
    hwnd_raw: isize,
    monitors: &[MonitorDescriptor],
) -> Option<(RECT, MonitorDescriptor)> {
    let rect = get_window_rect_raw(hwnd_raw)?;
    let hwnd = HWND(hwnd_raw as *mut c_void);
    let hmonitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if !hmonitor.is_invalid() {
        if let Some((desc, _)) = descriptor_from_hmonitor(hmonitor, 1) {
            return Some((rect, desc));
        }
    }
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    let monitor = find_monitor_containing_point(monitors, center_x, center_y)
        .or_else(|| monitors.first().cloned())?;
    Some((rect, monitor))
}

pub fn probe_edge_hide_state(hwnd_raw: isize) -> EdgeHideProbe {
    let Some(rect) = get_window_rect_raw(hwnd_raw) else {
        return EdgeHideProbe {
            docked_right: false,
            cursor_inside: false,
        };
    };
    let hwnd = HWND(hwnd_raw as *mut c_void);
    let hmonitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    let docked_right = if !hmonitor.is_invalid() {
        if let Some((desc, rc_monitor)) = descriptor_from_hmonitor(hmonitor, 1) {
            is_rect_docked_right(rect.right, desc.work_right, desc.scale_factor)
                || is_rect_docked_right(rect.right, rc_monitor.right, desc.scale_factor)
        } else {
            false
        }
    } else {
        false
    };

    let mut pt = POINT::default();
    let cursor_inside = unsafe { GetCursorPos(&mut pt).is_ok() }
        && is_cursor_inside_rect(pt.x, pt.y, rect);

    EdgeHideProbe {
        docked_right,
        cursor_inside,
    }
}

pub fn is_window_on_any_monitor(hwnd_raw: isize, monitors: &[MonitorDescriptor]) -> bool {
    let Some(rect) = get_window_rect_raw(hwnd_raw) else {
        return false;
    };
    let center_x = (rect.left + rect.right) / 2;
    let center_y = (rect.top + rect.bottom) / 2;
    find_monitor_containing_point(monitors, center_x, center_y).is_some()
}

pub fn set_window_topmost(hwnd_raw: isize, topmost: bool) {
    let hwnd = HWND(hwnd_raw as *mut c_void);
    unsafe {
        let insert_after = if topmost { HWND_TOPMOST } else { HWND_NOTOPMOST };
        let _ = SetWindowPos(
            hwnd,
            insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

#[repr(C)]
struct AccentPolicy {
    accent_state: u32,
    accent_flags: u32,
    gradient_color: u32,
    animation_id: u32,
}

#[repr(C)]
struct WindowCompositionAttribData {
    attrib: u32,
    pv_data: *mut c_void,
    cb_data: usize,
}

type SetWindowCompositionAttributeFn =
    unsafe extern "system" fn(HWND, *mut WindowCompositionAttribData) -> BOOL;

const ACCENT_DISABLED: u32 = 0;
const WCA_ACCENT_POLICY: u32 = 19;

/// 按卡片圆角裁切，避免系统模糊铺成直角。贴边窄条不裁，否则收起条会消失。
fn apply_card_clip(hwnd: HWND) {
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return;
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        let dpi = GetDpiForWindow(hwnd).max(96) as f64;
        let pad = (20.0 * dpi / 96.0).round() as i32;
        let radius = (28.0 * dpi / 96.0).round().max(8.0) as i32;
        if width <= pad * 2 + 24 || height <= pad * 2 + 24 {
            let _ = SetWindowRgn(hwnd, None, true);
            return;
        }
        let region = CreateRoundRectRgn(
            pad,
            pad,
            width - pad,
            height - pad,
            radius * 2,
            radius * 2,
        );
        if region.is_invalid() {
            return;
        }
        let _ = SetWindowRgn(hwnd, region, true);
    }
}

pub fn apply_backdrop(hwnd_raw: isize, _opacity_percent: u8, _blur_mode: &str, _is_dark: bool) {
    let hwnd = HWND(hwnd_raw as *mut c_void);
    unsafe {
        let backdrop_type = DWMSBT_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop_type as *const _ as *const c_void,
            size_of::<i32>() as u32,
        );
        if let Ok(user32) = GetModuleHandleA(s!("user32.dll")) {
            if let Some(proc_addr) = windows::Win32::System::LibraryLoader::GetProcAddress(
                user32,
                PCSTR(b"SetWindowCompositionAttribute\0".as_ptr()),
            ) {
                let func: SetWindowCompositionAttributeFn = std::mem::transmute(proc_addr);
                let mut policy = AccentPolicy {
                    accent_state: ACCENT_DISABLED,
                    accent_flags: 0,
                    gradient_color: 0,
                    animation_id: 0,
                };
                let mut data = WindowCompositionAttribData {
                    attrib: WCA_ACCENT_POLICY,
                    pv_data: &mut policy as *mut _ as *mut c_void,
                    cb_data: size_of::<AccentPolicy>(),
                };
                let _ = func(hwnd, &mut data);
            }
        }
        apply_card_clip(hwnd);
    }
}

static TARGET_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static SHOULD_BE_VISIBLE: AtomicBool = AtomicBool::new(true);
static IS_TOPMOST: AtomicBool = AtomicBool::new(false);

pub fn update_visibility_tracking(hwnd_raw: isize, visible: bool, topmost: bool) {
    TARGET_HWND.store(hwnd_raw, Ordering::SeqCst);
    SHOULD_BE_VISIBLE.store(visible, Ordering::SeqCst);
    IS_TOPMOST.store(topmost, Ordering::SeqCst);
}

unsafe extern "system" fn win_event_proc(
    _hook: HWINEVENTHOOK,
    _event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    if !SHOULD_BE_VISIBLE.load(Ordering::SeqCst) {
        return;
    }
    let target_raw = TARGET_HWND.load(Ordering::SeqCst);
    if target_raw == 0 {
        return;
    }

    let fg = if hwnd.0.is_null() {
        GetForegroundWindow()
    } else {
        hwnd
    };
    if fg.0.is_null() {
        return;
    }

    let mut class_buf = [0u16; 64];
    let len = GetClassNameW(fg, &mut class_buf);
    if len <= 0 {
        return;
    }
    let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);

    // When Win+D or Show Desktop activates Progman / WorkerW, keep the sticky note visible above desktop
    if class_name == "Progman" || class_name == "WorkerW" {
        let target = HWND(target_raw as *mut c_void);
        if IsIconic(target).as_bool() {
            let _ = ShowWindow(target, SW_RESTORE);
        } else {
            let _ = ShowWindow(target, SW_SHOWNOACTIVATE);
        }
        let insert_after = if IS_TOPMOST.load(Ordering::SeqCst) {
            HWND_TOPMOST
        } else {
            HWND_TOP
        };
        let _ = SetWindowPos(
            target,
            insert_after,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

pub fn install_win_d_hook(hwnd_raw: isize) {
    TARGET_HWND.store(hwnd_raw, Ordering::SeqCst);
    unsafe {
        let _ = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(win_event_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
    }
}

static DISPLAY_CALLBACK: std::sync::OnceLock<Box<dyn Fn() + Send + Sync>> =
    std::sync::OnceLock::new();

unsafe extern "system" fn display_watcher_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_DISPLAYCHANGE {
        if let Some(cb) = DISPLAY_CALLBACK.get() {
            cb();
        }
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

pub fn start_display_change_watcher<F>(on_display_change: F)
where
    F: Fn() + Send + Sync + 'static,
{
    let _ = DISPLAY_CALLBACK.set(Box::new(on_display_change));
    std::thread::spawn(|| unsafe {
        let hinstance = GetModuleHandleW(None).unwrap_or_default();
        let class_name: Vec<u16> = "DeskStickyDisplayWatcher\0".encode_utf16().collect();
        let wc = WNDCLASSW {
            lpfnWndProc: Some(display_watcher_proc),
            hInstance: hinstance.into(),
            lpszClassName: windows::core::PCWSTR(class_name.as_ptr()),
            ..Default::default()
        };
        RegisterClassW(&wc);
        let hwnd = CreateWindowExW(
            Default::default(),
            windows::core::PCWSTR(class_name.as_ptr()),
            windows::core::PCWSTR(class_name.as_ptr()),
            WS_OVERLAPPED,
            0,
            0,
            0,
            0,
            None,
            None,
            hinstance,
            None,
        );
        if let Ok(h) = hwnd {
            if !h.0.is_null() {
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_native_frame_bits_removes_caption_and_buttons() {
        // tao's default undecorated style still carries WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX
        // | WS_MAXIMIZEBOX | WS_CLIPSIBLINGS | WS_VISIBLE; the guard must drop every frame bit.
        let tao_style: u32 = 0x00C0_0000 | 0x0008_0000 | 0x0002_0000 | 0x0001_0000 | 0x0400_0000 | 0x1000_0000;
        let stripped = strip_native_frame_bits(tao_style);
        assert_eq!(stripped & NATIVE_FRAME_STYLE_BITS, 0);
        // unrelated bits (WS_CLIPSIBLINGS, WS_VISIBLE) are preserved
        assert_eq!(stripped, 0x0400_0000 | 0x1000_0000);
    }

    #[test]
    fn test_top_right_positioning_1080p_100pct() {
        let rect = compute_top_right_rect(0, 0, 1920, 1032, 1.0, 400.0, 500.0);
        assert_eq!(rect.width, 400);
        assert_eq!(rect.height, 500);
        assert_eq!(rect.x, 1920 - 400);
        assert_eq!(rect.y, 0);
        assert_eq!(rect.radius_px, 16);
    }

    #[test]
    fn test_top_right_clamps_to_65_percent_height_and_150_scale() {
        // 1920x1032 work area at 150% scale
        let rect = compute_top_right_rect(0, 0, 1920, 1032, 1.5, 400.0, 900.0);
        let max_h = (1032.0 * 0.72_f64).floor() as i32;
        assert_eq!(rect.width, 600);
        assert!(rect.height <= max_h);
        assert_eq!(rect.x, 1920 - 600);
        assert_eq!(rect.y, 0);
        assert_eq!(rect.radius_px, 24);
    }

    #[test]
    fn test_secondary_monitor_negative_coords() {
        let rect = compute_top_right_rect(-1920, 0, 0, 1040, 1.0, 400.0, 500.0);
        assert_eq!(rect.x, -400);
        assert_eq!(rect.y, 0);
        assert!(rect.x >= -1920 && rect.x + rect.width <= 0);
    }

    #[test]
    fn test_scale_change_preserves_size_ratio_without_snapping() {
        assert_eq!(compute_scaled_size_px(1.5, 400.0, 400.0), (600, 600));
        assert_eq!(compute_scaled_size_px(1.0, 400.0, 400.0), (400, 400));
    }

    #[test]
    fn test_is_point_on_any_monitor_detects_hdmi_and_disconnected() {
        let monitors = vec![
            MonitorDescriptor {
                id: "\\\\.\\DISPLAY1".to_string(),
                name: "主显示器".to_string(),
                is_primary: true,
                work_left: 0,
                work_top: 0,
                work_right: 1920,
                work_bottom: 1032,
                scale_factor: 1.5,
            },
            MonitorDescriptor {
                id: "\\\\.\\DISPLAY2".to_string(),
                name: "HDMI".to_string(),
                is_primary: false,
                work_left: 1920,
                work_top: 0,
                work_right: 3840,
                work_bottom: 1040,
                scale_factor: 1.0,
            },
        ];
        assert!(is_point_on_any_monitor(&monitors, 2200, 200));
        assert!(!is_point_on_any_monitor(&monitors, 4200, 200));
    }

    #[test]
    fn test_edge_dock_detection_and_peek_restore_rects() {
        let monitor = MonitorDescriptor {
            id: "\\\\.\\DISPLAY1".to_string(),
            name: "主显示器".to_string(),
            is_primary: true,
            work_left: 0,
            work_top: 0,
            work_right: 1920,
            work_bottom: 1032,
            scale_factor: 1.5,
        };
        // Within 40*1.5 = 60px of right edge (accounting for 20px transparent padding) -> docked
        assert!(is_rect_docked_right(1920, monitor.work_right, monitor.scale_factor));
        assert!(is_rect_docked_right(1865, monitor.work_right, monitor.scale_factor));
        // Dragged slightly past edge -> still docked
        assert!(is_rect_docked_right(1950, monitor.work_right, monitor.scale_factor));
        // Far from right edge -> not docked
        assert!(!is_rect_docked_right(1600, monitor.work_right, monitor.scale_factor));

        let rect = RECT {
            left: 1320,
            top: 0,
            right: 1920,
            bottom: 675,
        };
        assert!(is_cursor_inside_rect(1500, 200, rect));
        assert!(!is_cursor_inside_rect(1200, 200, rect));

        let peek = compute_edge_peek_rect(&monitor, 100, 20.0, 140.0);
        assert_eq!(peek.width, 30);
        assert_eq!(peek.x, 1920 - 30);

        let restored = compute_edge_restore_rect(&monitor, 100, 400.0, 450.0);
        assert_eq!(restored.width, 600);
        assert_eq!(restored.height, 675);
        assert_eq!(restored.x, 1920 - 600);
        assert_eq!(restored.y, 100);

        // High-DPI (175%) 1080p laptop clamps height consistently with startup
        let hidpi_laptop = MonitorDescriptor {
            scale_factor: 1.75,
            ..monitor
        };
        let hidpi_restored = compute_edge_restore_rect(&hidpi_laptop, 0, 400.0, 450.0);
        assert_eq!(hidpi_restored.height, (1032.0 * 0.72_f64).floor() as i32);
    }
}
