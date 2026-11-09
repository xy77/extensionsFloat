# Float extension Native Messaging host / updater for Windows.
# Started by %LOCALAPPDATA%\FloatExtension\float-updater-host.cmd
# Protocol: 4-byte little-endian length + UTF-8 JSON on stdin/stdout.
# NOTE: This file is saved as UTF-8 WITH BOM on purpose: Windows PowerShell 5.1
# reads BOM-less .ps1 files as ANSI, which would garble the Chinese messages.
# Nothing may ever be written to stdout except native messages. Logs go to
# stderr and to %TEMP%\float-updater-windows.log.
[CmdletBinding()]
param(
  [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:HostVersion = '1.1.0-windows'
$script:BackupDirName = 'backups'
$script:PreservePaths = @('.env', 'config.local.json', 'data', 'logs', 'native-host/config.json')
$script:LogPath = Join-Path $env:TEMP 'float-updater-windows.log'
$script:Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$script:Utf8 = [System.Text.Encoding]::UTF8
$script:StdinStream = $null
$script:StdoutStream = $null
$script:ConfigFile = ''
$script:BackupDir = ''
$script:RollbackTarget = ''

function Write-Log {
  param([string]$Text)
  try {
    $line = '[{0}] {1}' -f (Get-Date).ToUniversalTime().ToString('o'), $Text
    [System.IO.File]::AppendAllText($script:LogPath, $line + [Environment]::NewLine, $script:Utf8NoBom)
  } catch { }
  try { [Console]::Error.WriteLine('[float-updater] ' + $Text) } catch { }
}

function Send-NativeMessage {
  param([hashtable]$Payload)
  $json = $Payload | ConvertTo-Json -Compress -Depth 6
  $body = $script:Utf8.GetBytes($json)
  $header = [BitConverter]::GetBytes([uint32]$body.Length)
  $script:StdoutStream.Write($header, 0, 4)
  $script:StdoutStream.Write($body, 0, $body.Length)
  $script:StdoutStream.Flush()
}

function Invoke-Rollback {
  try {
    if (-not $script:BackupDir -or -not (Test-Path -LiteralPath $script:BackupDir)) { return $true }
    Clear-DirectoryContents $script:RollbackTarget
    Copy-DirectoryContents -Source $script:BackupDir -Destination $script:RollbackTarget
    return $true
  } catch {
    Write-Log ('Rollback failed: ' + $_.Exception.Message)
    return $false
  }
}

function Fail {
  param([string]$Code, [string]$Message, [switch]$Rollback)
  $text = $Message
  $finalCode = $Code
  if ($Rollback -and $script:BackupDir -and (Test-Path -LiteralPath $script:BackupDir)) {
    if (Invoke-Rollback) {
      $text = $Message + ' 已自动回滚。'
    } else {
      $text = $Message + '；回滚失败。'
      $finalCode = 'ROLLBACK_FAILED'
    }
  }
  Write-Log ("FAIL $finalCode : $text")
  Send-NativeMessage @{ ok = $false; code = $finalCode; message = $text }
  exit 0
}

function Read-NativeMessage {
  $header = New-Object 'byte[]' 4
  $offset = 0
  while ($offset -lt 4) {
    $read = $script:StdinStream.Read($header, $offset, 4 - $offset)
    if ($read -le 0) { throw 'stdin closed before the message header was read' }
    $offset += $read
  }

  $length = [BitConverter]::ToUInt32($header, 0)
  if ($length -eq 0 -or $length -gt 1048576) { Fail 'INVALID_NATIVE_MESSAGE' 'Native message 长度无效。' }

  $count = [int]$length
  $body = New-Object 'byte[]' $count
  $offset = 0
  while ($offset -lt $count) {
    $read = $script:StdinStream.Read($body, $offset, $count - $offset)
    if ($read -le 0) { throw 'stdin closed before the message body was read' }
    $offset += $read
  }

  $json = $script:Utf8.GetString($body)
  return ($json | ConvertFrom-Json)
}

function Get-ExtensionDir {
  param([string]$FromMessage)
  $dir = $FromMessage

  if (-not $dir -and $script:ConfigFile -and (Test-Path -LiteralPath $script:ConfigFile)) {
    $cfg = Get-Content -LiteralPath $script:ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $dir = [string]$cfg.extensionDir
  }

  if (-not $dir) { Fail 'EXTENSION_DIR_MISSING' '缺少 extensionDir，请重新运行 Windows 安装脚本。' }
  if (-not [System.IO.Path]::IsPathRooted($dir)) { Fail 'EXTENSION_DIR_INVALID' 'extensionDir 必须是绝对路径。' }
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { Fail 'EXTENSION_DIR_INVALID' 'extensionDir 不存在或不是目录。' }
  if (Test-Path -LiteralPath (Join-Path $dir '.git')) {
    # Installation warns about this, but does not block it. Never delete .git:
    # it may hold the user's only copy of repository history.
    Write-Log 'Warning: extensionDir is a git worktree; .git will be preserved.'
  }

  return (Resolve-Path -LiteralPath $dir).Path
}

function Compare-Semver {
  param([string]$Left, [string]$Right)
  $l = (([string]$Left) -replace '^v', '') -replace '[-+].*$', ''
  $r = (([string]$Right) -replace '^v', '') -replace '[-+].*$', ''
  $lm = [regex]::Match($l, '^(\d+)\.(\d+)\.(\d+)$')
  $rm = [regex]::Match($r, '^(\d+)\.(\d+)\.(\d+)$')

  if (-not $lm.Success) { Fail 'INVALID_VERSION' "版本号不是 semver：$Left" }
  if (-not $rm.Success) { Fail 'INVALID_VERSION' "版本号不是 semver：$Right" }
  $la = @([int]$lm.Groups[1].Value, [int]$lm.Groups[2].Value, [int]$lm.Groups[3].Value)
  $ra = @([int]$rm.Groups[1].Value, [int]$rm.Groups[2].Value, [int]$rm.Groups[3].Value)

  for ($i = 0; $i -lt 3; $i++) {
    if ($la[$i] -gt $ra[$i]) { return 1 }
    if ($la[$i] -lt $ra[$i]) { return -1 }
  }
  return 0
}

function Clear-DirectoryContents {
  param([string]$Path)
  Get-ChildItem -LiteralPath $Path -Force |
    Where-Object { $_.Name -ne $script:BackupDirName -and $_.Name -ne '.git' } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
}

function Copy-DirectoryContents {
  param([string]$Source, [string]$Destination, [string[]]$ExcludeNames = @())
  if (-not (Test-Path -LiteralPath $Destination)) {
    $null = [System.IO.Directory]::CreateDirectory($Destination)
  }
  Get-ChildItem -LiteralPath $Source -Force | Where-Object { $ExcludeNames -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

function Save-PreservedEntries {
  param([string]$ExtensionDir, [string]$PreservedDir)
  foreach ($relative in $script:PreservePaths) {
    $source = Join-Path $ExtensionDir $relative
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $destination = Join-Path $PreservedDir $relative
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent)) {
      $null = [System.IO.Directory]::CreateDirectory($parent)
    }
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
  }
}

function Restore-PreservedEntries {
  param([string]$PreservedDir, [string]$ExtensionDir)
  foreach ($relative in $script:PreservePaths) {
    $source = Join-Path $PreservedDir $relative
    if (-not (Test-Path -LiteralPath $source)) { continue }
    $destination = Join-Path $ExtensionDir $relative
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent)) {
      $null = [System.IO.Directory]::CreateDirectory($parent)
    }
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
  }
}

