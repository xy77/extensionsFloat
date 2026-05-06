# Float Chrome Extension

Float 是一个私下分发的 Chrome unpacked extension。它不依赖 Chrome Web Store，更新通过插件内按钮触发，再由 Native Messaging 调用 macOS 本机 updater 完成下载、备份、替换和回滚。

## 项目结构

- `manifest.json`: Chrome extension manifest，当前版本号来自这里的 `version`。
- `content.js`: 悬浮按钮、玻璃态面板、编辑/预览/下载 UI，以及更新按钮 UI。
- `background.js`: 插件后台，负责检查更新和调用 Native Messaging host。
- `src/updater/checkUpdate.js`: 读取 GitHub latest Release 里的 `latest.json`，做 semver 比较。
- `src/updater/nativeHost.js`: 调用 `chrome.runtime.sendNativeMessage`。
- `native-host/updater-macos.sh`: 本机 updater，使用 macOS 自带工具执行下载、sha256 校验、解压、备份、替换、回滚。
- `scripts/install-native-host-macos.sh`: macOS Native Messaging host 安装脚本。
- `.github/workflows/release-extension.yml`: GitHub Actions 自动生成 release zip、`latest.json` 和 GitHub Release。
- `scripts/package-release.sh`: 本地手动生成 release zip 和 `latest.json`，通常不需要使用。

## 每台电脑首次安装

每一台使用插件的电脑只需要配置一次。朋友不需要 GitHub、GitHub Desktop、Node 或 Python。

重要：不要把 Chrome 加载目录指向 GitHub Desktop 管理的源码仓库。请使用一个独立、稳定的安装目录，例如 `~/Applications/float-extension`。后续 updater 会替换这个安装目录里的文件。

1. 下载你提供的初始安装 zip，或从 GitHub Release 下载 `extension-v<version>.zip`。
2. 解压到稳定目录，例如 `~/Applications/float-extension`。不要放在会被自动清理的位置。
3. 打开 Chrome，进入 `chrome://extensions`。
4. 开启 Developer mode。
5. 点击 Load unpacked，选择解压后的插件目录。
6. 在扩展卡片上复制 Extension ID。
7. 打开终端，进入插件安装目录：

```bash
cd ~/Applications/float-extension
```

8. 在插件安装目录运行一次 Native Host 安装脚本：

```bash
./scripts/install-native-host-macos.sh <EXTENSION_ID> "$(pwd)"
```

完成后，后续这个电脑上的版本更新都可以在插件面板里点击完成。

## 固定 Extension ID

Native Messaging 的 `allowed_origins` 必须写入准确的 Extension ID。

最简单的方式是：每台电脑第一次 Load unpacked 后复制 Chrome 显示的 Extension ID，然后运行安装脚本。只要插件目录不移动，这个 ID 通常保持稳定。

如果你希望所有朋友电脑上的 ID 完全一致，可以使用 Chrome 打包扩展生成私钥，再把对应的 public key 写入 `manifest.json` 的 `key` 字段。私钥 `.pem` 不要提交到仓库。之后朋友使用带同一个 `key` 的包加载，Extension ID 就会固定。

## 一键更新流程

1. 打开插件面板。
2. 面板顶部会显示当前版本。
3. 点击“检查更新”。
4. 插件从 GitHub 最新 Release 读取 `latest.json`。
5. 如果有新版本，会显示版本号、更新说明和“立即更新”按钮。
6. 点击“立即更新”后，插件通过 Native Messaging 调用本机 updater。
7. updater 会下载 `extension-v<version>.zip`，校验版本，按需校验 sha256，备份当前目录，替换文件并保留本地配置。
8. 更新成功后插件会自动 `chrome.runtime.reload()`。

如果自动 reload 后页面里的旧 content script 仍未完全刷新，请到 `chrome://extensions` 点击该扩展的刷新按钮，或刷新当前网页。

## 发布新版本

日常发布只需要 GitHub Desktop，不需要手动创建 GitHub Release，不需要手动上传 zip。

最少操作：

1. 修改 `manifest.json` 的 `version`，版本号使用 semver，例如从 `1.0.5` 改到 `1.0.6`。
2. 在 GitHub Desktop 里写 commit message，例如 `Release v1.0.6`。
3. 点击 Commit to main。
4. 点击 Push origin。

