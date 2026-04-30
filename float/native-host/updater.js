#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const HOST_VERSION = '1.0.0';
const PRESERVE_PATHS = [
  '.env',
  'config.local.json',
  'data',
  'logs',
  'native-host/config.json',
  'native-host/node-bin'
];
const BACKUP_DIR_NAME = 'backups';

function writeNativeMessage(message, exitAfterWrite = false) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]), () => {
    if (exitAfterWrite) {
      process.exit(0);
    }
  });
}

function updaterError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseSemver(version) {
  const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw updaterError('INVALID_VERSION', `版本号不是 semver：${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return 0;
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch (_) {
    return false;
  }
}

async function assertDirectory(target, code, message) {
  let stat;
  try {
    stat = await fsp.stat(target);
  } catch (_) {
    throw updaterError(code, message);
  }

  if (!stat.isDirectory()) {
    throw updaterError(code, message);
  }
}

async function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');

  if (!(await pathExists(configPath))) {
    return {};
  }

  try {
    return JSON.parse(await fsp.readFile(configPath, 'utf8'));
  } catch (error) {
    throw updaterError('CONFIG_INVALID', `Native Host 配置文件无法读取：${error.message}`);
  }
}

function normalizeExtensionDir(extensionDir) {
  const normalized = String(extensionDir || '').trim();

  if (!normalized) {
    throw updaterError('EXTENSION_DIR_MISSING', '缺少 extensionDir，请重新安装 Native Host。');
  }

  if (!path.isAbsolute(normalized)) {
    throw updaterError('EXTENSION_DIR_INVALID', 'extensionDir 必须是绝对路径。');
  }

  return path.resolve(normalized);
}

function validateDownloadUrl(downloadUrl) {
  let url;

  try {
    url = new URL(downloadUrl);
  } catch (_) {
    throw updaterError('DOWNLOAD_URL_INVALID', 'downloadUrl 不是有效 URL。');
  }

  if (url.protocol !== 'https:') {
    throw updaterError('DOWNLOAD_URL_INVALID', 'downloadUrl 必须使用 HTTPS。');
  }

  return url;
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(updaterError('DOWNLOAD_FAILED', '下载重定向次数过多。'));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, {
      headers: {
        'User-Agent': 'float-extension-updater'
      }
    }, (response) => {
      const statusCode = response.statusCode || 0;

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url);
        downloadFile(nextUrl, destination, redirects + 1).then(resolve, reject);
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(updaterError('DOWNLOAD_FAILED', `下载失败：HTTP ${statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', async (error) => {
        response.destroy();
        await fsp.rm(destination, { force: true }).catch(() => {});
        reject(updaterError('DOWNLOAD_FAILED', `写入下载文件失败：${error.message}`));
      });
    });

    request.on('error', (error) => {
      reject(updaterError('DOWNLOAD_FAILED', `下载失败：${error.message}`));
    });
  });
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', error => reject(updaterError('HASH_FAILED', `计算 sha256 失败：${error.message}`)));
  });
}

function runCommand(command, args, errorCode) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      reject(updaterError(errorCode, `${command} 启动失败：${error.message}`));
    });

    child.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(updaterError(errorCode, `${command} 执行失败：${stderr.trim() || `exit ${code}`}`));
    });
  });
}

async function extractZip(zipPath, destination) {
  await fsp.mkdir(destination, { recursive: true });

  if (await pathExists('/usr/bin/ditto')) {
    await runCommand('/usr/bin/ditto', ['-x', '-k', zipPath, destination], 'UNZIP_FAILED');
    return;
  }

  await runCommand('unzip', ['-q', zipPath, '-d', destination], 'UNZIP_FAILED');
}

async function findManifestRoot(root) {
  const directManifest = path.join(root, 'manifest.json');
  if (await pathExists(directManifest)) return root;

  const entries = await fsp.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (await pathExists(path.join(candidate, 'manifest.json'))) {
      return candidate;
    }
  }

  throw updaterError('PACKAGE_INVALID', '更新包中没有找到 manifest.json。');
}

async function validatePackage(packageRoot, latestVersion) {
  let manifest;

  try {
    manifest = JSON.parse(await fsp.readFile(path.join(packageRoot, 'manifest.json'), 'utf8'));
  } catch (error) {
    throw updaterError('PACKAGE_INVALID', `manifest.json 无法读取：${error.message}`);
  }

  if (String(manifest.version || '').trim() !== String(latestVersion || '').trim()) {
    throw updaterError('VERSION_MISMATCH', `更新包版本 ${manifest.version || '(empty)'} 与 latest.json ${latestVersion} 不一致。`);
  }
}

function shouldPreserve(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return PRESERVE_PATHS.some(item => normalized === item || normalized.startsWith(`${item}/`));
}

async function copyEntry(source, destination, shouldSkip) {
  const relativePath = shouldSkip.relative || '';
  if (relativePath && shouldSkip(relativePath)) return;

  const stat = await fsp.lstat(source);

  if (stat.isDirectory()) {
    await fsp.mkdir(destination, { recursive: true });
    const entries = await fsp.readdir(source);

    for (const entry of entries) {
      const childRelative = relativePath ? path.join(relativePath, entry) : entry;
      await copyEntry(
        path.join(source, entry),
        path.join(destination, entry),
        Object.assign(shouldSkip, { relative: childRelative })
      );
    }
    return;
  }

  if (stat.isSymbolicLink()) {
    const link = await fsp.readlink(source);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.symlink(link, destination);
    return;
  }

  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.copyFile(source, destination);
  await fsp.chmod(destination, stat.mode);
}