function Download-Zip {
  param([string]$Url, [string]$Target)
  $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
  if (Test-Path -LiteralPath $curl) {
    & $curl -fL --retry 2 --connect-timeout 20 --max-time 300 -A 'float-extension-updater' -o $Target $Url 2>$null
    if ($LASTEXITCODE -ne 0) { Fail 'DOWNLOAD_FAILED' '下载失败：请检查网络，以及 GitHub Release 是否可匿名访问。' }
  } else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Url -OutFile $Target -UseBasicParsing -TimeoutSec 300
  }
  if (-not (Test-Path -LiteralPath $Target)) { Fail 'DOWNLOAD_FAILED' '下载失败：没有生成更新包文件。' }
}

function Get-PackageRoot {
  param([string]$ExtractedDir)
  if (Test-Path -LiteralPath (Join-Path $ExtractedDir 'manifest.json')) { return $ExtractedDir }

  $candidate = Get-ChildItem -LiteralPath $ExtractedDir -Directory | ForEach-Object {
    $candidateManifest = Join-Path $_.FullName 'manifest.json'
    if (Test-Path -LiteralPath $candidateManifest) { $candidateManifest }
  } | Select-Object -First 1

  if (-not $candidate) { Fail 'PACKAGE_INVALID' '更新包中没有找到 manifest.json。' }
  return (Split-Path -Parent $candidate)
}

function Invoke-Check {
  param($Message)
  $dir = Get-ExtensionDir ([string]$Message.extensionDir)
  Write-Log ("check ok: $dir")
  Send-NativeMessage @{
    ok = $true
    hostVersion = $script:HostVersion
    platform = 'win32'
    extensionDir = $dir
    currentVersion = [string]$Message.currentVersion
    message = 'ready'
  }
}