push 后 GitHub Actions 会自动：
   - 读取 `manifest.json` 的版本号
   - 创建 tag，例如 `v1.0.6`
   - 打包 `extension-v1.0.6.zip`
   - 生成 `latest.json`
   - 创建 GitHub Release
   - 上传 `extension-v1.0.6.zip` 和 `latest.json`

正常发布新版本时，不需要修改根目录 `latest.json`，也不需要运行 `scripts/package-release.sh`。根目录 `latest.json` 只用于旧版过渡；1.0.1 之后的插件默认读取 GitHub latest Release 的 `latest.json`。

如果当前版本的 tag 已经存在，Actions 会跳过发布，避免重复创建 Release。

发布进度可以在仓库的 Actions 页面查看：

```text
https://github.com/xy77/extensionsFloat/actions
```

默认插件读取最新 Release 里的 `latest.json`：

```text
https://github.com/xy77/extensionsFloat/releases/latest/download/latest.json
```

如果仓库名或路径改变，请修改 `src/updater/checkUpdate.js` 里的 `DEFAULT_LATEST_JSON_URL`。

`latest.json` 格式：

```json
{
  "version": "1.0.1",
  "downloadUrl": "https://github.com/xy77/extensionsFloat/releases/download/v1.0.1/extension-v1.0.1.zip",
  "sha256": "release zip sha256",
  "changelog": "更新说明"
}
```

`sha256` 可以为空，但推荐保留。只要 `latest.json` 提供了 `sha256`，updater 就必须校验通过才会替换文件。

## 已安装电脑如何更新

首次安装并配置 Native Host 后，后续更新只需要：

1. 打开插件面板。
2. 点击“检查更新”。
3. 看到新版本后点击“立即更新”。

如果“立即更新”不可点击，通常说明没有新版本，或 Native Host 不可用。先看面板里的提示文字，再参考下面的常见问题。

## 本地手动打包（可选）

正常情况下由 GitHub Actions 自动打包。如果需要在本机临时生成 zip，可以运行：

```bash
GITHUB_REPO=xy77/extensionsFloat ./scripts/package-release.sh
```

脚本会生成：

- `dist/extension-v<version>.zip`
- `dist/latest.json`
- `latest.json`

## 本地文件保留规则

更新时会保留这些本地文件和目录：

- `.env`
- `config.local.json`
- `data/`
- `logs/`
- `native-host/config.json`

备份会写入插件目录下的 `backups/`。发布包会排除 `.env`、`config.local.json`、`data/`、`logs/`、`backups/`、`native-host/config.json` 和 `node_modules/`。

## 常见问题

`本机 updater 还没有安装`

重新复制当前 Extension ID，然后运行：

```bash
./scripts/install-native-host-macos.sh <EXTENSION_ID> "$(pwd)"
```

`Native Host 已安装，但当前扩展 ID 没有被允许`

说明 Chrome 当前显示的 Extension ID 和 Native Host manifest 里的 `allowed_origins` 不一致。用当前 ID 重新运行安装脚本。

`发现新版本，但 updater 不可用：Native host has exited`

通常是 Native Host 启动失败，或当前 Chrome 加载的插件目录不适合自更新。先重新复制当前 Extension ID，在插件安装目录运行：

```bash
./scripts/install-native-host-macos.sh <EXTENSION_ID> "$(pwd)"
```

如果插件是从 GitHub Desktop 的源码仓库目录加载的，请改用独立安装目录，例如 `~/Applications/float-extension`，重新 Load unpacked 并重新安装 Native Host。updater 不应该直接替换 Git 仓库目录。

`extensionDir 不存在或不是目录`

插件目录被移动了。进入新的插件目录，重新运行安装脚本。

`下载失败`

确认 GitHub Release 是 public，`latest.json` 中的 `downloadUrl` 可以匿名访问。

`下载包 sha256 校验失败`

确认 GitHub Actions 生成的 Release asset 和 `latest.json` 是同一次发布。如果手动替换过 zip，重新改一个新版本号并用 GitHub Desktop push，让 Actions 重新发布。

`更新成功但界面没变化`

打开 `chrome://extensions`，点击扩展卡片上的刷新按钮，然后刷新当前网页。

## Windows 预留

当前 updater 使用 macOS 自带工具实现。Windows 后续需要新增单独的 updater 可执行文件和注册表安装脚本。

## 卸载 Native Host

```bash
./scripts/uninstall-native-host-macos.sh
```
