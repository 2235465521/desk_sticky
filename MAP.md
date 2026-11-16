# 项目模块地图 (MAP.md / Agent Navigation)

## 一、 项目架构与工程定位

DeskSticky（`desk-sticky`）是本地优先的 Windows 桌面便利贴。界面在 WebView2 里用 React 绘制，窗口、托盘、开机启动和圆角裁切由 Tauri 2 调用 Win32。没有远程服务。待办和设置落在本机应用数据目录的 JSON 文件里。

界面只有液态玻璃一种。设置字段 `blurMode` 仍保留，便于旧的 `settings.json` 读入；画面不再提供磨砂玻璃。

---

## 二、 核心入口与端口矩阵

| 服务 / 模块 | 职责与技术栈 | 开发环境入口 / 端口 | 关键配置 / 依赖 |
| :--- | :--- | :--- | :--- |
| 桌面壳 | Tauri 2 + Rust，单实例、托盘、透明无边框窗口 | `npm run tauri dev` | `src-tauri/tauri.conf.json`，标识 `com.desksticky.app`，逻辑窗口 400×450 |
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind 4 | Vite `http://localhost:1420`（`strictPort`） | `package.json` 要求 Node `>=20`；`npm test` 跑 Vitest |
| 环境检查 | 启动前确认本机已装 WebView2 Runtime | `npm run check:env` | `src-tauri/src/env_check.rs`，`scripts/check-env.ps1` |
| 持久化 | 同目录写临时文件再 `rename` | 无端口 | `%APPDATA%\com.desksticky.app\todos.json`、`settings.json` |
| 安装包 | `npm run tauri build` | 无端口 | `webviewInstallMode` 为静默 `downloadBootstrapper`；`--no-bundle` 的 exe 不负责安装 WebView2 |

---

## 三、 模块拓扑与职责分工

### 1. 前端 `src/`

- `main.tsx` 挂载应用。`App.tsx` 持有待办、设置、加载阶段、草稿、倾斜和边缘隐藏。
- `utils/loadGate.ts`：领域只有 `loading`、`ready`、`error`。只有 `ready` 可以落盘。待办和设置的读写错误分开记。
- `utils/password.ts`：密码锁只做界面校验，前缀 `desk-sticky::` 后做一次 SHA-256。待办正文仍是明文。
- `utils/tilt3d.ts`、`utils/loopScroll.ts`：跟手倾斜和长列表循环滚动。
- `components/TitleBar.tsx`：拖动、锁定、设置、隐藏到托盘。
- `components/TodoInput.tsx`、`TodoItemRow.tsx`、`InfiniteTodoList.tsx`、`CompletedSection.tsx`：输入、行编辑、循环列表、已完成分组。
- `components/SettingsPanel.tsx`：不透明度、主题、显示器、贴边隐藏、置顶、开机启动、密码锁。
- `components/LockOverlay.tsx`：解锁与首次设密。`UndoToast.tsx` 撤销删除。`ConfettiBurst.tsx` 完成动效。
- `styles/tokens.css`、`styles/global.css`：颜色、液态玻璃淡罩、光斑和标题栏。

### 2. 壳层 `src-tauri/src/`

- `lib.rs`：命令入口、窗口摆放、离屏拉回、显示器热插拔。命令有 `load_app_state`、`save_todos`、`save_settings`、`get_monitors`、`apply_window_layout`、`set_backdrop`、`set_always_on_top`、`get_launch_at_startup`、`commit_launch_at_startup`、`get_edge_hide_probe`、`is_docked_right`、`set_edge_hidden`、`hide_window`。
- `storage.rs`：拆开读取待办和设置。缺文件或空文件用默认值；读失败或解析失败返回错误，不用默认值覆盖好文件。
- `win32_window.rs`：圆角裁切、贴边收起、开机启动注册表 `HKCU\...\Run\DeskSticky`。`apply_backdrop` 关闭系统亚克力着色，淡罩由前端按不透明度绘制。
- `env_check.rs`：查注册表里的 WebView2 版本，缺失时提示下载。

### 3. 调用关系

前端经 `invoke` 调壳层命令。显示器列表失败只影响摆放，不把待办或设置打成加载失败，也不挡住已就绪数据的保存。开机启动先写注册表再读回，设置文件写入失败时把注册表回滚。