async function copyDirectoryContents(sourceDir, destinationDir, shouldSkip = () => false) {
  await fsp.mkdir(destinationDir, { recursive: true });
  const entries = await fsp.readdir(sourceDir);

  for (const entry of entries) {
    const skip = (relativePath) => shouldSkip(relativePath);
    skip.relative = entry;
    await copyEntry(path.join(sourceDir, entry), path.join(destinationDir, entry), skip);
  }
}

async function removeDirectoryContents(targetDir, keepTopLevel = []) {
  const keep = new Set(keepTopLevel);
  const entries = await fsp.readdir(targetDir);

  for (const entry of entries) {
    if (keep.has(entry)) continue;
    await fsp.rm(path.join(targetDir, entry), {
      recursive: true,
      force: true
    });
  }
}

async function copyPreservedEntries(extensionDir, preservedDir) {
  for (const item of PRESERVE_PATHS) {
    const source = path.join(extensionDir, item);
    if (!(await pathExists(source))) continue;
    await copyEntry(source, path.join(preservedDir, item), () => false);
  }
}

async function restorePreservedEntries(preservedDir, extensionDir) {
  if (!(await pathExists(preservedDir))) return;
  await copyDirectoryContents(preservedDir, extensionDir);
}

async function createBackup(extensionDir) {
  const backupRoot = path.join(extensionDir, BACKUP_DIR_NAME);
  const backupDir = path.join(backupRoot, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);

  await fsp.mkdir(backupDir, { recursive: true });
  await copyDirectoryContents(extensionDir, backupDir, relativePath => relativePath.split(path.sep)[0] === BACKUP_DIR_NAME);
  return backupDir;
}

async function rollback(extensionDir, backupDir) {
  if (!backupDir || !(await pathExists(backupDir))) return;
  await removeDirectoryContents(extensionDir, [BACKUP_DIR_NAME]);
  await copyDirectoryContents(backupDir, extensionDir);
}

async function handleCheck(payload) {
  const config = await loadConfig();
  const extensionDir = normalizeExtensionDir(payload.extensionDir || config.extensionDir);
  await assertDirectory(extensionDir, 'EXTENSION_DIR_INVALID', 'extensionDir 不存在或不是目录。');

  return {
    ok: true,
    hostVersion: HOST_VERSION,
    platform: process.platform,
    extensionDir,
    message: 'ready'
  };
}

async function handleUpdate(payload) {
  const config = await loadConfig();
  const currentVersion = String(payload.currentVersion || '').trim();
  const latestVersion = String(payload.latestVersion || '').trim().replace(/^v/, '');
  const extensionDir = normalizeExtensionDir(payload.extensionDir || config.extensionDir);
  const downloadUrl = validateDownloadUrl(payload.downloadUrl);
  const sha256 = String(payload.sha256 || '').trim().toLowerCase();

  if (compareSemver(latestVersion, currentVersion) <= 0) {
    throw updaterError('ALREADY_UP_TO_DATE', '当前已经是最新版本。');
  }

  if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) {
    throw updaterError('HASH_INVALID', 'sha256 格式不正确。');
  }

  await assertDirectory(extensionDir, 'EXTENSION_DIR_INVALID', 'extensionDir 不存在或不是目录。');

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'float-updater-'));
  const zipPath = path.join(tempDir, `extension-v${latestVersion}.zip`);
  const extractedDir = path.join(tempDir, 'extracted');
  const preservedDir = path.join(tempDir, 'preserved');
  let backupDir = '';

  try {
    await downloadFile(downloadUrl, zipPath);

    if (sha256) {
      const actualHash = await hashFile(zipPath);
      if (actualHash !== sha256) {
        throw updaterError('HASH_MISMATCH', '下载包 sha256 校验失败。');
      }
    }

    await extractZip(zipPath, extractedDir);
    const packageRoot = await findManifestRoot(extractedDir);
    await validatePackage(packageRoot, latestVersion);

    backupDir = await createBackup(extensionDir);
    await copyPreservedEntries(extensionDir, preservedDir);
    await removeDirectoryContents(extensionDir, [BACKUP_DIR_NAME]);
    await copyDirectoryContents(packageRoot, extensionDir, shouldPreserve);
    await restorePreservedEntries(preservedDir, extensionDir);

    return {
      ok: true,
      version: latestVersion,
      backupDir,
      message: 'updated'
    };
  } catch (error) {
    if (backupDir) {
      await rollback(extensionDir, backupDir).catch(rollbackError => {
        throw updaterError('ROLLBACK_FAILED', `${error.message}; 回滚失败：${rollbackError.message}`);
      });
    }
    throw error;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleMessage(message) {
  const command = message && message.command;

  if (command === 'ping') {
    return {
      ok: true,
      hostVersion: HOST_VERSION,
      message: 'pong'
    };
  }

  if (command === 'check') {
    return handleCheck(message || {});
  }

  if (command === 'update') {
    return handleUpdate(message || {});
  }

  throw updaterError('UNKNOWN_COMMAND', `未知命令：${command || '(empty)'}`);
}

function readNativeMessages(onMessage) {
  let buffer = Buffer.alloc(0);

  process.stdin.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (buffer.length < length + 4) return;

      const body = buffer.slice(4, 4 + length);
      buffer = buffer.slice(4 + length);

      let message;
      try {
        message = JSON.parse(body.toString('utf8'));
      } catch (error) {
        writeNativeMessage({
          ok: false,
          code: 'INVALID_JSON',
          message: `Native message JSON 无效：${error.message}`
        }, true);
        continue;
      }

      onMessage(message);
    }
  });
}

readNativeMessages(async (message) => {
  try {
    writeNativeMessage(await handleMessage(message), true);
  } catch (error) {
    writeNativeMessage({
      ok: false,
      code: error.code || 'UPDATE_FAILED',
      message: error.message || String(error)
    }, true);
  }
});
