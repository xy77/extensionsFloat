# One-time Windows installer for the Float Native Messaging host.
# UTF-8 WITH BOM is required by Windows PowerShell 5.1 for Chinese text.
# IMPORTANT: run this script WITHOUT -NonInteractive, otherwise Read-Host
# throws "Windows PowerShell is in NonInteractive mode" before asking for ID.
# Usage (double click install-windows.cmd, or):
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1 <EXTENSION_ID>
#   powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Uninstall
param(
  [string]$ExtensionId = '',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$HostName = 'com.float.extension_updater'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExtensionDir = (Resolve-Path -LiteralPath (Join-Path $ScriptDir '..')).Path
$HostDir = Join-Path $env:LOCALAPPDATA 'FloatExtension'
$RegKey = "HKCU\Software\Google\Chrome\NativeMessagingHosts\$HostName"
$ManifestPath = Join-Path $HostDir "$HostName.json"
$HostCmdPath = Join-Path $HostDir 'float-updater-host.cmd'
$EntryPath = Join-Path $HostDir 'float-updater-entry.ps1'
$ConfigPath = Join-Path $HostDir 'config.json'
$UpdaterCopyPath = Join-Path $HostDir 'updater-windows.ps1'
$InstallLog = Join-Path $env:TEMP 'float-install-windows.log'

# New-Object also works on PowerShell 2.0; the ::new() syntax needs 5.0+.
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false

function Write-Utf8File {
  param([string]$Path, [string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Write-InstallLog {
  param([string]$Text)
  try {
    $line = '[{0}] {1}' -f (Get-Date).ToString('o'), $Text
    [System.IO.File]::AppendAllText($InstallLog, $line + [Environment]::NewLine, $Utf8NoBom)
  } catch { }
}

function Invoke-Uninstall {
  & reg.exe delete $RegKey /f 2>$null | Out-Null
  foreach ($file in @($ManifestPath, $HostCmdPath, $EntryPath, $ConfigPath, $UpdaterCopyPath)) {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
  }
  Write-Host ''
  Write-Host 'Windows Native Host 已卸载（注册表项和生成的宿主文件已删除）。'
  Write-Host '插件目录本身没有改动，如需彻底删除请手动移除该目录。'
}

function Test-NativeHost {
  $inFile = Join-Path $env:TEMP ("float-host-ping-$PID.bin")
  $outFile = Join-Path $env:TEMP ("float-host-pong-$PID.bin")
  try {
    $body = [System.Text.Encoding]::UTF8.GetBytes('{"command":"ping"}')
    $header = [BitConverter]::GetBytes([uint32]$body.Length)
    $request = New-Object 'byte[]' ($header.Length + $body.Length)
    [System.Array]::Copy($header, 0, $request, 0, 4)
    [System.Array]::Copy($body, 0, $request, 4, $body.Length)
    [System.IO.File]::WriteAllBytes($inFile, $request)

    $cmdArgs = '/c "' + $HostCmdPath + '"'
    $null = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\cmd.exe') `
      -ArgumentList $cmdArgs -RedirectStandardInput $inFile -RedirectStandardOutput $outFile `
      -NoNewWindow -Wait -PassThru

    if (-not (Test-Path -LiteralPath $outFile)) { return $false }
    $raw = [System.IO.File]::ReadAllBytes($outFile)
    if ($raw.Length -lt 6) { return $false }
    $length = [int][BitConverter]::ToUInt32($raw, 0)
    if ($length -gt ($raw.Length - 4)) { return $false }
    $text = [System.Text.Encoding]::UTF8.GetString($raw, 4, $length)
    $response = $text | ConvertFrom-Json
    return ($response.ok -eq $true -and $response.message -eq 'pong')
  } catch {
    Write-InstallLog ('Self-test exception: ' + $_.Exception.Message)
    return $false
  } finally {
    foreach ($file in @($inFile, $outFile)) {
      try { Remove-Item -LiteralPath $file -Force } catch { }
    }
  }
}

function Invoke-Install {
  Write-Host ''
  Write-Host '================================================'
  Write-Host ' Float 插件 - Windows Native Host 安装'
  Write-Host '================================================'
  Write-Host "插件目录   : $ExtensionDir"
  Write-Host "宿主目录   : $HostDir"
  Write-Host "PowerShell : $($PSVersionTable.PSVersion)"
  Write-Host ''
  Write-InstallLog "Extension dir: $ExtensionDir"

  # --- 1) Ask for the ID first: double clicking must always be interactive ---
  Write-Host '请在 Chrome 打开 chrome://extensions，开启「开发者模式」，'
  Write-Host '复制 float 扩展卡片上的 ID（32 位，只含 a-p 的字母），粘贴到下面。'
  while ($ExtensionId -notmatch '^[a-p]{32}$') {
    if ($ExtensionId) { Write-Host 'ID 格式不对，请重新复制粘贴。' -ForegroundColor Yellow }
    $ExtensionId = ([string](Read-Host 'Extension ID')).Trim()
  }
  Write-Host ''
  Write-InstallLog "Extension ID: $ExtensionId"

  # --- 2) Checks come AFTER the prompt, with actionable messages -------------
  if (-not (Test-Path -LiteralPath (Join-Path $ExtensionDir 'manifest.json'))) {
    throw "没有在插件目录找到 manifest.json。当前识别到的插件目录是：$ExtensionDir`n请把 release zip 完整解压到一个独立目录，确认 manifest.json 在第一层，再运行该目录里的 scripts\install-windows.cmd。"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $ExtensionDir 'native-host\updater-windows.ps1'))) {
    throw "安装包缺少 native-host\updater-windows.ps1。当前插件目录：$ExtensionDir`n说明这个包不是带 Windows 支持的新版。请下载 v1.0.24 及以后的 extension-v*.zip 重新解压，或把新版仓库里的 native-host\updater-windows.ps1 复制到这个目录。"
  }
  if (Test-Path -LiteralPath (Join-Path $ExtensionDir '.git')) {
    Write-Warning '当前插件目录同时是 Git 仓库：可以继续安装，更新时也会保留 .git，但「立即更新」会覆盖这个目录里的工作区文件。建议改用独立解压目录。'
    Write-InstallLog 'Warning: extension dir is a git worktree'
  }
  if ($HostDir -match '&') {
    Write-Warning "宿主目录路径包含 & 字符（$HostDir），少数 Chrome 版本可能无法正常启动 Native Host。若更新失败，请改用不含 & 的 Windows 账户名。"
  }

  # --- 3) Generated host files (outside the extension dir) -------------------
  $null = [System.IO.Directory]::CreateDirectory($HostDir)
  Write-Utf8File $ConfigPath (@{ extensionDir = $ExtensionDir } | ConvertTo-Json -Compress)

  $entryScript = @'
$ErrorActionPreference = 'Stop'
try {
  $cfg = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $source = Join-Path ([string]$cfg.extensionDir) 'native-host\updater-windows.ps1'
  $localCopy = Join-Path $PSScriptRoot 'updater-windows.ps1'
  Copy-Item -LiteralPath $source -Destination $localCopy -Force
} catch { }
$localCopy = Join-Path $PSScriptRoot 'updater-windows.ps1'
if (Test-Path -LiteralPath $localCopy) {
  $null = & $localCopy -ConfigPath (Join-Path $PSScriptRoot 'config.json')
}
'@
  Write-Utf8File $EntryPath ($entryScript + "`r`n")

  $hostCmd = '@echo off' + "`r`n" +
    '"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -File "%~dp0float-updater-entry.ps1"' + "`r`n"
  Write-Utf8File $HostCmdPath $hostCmd

  $hostManifest = @{
    name = $HostName
    description = 'Float extension updater'
    path = $HostCmdPath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
  } | ConvertTo-Json
  Write-Utf8File $ManifestPath ($hostManifest + "`r`n")

  & reg.exe add $RegKey /ve /t REG_SZ /d $ManifestPath /f | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '写入注册表失败，请确认当前 Windows 账户有 HKCU 写入权限。' }
  Write-InstallLog "Registry key written: $RegKey"

  # --- 4) Result + self-test --------------------------------------------------
  Write-Host '安装完成。'
  Write-Host "  插件目录 : $ExtensionDir"
  Write-Host "  宿主文件 : $HostDir"
  Write-Host "  注册表   : $RegKey"
  Write-Host "  扩展 ID  : $ExtensionId"
  Write-Host ''
  if (Test-NativeHost) {
    Write-Host 'Native Host 自检通过（ping -> pong）。' -ForegroundColor Green
    Write-InstallLog 'Self-test: OK'
  } else {
    Write-Warning 'Native Host 自检没有通过。安装文件已写好，请在 Chrome 里点一次「检查更新」确认；若提示 host 不可用，重启 Chrome 后再试。'
    Write-Host "updater 日志：$(Join-Path $env:TEMP 'float-updater-windows.log')" -ForegroundColor Yellow
    Write-InstallLog 'Self-test: FAILED'
  }
  Write-Host ''
  Write-Host '以后在这台电脑上更新插件，只需右键页面上的悬浮按钮 →「检查更新」→「立即更新」。'
}

try {
  Write-InstallLog '=== install-windows.ps1 started ==='
  if ($Uninstall) { Invoke-Uninstall } else { Invoke-Install }
  Write-InstallLog '=== finished ==='
} catch {
  $errorMessage = $_.Exception.Message
  Write-InstallLog ('ERROR: ' + $errorMessage)
  Write-Host ''
  Write-Host '安装失败：' -ForegroundColor Red
  Write-Host $errorMessage -ForegroundColor Red
  Write-Host ''
  Write-Host '请按顺序排查：' -ForegroundColor Yellow
  Write-Host '  1. install-windows.cmd 和 install-windows.ps1 必须都在插件目录的 scripts\ 下'
  Write-Host '  2. 插件目录第一层要有 manifest.json，且 native-host\updater-windows.ps1 存在'
  Write-Host '  3. 解压的必须是 v1.0.24 及以后的 release zip（v1.0.23 及更早的 Windows 脚本有问题）'
  Write-Host '  4. 右键 install-windows.cmd → 属性 → 勾选「解除锁定」→ 应用，再双击'
  Write-Host ''
  Write-Host "安装日志：$InstallLog" -ForegroundColor Yellow
  Write-Host '如果仍报错，请把这个窗口里的文字截图发给我。'
  exit 1
}
