$ErrorActionPreference = "Stop"

Write-Host "=== DeskSticky 开发与运行环境检测 ===" -ForegroundColor Cyan
Write-Host "提示：普通用户直接运行 Release 中的 desk-sticky.exe 无需安装 Node.js 或 Rust，仅需 WebView2 Runtime。" -ForegroundColor DarkGray
Write-Host ""

$missingRequired = $false

# 1. Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeVerRaw = (& node -v).Trim()
    $major = 0
    if ($nodeVerRaw -match '^v(\d+)') {
        $major = [int]$Matches[1]
    }
    if ($major -ge 18) {
        Write-Host "[OK] Node.js: $nodeVerRaw (源码构建需 >= 18)" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Node.js 版本过低: $nodeVerRaw (建议升级到 Node.js 18+)" -ForegroundColor Yellow
        $missingRequired = $true
    }
} else {
    Write-Host "[MISS] 未检测到 Node.js (仅从源码编译时需要，下载地址: https://nodejs.org/)" -ForegroundColor Red
    $missingRequired = $true
}

# 2. npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCmd) {
    $npmVer = (& npm -v).Trim()
    Write-Host "[OK] npm: v$npmVer" -ForegroundColor Green
} else {
    Write-Host "[MISS] 未检测到 npm" -ForegroundColor Red
    $missingRequired = $true
}

# 3. Rust / Cargo
$rustcCmd = Get-Command rustc -ErrorAction SilentlyContinue
$cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if ($rustcCmd -and $cargoCmd) {
    $rustcVer = (& rustc --version).Trim()
    Write-Host "[OK] Rust: $rustcVer" -ForegroundColor Green
} else {
    Write-Host "[MISS] 未检测到 Rust/Cargo (仅从源码编译时需要，安装地址: https://rustup.rs/)" -ForegroundColor Red
    $missingRequired = $true
}

# 4. Microsoft Edge WebView2 Runtime
$wv2Paths = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
)

$wv2Ver = $null
foreach ($path in $wv2Paths) {
    if (Test-Path $path) {
        $pv = (Get-ItemProperty -Path $path -Name "pv" -ErrorAction SilentlyContinue).pv
        if ($pv -and $pv.Trim() -ne "" -and $pv.Trim() -ne "0.0.0.0") {
            $wv2Ver = $pv.Trim()
            break
        }
    }
}

if ($wv2Ver) {
    Write-Host "[OK] WebView2 Runtime: $wv2Ver (运行桌面界面必需)" -ForegroundColor Green
} else {
    Write-Host "[MISS] 未检测到 Microsoft Edge WebView2 Runtime (下载安装: https://go.microsoft.com/fwlink/p/?LinkId=2124703)" -ForegroundColor Red
    $missingRequired = $true
}

Write-Host ""
if ($missingRequired) {
    Write-Host "检测未通过：请先补全上述缺失项后再进行源码构建或运行。" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "全部环境检测通过，可正常运行与构建 DeskSticky。" -ForegroundColor Green
    exit 0
}
