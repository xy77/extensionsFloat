# One-time Windows installer for the Float Native Messaging host.
# UTF-8 WITH BOM is required by Windows PowerShell 5.1 for Chinese text.
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
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Write-Utf8File {
  param([string]$Path, [string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

if ($Uninstall) {
  & reg.exe delete $RegKey /f 2>$null | Out-Null
  foreach ($file in @($ManifestPath, $HostCmdPath, $EntryPath, $ConfigPath, $UpdaterCopyPath)) {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
  }
  Write-Host ''
  Write-Host 'Windows Native Host 已卸载（注册表项和生成的宿主文件已删除）。'
  Write-Host '插件目录本身没有改动，如需彻底删除请手动移除该目录。'
  return
}

# --- Sanity checks -----------------------------------------------------------
if (-not (Test-Path -LiteralPath (Join-Path $ExtensionDir 'manifest.json'))) {
  throw "没有在 $ExtensionDir 找到 manifest.json。请先把 zip 完整解压到一个独立目录，再运行本脚本。"
}
if (Test-Path -LiteralPath (Join-Path $ExtensionDir '.git')) {
  throw '检测到 .git 目录：请不要把 Chrome 的加载目录指向 Git 仓库，请重新解压到独立目录。'
}
if (-not (Test-Path -LiteralPath (Join-Path $ExtensionDir 'native-host\updater-windows.ps1'))) {
  throw '安装包缺少 native-host\updater-windows.ps1，请重新下载完整的 release zip。'
}
if ($HostDir -match '&') {
  Write-Warning "宿主目录路径包含 & 字符（$HostDir），少数 Chrome 版本可能无法正常启动 Native Host。若更新失败，请把 Windows 账户名中的 & 去掉后重试。"
}

# --- Extension ID ------------------------------------------------------------
Write-Host ''
Write-Host '请在 Chrome 打开 chrome://extensions，开启「开发者模式」，'
Write-Host '复制 float 扩展卡片上的 ID（32 位，只含 a-p 的字母）。'
while ($ExtensionId -notmatch '^[a-p]{32}$') {
  if ($ExtensionId) { Write-Host 'ID 格式不对，请重新复制粘贴。' -ForegroundColor Yellow }
  $ExtensionId = ([string](Read-Host 'Extension ID')).Trim()
}

# --- Generated host files (outside the extension dir, so updates never touch them) ---
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

# --- Smoke test: send a real native "ping" message through the whole chain ----
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
    return $false
  } finally {
    foreach ($file in @($inFile, $outFile)) {
      try { Remove-Item -LiteralPath $file -Force } catch { }
    }
  }
}

Write-Host ''
Write-Host '安装完成。'
Write-Host "  插件目录 : $ExtensionDir"
Write-Host "  宿主文件 : $HostDir"
Write-Host "  注册表   : $RegKey"
Write-Host "  扩展 ID  : $ExtensionId"
Write-Host ''
if (Test-NativeHost) {
  Write-Host 'Native Host 自检通过（ping -> pong）。' -ForegroundColor Green
} else {
  Write-Warning 'Native Host 自检没有通过。安装文件已写好，但请在 Chrome 里点一次「检查更新」确认；若提示 host 不可用，重启 Chrome 后再试。'
}
Write-Host ''
Write-Host '以后在这台电脑上更新插件，只需右键页面上的悬浮按钮 →「检查更新」→「立即更新」。'
