use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub id: String,
    pub content: String,
    pub completed: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub opacity: u8,
    pub blur_mode: String,
    pub theme: String,
    pub always_on_top: bool,
    pub launch_at_startup: bool,
    pub target_monitor_id: Option<String>,
    pub lock_password_hash: Option<String>,
    pub edge_auto_hide: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            opacity: 48,
            blur_mode: "acrylic".to_string(),
            theme: "light".to_string(),
            always_on_top: false,
            launch_at_startup: false,
            target_monitor_id: None,
            lock_password_hash: None,
            edge_auto_hide: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateData {
    pub todos: Option<Vec<TodoItem>>,
    pub settings: Option<AppSettings>,
    pub todos_error: Option<String>,
    pub settings_error: Option<String>,
}

fn split_load<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> (Option<T>, Option<String>) {
    match load_json_or_default::<T>(path) {
        Ok(value) => (Some(value), None),
        Err(message) => (None, Some(message)),
    }
}

/// 待办和设置分开读取。一边失败时另一边仍返回已读到的数据，调用方不得据此覆盖失败的那个文件。
pub fn load_app_files(data_dir: &Path) -> AppStateData {
    let (todos, todos_error) = split_load::<Vec<TodoItem>>(&todos_path(data_dir));
    let (settings, settings_error) = split_load::<AppSettings>(&settings_path(data_dir));
    AppStateData {
        todos,
        settings,
        todos_error,
        settings_error,
    }
}

pub fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建数据目录失败 ({}): {}", parent.display(), e))?;
    }

    let json = serde_json::to_string_pretty(value)
        .map_err(|e| format!("序列化数据失败: {}", e))?;

    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, json.as_bytes())
        .map_err(|e| format!("写入临时文件失败 ({}): {}", tmp_path.display(), e))?;

    fs::rename(&tmp_path, path)
        .map_err(|e| format!("保存数据文件失败 ({}): {}", path.display(), e))?;

    Ok(())
}

pub fn load_json_or_default<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> Result<T, String> {
    if !path.exists() {
        return Ok(T::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|e| format!("读取数据文件失败 ({}): {}", path.display(), e))?;
    if content.trim().is_empty() {
        return Ok(T::default());
    }
    serde_json::from_str(&content)
        .map_err(|e| format!("解析数据文件失败 ({}): {}", path.display(), e))
}

pub fn todos_path(data_dir: &Path) -> PathBuf {
    data_dir.join("todos.json")
}

pub fn settings_path(data_dir: &Path) -> PathBuf {
    data_dir.join("settings.json")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("desk_sticky_test_{}_{}", name, nanos))
    }

    #[test]
    fn test_atomic_write_and_load_todos() {
        let dir = temp_test_dir("todos");
        let path = todos_path(&dir);
        let items = vec![TodoItem {
            id: "1".to_string(),
            content: "测试待办事项".to_string(),
            completed: false,
            created_at: 1000,
            updated_at: 1000,
        }];
        atomic_write_json(&path, &items).expect("write should succeed");
        let loaded: Vec<TodoItem> = load_json_or_default(&path).expect("load should succeed");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].content, "测试待办事项");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_settings_default_and_roundtrip() {
        let dir = temp_test_dir("settings");
        let path = settings_path(&dir);
        let def: AppSettings = load_json_or_default(&path).expect("default should load");
        assert_eq!(def.opacity, 48);
        assert_eq!(def.theme, "light");
        assert!(!def.always_on_top);
        assert!(!def.launch_at_startup);

        let custom = AppSettings {
            opacity: 65,
            blur_mode: "blur".to_string(),
            theme: "dark".to_string(),
            always_on_top: true,
            launch_at_startup: false,
            target_monitor_id: Some("\\\\.\\DISPLAY2".to_string()),
            lock_password_hash: Some("abc123".to_string()),
            edge_auto_hide: true,
        };
        atomic_write_json(&path, &custom).expect("write settings");
        let loaded: AppSettings = load_json_or_default(&path).expect("load settings");
        assert_eq!(loaded.opacity, 65);
        assert_eq!(loaded.target_monitor_id.as_deref(), Some("\\\\.\\DISPLAY2"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_corrupt_settings_keep_todos_file() {
        let dir = temp_test_dir("partial");
        let todos = todos_path(&dir);
        let settings = settings_path(&dir);
        let items = vec![TodoItem {
            id: "1".to_string(),
            content: "保留".to_string(),
            completed: false,
            created_at: 1000,
            updated_at: 1000,
        }];
        atomic_write_json(&todos, &items).expect("write todos");
        fs::write(&settings, b"{").expect("write broken settings");
        let todos_before = fs::read(&todos).expect("read todos");
        let settings_before = fs::read(&settings).expect("read settings");

        let loaded = load_app_files(&dir);
        assert_eq!(loaded.todos.expect("todos").len(), 1);
        assert!(loaded.todos_error.is_none());
        assert!(loaded.settings.is_none());
        assert!(loaded.settings_error.is_some());
        assert_eq!(fs::read(&todos).expect("todos unchanged"), todos_before);
        assert_eq!(fs::read(&settings).expect("settings unchanged"), settings_before);
        let _ = fs::remove_dir_all(&dir);
    }
}
