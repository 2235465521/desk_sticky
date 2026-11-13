use windows::core::PCWSTR;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_ICONWARNING, MB_TOPMOST, MB_YESNO, SW_SHOWNORMAL,
};
use winreg::enums::*;
use winreg::RegKey;

const WEBVIEW2_CLIENT_SUBKEYS: [&str; 2] = [
    "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
];

const WEBVIEW2_DOWNLOAD_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

/// Validate a registry `pv` value reported by EdgeUpdate for WebView2 Runtime.
pub fn is_valid_webview2_version(pv: Option<&str>) -> bool {
    match pv.map(str::trim) {
        Some(v) if !v.is_empty() && v != "0.0.0.0" => true,
        _ => false,
    }
}

fn read_webview2_pv(root: &RegKey, subkey: &str) -> Option<String> {
    let key = root.open_subkey_with_flags(subkey, KEY_READ).ok()?;
    let pv: String = key.get_value("pv").ok()?;
    if is_valid_webview2_version(Some(&pv)) {
        Some(pv.trim().to_string())
    } else {
        None
    }
}

/// Detect installed Microsoft Edge WebView2 Evergreen Runtime version via registry.
pub fn detect_webview2_version() -> Option<String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    for subkey in WEBVIEW2_CLIENT_SUBKEYS {
        if let Some(ver) = read_webview2_pv(&hklm, subkey) {
            return Some(ver);
        }
    }
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    read_webview2_pv(
        &hkcu,
        "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    )
}

fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Ensure Microsoft Edge WebView2 Runtime is installed before starting Tauri.
/// Returns `true` if available; if missing, shows a friendly Chinese prompt
/// (and optionally opens Microsoft's official download page) then returns `false`.
pub fn ensure_webview2_or_prompt() -> bool {
    if detect_webview2_version().is_some() {
        return true;
    }

    let title = to_wide_null("DeskSticky 运行环境提示");
    let body = to_wide_null(
        "未检测到 Microsoft Edge WebView2 运行环境。\n\n\
         说明：DeskSticky 绿色版无需安装 Node.js，但需要系统组件 WebView2 才能正常显示界面。\n\n\
         是否立即打开微软官方页面下载安装（约 2MB 在线安装器）？",
    );

    unsafe {
        let choice = MessageBoxW(
            None,
            PCWSTR(body.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_YESNO | MB_ICONWARNING | MB_TOPMOST,
        );
        if choice == IDYES {
            let op = to_wide_null("open");
            let url = to_wide_null(WEBVIEW2_DOWNLOAD_URL);
            let _ = ShellExecuteW(
                None,
                PCWSTR(op.as_ptr()),
                PCWSTR(url.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            );
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_webview2_version() {
        assert!(!is_valid_webview2_version(None));
        assert!(!is_valid_webview2_version(Some("")));
        assert!(!is_valid_webview2_version(Some("   ")));
        assert!(!is_valid_webview2_version(Some("0.0.0.0")));
        assert!(is_valid_webview2_version(Some("120.0.2210.91")));
        assert!(is_valid_webview2_version(Some(" 131.0.2903.51 ")));
    }
}
