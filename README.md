# DeskSticky 桌面便利贴

基于 **Tauri v2 + React + TypeScript + Rust (Win32)** 开发的 Windows 轻量级桌面便利贴工具。数据只留在本机，没有远程服务。

> **重要提示（给直接下载使用的用户）**：
> - 从 **Releases** 下载编译好的 `.exe` / 安装包使用时，**电脑上无需安装 Node.js 或 Rust**（界面已静态打包内嵌在程序内）。
> - 程序仅依赖 Windows 10/11 系统自带的 **WebView2 Runtime**；如果部分旧版 Win10 缺少该组件，启动时会自动弹出中文检测提示并可一键跳转微软官方下载（使用标准安装包 `.exe`/`.msi` 则会自动静默安装）。

## 主要功能

- **液态玻璃圆角卡片 + 3D 倾斜**：无原生边框。窗口有光斑、细亮边和一道扫光。背景不透明度从 0 到 100：0 时淡罩和光斑几乎看不见，100 时淡罩大约盖住六成，光斑到最满。待办卡片保持实底，方便读字。界面不再提供磨砂玻璃；旧设置里的 `blurMode` 仍能读入，打开后按液态玻璃画。
- **待办管理与无限循环滚动**：固定窗口大小，支持回车快速添加、`Shift+Enter` 换行、双击或按钮行内编辑、删除后撤销、完成时撒花，以及首尾衔接的无限滚动（隐藏滚动条）。系统开启减少动效时，不做倾斜追随、扫光和撒花。
- **密码锁**：可设置、修改或清除密码。保存的是本地 SHA-256 哈希，只用于界面遮罩，待办文件仍是明文。密码至少 4 位。锁定会等设置保存成功后才生效。
- **贴边自动收起与多屏适配**：
  - 停靠在屏幕右边缘时，鼠标离开会收成侧边细条，移入或点击后再展开。
  - 可在多显示器之间拖动，并跟随 DPI 缩放。窗口中心不在任何屏幕上时，会拉回工作区并展开。
  - 支持 `Win+D` 显示桌面后保持可见、系统托盘驻留、单实例、开机自启，以及浅色、深色或跟随系统的主题。

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

单独打开 Vite 的 `http://localhost:1420` 看不到桌面窗口。页面里的 Tauri 调用不存在，会停在加载失败。

## 数据存储位置

个人待办与设置保存在本地应用数据目录，不会包含在可执行文件或源码中：
`%APPDATA%\com.desksticky.app\`

其中 `todos.json` 是待办，`settings.json` 是窗口和外观设置。文件缺失或为空时使用默认值；文件损坏时不会用默认内容覆盖原文件。