function Invoke-Update {
  param($Message)

  $currentVersion = [string]$Message.currentVersion
  $latestVersion = ([string]$Message.latestVersion) -replace '^v', ''
  $downloadUrl = [string]$Message.downloadUrl
  $sha256 = ([string]$Message.sha256).ToLowerInvariant()
  $extensionDir = Get-ExtensionDir ([string]$Message.extensionDir)
  $script:RollbackTarget = $extensionDir

  if ((Compare-Semver $latestVersion $currentVersion) -le 0) {
    Fail 'ALREADY_UP_TO_DATE' '当前已经是最新版本。'
  }
  if ($downloadUrl -notmatch '^https://') { Fail 'DOWNLOAD_URL_INVALID' 'downloadUrl 必须使用 HTTPS。' }
  if ($sha256 -and $sha256 -notmatch '^[a-f0-9]{64}$') { Fail 'HASH_INVALID' 'sha256 格式不正确。' }

  $tempDir = Join-Path $env:TEMP ('float-updater-' + [guid]::NewGuid().ToString('N'))
  $null = [System.IO.Directory]::CreateDirectory($tempDir)
  $zipPath = Join-Path $tempDir ("extension-v$latestVersion.zip")
  $extractedDir = Join-Path $tempDir 'extracted'
  $preservedDir = Join-Path $tempDir 'preserved'

  try {
    Write-Log ("update $currentVersion -> $latestVersion from $downloadUrl")
    Download-Zip -Url $downloadUrl -Target $zipPath

    if ($sha256) {
      $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($actual -ne $sha256) { Fail 'HASH_MISMATCH' '下载包 sha256 校验失败。' }
    }

    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractedDir -Force
    $packageRoot = Get-PackageRoot $extractedDir

    $packageManifest = Get-Content -LiteralPath (Join-Path $packageRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$packageManifest.version -ne $latestVersion) {
      Fail 'VERSION_MISMATCH' "更新包版本 $($packageManifest.version) 与 latest.json $latestVersion 不一致。"
    }

    $backupRoot = Join-Path $extensionDir $script:BackupDirName
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ssZ')
    $script:BackupDir = Join-Path $backupRoot ("backup-$stamp-$PID")
    $null = [System.IO.Directory]::CreateDirectory($script:BackupDir)
    Copy-DirectoryContents -Source $extensionDir -Destination $script:BackupDir -ExcludeNames @($script:BackupDirName, '.git')

    Save-PreservedEntries -ExtensionDir $extensionDir -PreservedDir $preservedDir
    Clear-DirectoryContents $extensionDir
    Copy-DirectoryContents -Source $packageRoot -Destination $extensionDir
    Restore-PreservedEntries -PreservedDir $preservedDir -ExtensionDir $extensionDir

    Write-Log ("updated to $latestVersion, backup: $($script:BackupDir)")
    Send-NativeMessage @{
      ok = $true
      version = $latestVersion
      backupDir = $script:BackupDir
      message = 'updated'
    }
  } catch {
    Fail 'UPDATE_FAILED' ('更新失败：' + $_.Exception.Message) -Rollback
  } finally {
    try { Remove-Item -LiteralPath $tempDir -Recurse -Force } catch { }
  }
}

function Invoke-Main {
  # All output of this function is discarded so stray PowerShell output can
  # never corrupt the native messaging byte stream.
  if ($ConfigPath) {
    $script:ConfigFile = $ConfigPath
  } elseif (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'config.json')) {
    $script:ConfigFile = Join-Path $PSScriptRoot 'config.json'
  } else {
    $script:ConfigFile = Join-Path (Join-Path $env:LOCALAPPDATA 'FloatExtension') 'config.json'
  }

  try {
    $script:StdinStream = [Console]::OpenStandardInput()
    $script:StdoutStream = [Console]::OpenStandardOutput()
    $message = Read-NativeMessage
    $command = [string]$message.command
    Write-Log ("command: $command")

    switch ($command) {
      'ping' {
        Send-NativeMessage @{ ok = $true; hostVersion = $script:HostVersion; platform = 'win32'; message = 'pong' }
      }
      'check' { Invoke-Check $message }
      'update' { Invoke-Update $message }
      default { Fail 'UNKNOWN_COMMAND' "未知命令：$command" }
    }
  } catch {
    Fail 'NATIVE_HOST_ERROR' ('本机 updater 执行失败：' + $_.Exception.Message) -Rollback
  }
}

$null = Invoke-Main
