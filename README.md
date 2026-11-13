# DeskSticky 桌面毛玻璃便利贴

基于 **Tauri v2 + React + TypeScript + Rust (Win32)** 开发的 Windows 轻量级桌面便利贴工具。

> **重要提示（给直接下载使用的用户）**：
> - 从 **Releases** 下载编译好的 `.exe` / 安装包使用时，**电脑上无需安装 Node.js 或 Rust**（界面已静态打包内嵌在程序内）。
> - 程序仅依赖 Windows 10/11 系统自带的 **WebView2 Runtime**；如果部分旧版 Win10 缺少该组件，启动时会自动弹出中文检测提示并可一键跳转微软官方下载（使用标准安装包 `.exe`/`.msi` 则会自动静默安装）。

## 主要功能

- **毛玻璃圆角卡片 + 3D 倾斜动效**：半透明磨砂玻璃质感、全圆角无原生边框，支持随鼠标位置平滑 3D 倾斜并在离开后自动回正。
- **待办管理与无限循环滚动**：固定窗口大小，支持回车快速添加、`Shift+Enter` 换行、双击/按钮行内编辑、删除撤销提示、完成打钩撒花特效与首尾衔接无限滚动（隐藏滚动条）。
- **流光 1px 蓝色边框**：待办卡片带动态流光细边框。
- **密码锁保护**：支持自定义设置/修改/清除解锁密码（本地 SHA-256 哈希保存），点击锁定按钮即可遮罩隐藏待办内容。
- **贴边自动收起 & 多屏适配**：
  - 拖动或停靠到屏幕右边缘时，鼠标离开自动收起为侧边小竖条，移入即展开。
  - 支持跨显示器（如笔记本 + 外接 HDMI 显示器）自由拖拽与跨 DPI 缩放自适应。
  - 支持 `Win+D` 显示桌面后保持可见、系统托盘驻留、单实例防多开、开机自启与多主题/透明度调节。

## 开发与构建

### 环境要求
开发机需要：
- Node.js 20 或更高版本
- Rust 工具链 (stable-msvc)
- Windows 10/11

成品运行不需要 Node.js 或 Rust。标准安装包在缺少 WebView2 时会联网下载安装运行时。`npm run tauri build -- --no-bundle` 生成的 exe 不带安装器，目标电脑需要已经安装 WebView2。

### 常用命令
```bash
# 一键检测源码编译与运行环境（Node.js / npm / Rust / WebView2）
npm run check:env

# 安装依赖
npm install

# 开发模式运行
npm run tauri dev

# 运行测试
npm test
cargo test --manifest-path src-tauri/Cargo.toml

# 编译不带安装器的 exe（输出在 src-tauri/target/release/desk-sticky.exe）
# 该文件不负责安装 WebView2
npm run tauri build -- --no-bundle

# 编译标准安装包（输出在 src-tauri/target/release/bundle/）
# 缺少 WebView2 时，安装器需要联网下载运行时
npm run tauri build
```

## 数据存储位置

个人待办与设置保存在本地应用数据目录，不会包含在可执行文件或源码中：
`%APPDATA%\com.desksticky.app\`
