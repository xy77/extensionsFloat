# Float Chrome Extension

Float 是一个私下分发的 Chrome unpacked extension。它不依赖 Chrome Web Store，更新通过页面里的悬浮按钮触发，再由 Chrome Native Messaging 调用本机 updater 完成下载、备份、替换和回滚。macOS 与 Windows 都支持，两端共用同一个 release zip 和同一套一键更新流程。

## 功能一览

| 模块 | 功能 |
| --- | --- |
| 悬浮按钮 | 在任意网页注入四角星悬浮按钮：可拖动、贴边回弹；单击开合便签面板；双击切换明暗主题；右键打开更新面板；发现新版本时显示红点 |
| 玻璃态便签面板 | 可写文本的便签，粒子鼠标引力背景；拖左／下／左下边缘缩放（最小 300×200）；内容 100ms 防抖自动保存到 `chrome.storage.local`，按时间戳跨标签同步，拼音输入过程中不会误存 |
| 预览快捷键 | `Ctrl/Cmd + S` 打开预览窗口，自动识别 HTML / React / Markdown / JSON / 纯文本；React 预览通过 CDN 加载 React 18 + Babel + Tailwind 编译 JSX；`Esc` 关闭；弹窗被拦截时给出提示 |
| 下载快捷键 | `Ctrl/Cmd + D` 弹出文件名／格式选择框，`Enter` 确认、`Esc` 取消；React 导出渲染后的 HTML，其余格式导出便签原文 |
| Gemini Canvas 桥接 | 仅 `gemini.google.com` 生效：在 Canvas「代码 / 预览」分段控件旁注入「全屏」按钮，一键读取编辑器里的代码并打开全屏预览。桥接脚本运行在 MAIN world，从 Monaco / CodeMirror / textarea 等编辑器实例中提取代码，供隔离世界的 content script 打分择优 |
| 回答代码块全屏 | 在 `gemini.google.com`、`qianwen.com`、`chat.deepseek.com`、`doubao.com`、`kimi.com`（含各自子域）的**普通回答代码块**各注入两个「全屏」按钮：上方按钮插在站点原生工具栏**第一个按钮的左边**、与原有按钮同一行（无工具栏时自建一行），下方按钮在代码块底部单起一行右对齐，两处样式完全一致；**仅 Gemini 例外**：它的头部是「语言标签一行 + 操作图标下一行」，反复插原生工具栏都会错位，因此改为把上方按钮固定在**代码块右上角**（头部工具栏下方、代码区右上角的空白，不占布局、不进代码块 DOM），位置不受站点工具栏重排影响；一屏多个代码块按稳定 id 逐个注入、互不串码。点击只读取该块代码送 `preview.html`，**不会覆盖便签里已输入的内容**；千问会自动剔除代码块行号；豆包会把按行渲染的代码块还原成换行、合并每行独立的 `<code>` 并剔除行号，避免 `postMessage` 里的内容丢失或挤成一行；自动跳过 Monaco / CodeMirror 等可编辑区与行内短代码 |
| 自动更新 | 右键悬浮按钮 →「检查更新」→「立即更新」；从 GitHub 最新 Release 读取 `latest.json`，semver 比较、sha256 校验、备份、保留本机配置、失败自动回滚、成功后自动 `chrome.runtime.reload()` 并刷新页面；每天 13:00 静默检查一次 |
| 权限范围 | `storage` + `nativeMessaging`；content script 注入 `<all_urls>`；host 权限覆盖 `github.com`、`raw.githubusercontent.com`；预览页使用 `xy77.github.io` 与 React CDN |

## 项目结构

- `manifest.json`: Chrome extension manifest，当前版本号来自这里的 `version`。
- `content.js`: 悬浮按钮、玻璃态面板、编辑/预览/下载 UI，以及更新按钮 UI。
- `background.js`: 插件后台，负责检查更新和调用 Native Messaging host。
- `gemini-canvas-bridge.js`: Gemini Canvas 代码读取桥接（MAIN world）。
- `src/updater/checkUpdate.js`: 读取 GitHub latest Release 里的 `latest.json`，做 semver 比较。
- `src/updater/nativeHost.js`: 调用 `chrome.runtime.sendNativeMessage`，统一错误文案。
- macOS：`native-host/updater-macos.sh` + `run-updater-macos.sh`（本机 updater），`scripts/install-native-host-macos.sh`（安装），`scripts/uninstall-native-host-macos.sh`（卸载）。
- Windows：`native-host/updater-windows.ps1`（本机 updater），`scripts/install-windows.cmd` + `install-windows.ps1`（双击安装），`scripts/uninstall-windows.cmd`（双击卸载）。
- `.github/workflows/release-extension.yml`: GitHub Actions 自动生成 release zip、`latest.json` 和 GitHub Release。
- `scripts/package-release.sh`: 本地手动生成 release zip 和 `latest.json`，通常不需要使用。
- `scripts/build-local.sh`: 生成 `dist/` 本地测试包，不发版、不改版本号、不改 `latest.json`。
- `.gitattributes`: 保证 `*.cmd` 在 Windows / GitHub Actions 上都是 CRLF 换行。

## 每台电脑首次安装

每一台使用插件的电脑只需要配置一次。朋友不需要 GitHub、GitHub Desktop、Node 或 Python。

重要：不要把 Chrome 加载目录指向 Git 仓库（GitHub Desktop 管理的源码目录）。请使用一个独立、稳定的安装目录，后续 updater 会整体替换这个目录里的文件（macOS 会直接拒绝 Git 仓库；Windows 允许但会覆盖工作区文件，见下方 Windows 小节）。macOS 建议 `~/Applications/float-extension`，Windows 建议 `C:\Users\<你>\float-extension`；不建议放在桌面、文档、下载、iCloud Drive / OneDrive 同步目录，也不要让路径包含 `&`。

### Windows（最简单，全程只需双击一次）

1. 从 GitHub Release 下载 **v1.0.24 及以后** 的 `extension-v<version>.zip`（v1.0.23 的安装脚本有 `-NonInteractive` 问题，v1.0.22 及更早的包里没有 Windows 文件）。
2. 解压到固定目录，例如 `C:\Users\<你>\float-extension`，确保 `manifest.json` 位于这个目录的第一层。`scripts\install-windows.cmd` 和 `scripts\install-windows.ps1` 必须一起保留。
3. 打开 Chrome → `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」，选择该目录，然后复制扩展卡片上的 **Extension ID**。
4. 双击目录里的 `scripts\install-windows.cmd`。窗口会先显示插件目录和 PowerShell 版本，然后出现 `Extension ID:` 提示；粘贴 ID 回车，看到「Native Host 自检通过」即完成。

不需要管理员权限、不需要联网、不需要安装任何额外软件：脚本只使用 Windows 自带的 PowerShell、cmd、curl 和注册表（HKCU），并会自动做完一次 `ping → pong` 自检。完成后重启一次 Chrome 更稳妥。

安装入口**不能**带 `-NonInteractive`（该模式下 PowerShell 的 `Read-Host` 会直接报错、无法粘贴 ID）。即使插件目录恰好是 Git 仓库，脚本也只会警告并继续：更新时会保留 `.git`，但会覆盖该目录的工作区文件，所以仍建议用独立解压目录。任何步骤失败，窗口都会打印中文原因、排查清单和日志路径 `%TEMP%\float-install-windows.log`。

安装脚本做了什么：把宿主文件写到 `%LOCALAPPDATA%\FloatExtension\`（host manifest、启动器、`config.json`），并创建注册表项

```text
HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.float.extension_updater
```

这些文件放在插件目录之外，所以以后每次更新只替换插件目录，Native Host 注册不会失效。宿主启动器每次运行都会复制插件目录里最新的 `updater-windows.ps1`，因此 updater 本身也会随版本升级。

### macOS

1. 下载初始安装 zip，或从 GitHub Release 下载 `extension-v<version>.zip`。
2. 解压到稳定目录，例如 `~/Applications/float-extension`，确保 `manifest.json` 位于第一层。
3. 打开 Chrome → `chrome://extensions` → 开启 Developer mode → Load unpacked，选择解压后的插件目录。
4. 复制 Extension ID，然后在插件安装目录运行一次：

```bash
cd ~/Applications/float-extension
./scripts/install-native-host-macos.sh <EXTENSION_ID> "$(pwd)"
```

## 固定 Extension ID

Native Messaging 的 `allowed_origins` 必须写入准确的 Extension ID。

最简单的方式是：每台电脑第一次 Load unpacked 后复制 Chrome 显示的 ID，再运行对应系统的安装脚本。只要插件目录不移动，这个 ID 通常保持稳定。

如果你希望所有朋友电脑上的 ID 完全一致，可以使用 Chrome 打包扩展生成私钥，再把对应的 public key 写入 `manifest.json` 的 `key` 字段。私钥 `.pem` 不要提交到仓库。

## 一键更新流程（macOS / Windows 相同）

1. 在任意网页找到 Float 悬浮按钮，右键打开更新小面板。
2. 面板显示当前版本号，点击「检查更新」。
3. 插件从 GitHub 最新 Release 读取 `latest.json`；有新版本时按钮变成「立即更新」并显示版本号和更新说明。
4. 点击「立即更新」，插件通过 Native Messaging 调用本机 updater。
5. updater 下载 `extension-v<version>.zip`，校验版本与 sha256，备份当前目录，替换文件并保留本地配置；失败会自动回滚。
6. 更新成功后插件自动 `chrome.runtime.reload()` 并刷新当前页面。

如果自动刷新后旧 content script 仍未完全更新，请到 `chrome://extensions` 点击该扩展的刷新按钮，或手动刷新网页。

## 本地测试（不发布、不触发自动更新）

功能改动先在本地验证，确认没问题再走下面的发版流程。

```bash
./scripts/build-local.sh
```

产物全部在 `dist/`，该目录已被 `.gitignore` 忽略，不会进仓库：

- `dist/float-extension-local/`：Chrome 直接「加载已解压的扩展程序」选这个目录，不用解压。
- `dist/float-extension-local-v<version>.zip`：拷到别的机器用，解压后是同名目录。

这个脚本用和 GitHub Actions 相同的排除规则打包，但**不改版本号、不改 `latest.json`、不调用 `gh`、不触发 workflow**。包内版本与线上 Release 相同，因此插件的「检查更新」不会误报新版本。

建议的验证步骤：

1. `chrome://extensions` → 开发者模式 →「加载已解压的扩展程序」→ 选 `dist/float-extension-local/`。
2. 打开 Gemini / 千问 / DeepSeek / 豆包 / Kimi，让回答里出现代码块（例如让它生成一段完整 HTML），确认**每个代码块**都有两个「全屏」：千问 / DeepSeek / 豆包 / Kimi 的上方按钮在原有「复制 / 下载」等按钮**左边**且同一行（不能换行或跑到最右）；**Gemini 的上方按钮固定在代码块右上角**，即头部工具栏下方、代码区右上角的空白处，不插入原生两行工具栏；下方的在代码块底部单起一行，两者样式一致。
3. 先在便签里随便输入一段文字并记住，再点「全屏」，确认新开的 `xy77.github.io/preview.html` 渲染的是**该代码块**的完整内容，且便签里那段文字**没有被覆盖**。
4. 重点测千问：确认预览里没有多出 `1 2 3…` 这样的行号，页面样式与手动复制代码到便签再 `Ctrl/Cmd+S` 预览的效果一致。
5. 重点测豆包：确认预览里**每一行代码都在、没有挤成一行、也没有行号**（豆包按行渲染，旧版只取了第一行 `<code>`）；长代码块尤其要对比。
6. 全屏预览不依赖 Native Host，这些页面不装 host 也能测。

确认无误后再发版：把 `manifest.json` 的 `version` 升一位，commit + push 到 `main`。版本号不升的话，Actions 会因为同名 Release 已存在而跳过打包。

## 发布新版本

日常发布只需要 GitHub Desktop，不需要手动创建 GitHub Release，不需要手动上传 zip。

最少操作：

1. 修改 `manifest.json` 的 `version`，版本号使用 semver，例如从 `1.0.24` 改到 `1.0.25`。
2. 在 GitHub Desktop 里写 commit message，例如 `Release v1.0.25`。
3. Commit to main → Push origin。
4. GitHub Actions 发布完成后，在浏览器里右键 Float 悬浮按钮，点击「检查更新」。

push 后 GitHub Actions 会自动：

- 读取 `manifest.json` 的版本号
- 创建 tag，例如 `v1.0.25`
- 打包 `extension-v1.0.25.zip`
- 生成 `latest.json`
- 创建 GitHub Release 并上传 zip 与 `latest.json`

Windows 的 `.cmd` / `.ps1` 和 macOS 的 `.sh` 都是纯文本源码，workflow 原有的 `zip -r` 步骤会把它们一起打进 release zip，**不需要为了支持 Windows 改动发布流程**（只额外排除了本地的 `.workbuddy/` 目录，发布逻辑本身不变）。`.gitattributes` 保证 Actions 在 Linux runner 上 checkout 出来的 `.cmd` 仍是 CRLF，Windows 双击可正常执行。

正常发布新版本时，不需要修改根目录 `latest.json`，也不需要运行 `scripts/package-release.sh`。根目录 `latest.json` 只用于旧版过渡；1.0.1 之后的插件默认读取 GitHub latest Release 的 `latest.json`。如果当前版本的 tag 已经存在，Actions 会跳过发布，避免重复创建 Release。

简化流程就是：改 `manifest.json` → Git commit → Git push → 点「检查更新」。

发布进度：

```text
https://github.com/xy77/extensionsFloat/actions
```

默认插件读取：

```text
https://github.com/xy77/extensionsFloat/releases/latest/download/latest.json
```

如果仓库名或路径改变，请修改 `src/updater/checkUpdate.js` 里的 `DEFAULT_LATEST_JSON_URL`。

`latest.json` 格式：

```json
{
  "version": "1.0.25",
  "downloadUrl": "https://github.com/xy77/extensionsFloat/releases/download/v1.0.25/extension-v1.0.25.zip",
  "sha256": "release zip sha256",
  "changelog": "更新说明"
}
```

`sha256` 可以为空，但推荐保留。只要 `latest.json` 提供了 `sha256`，updater 就必须校验通过才会替换文件。

## 已安装电脑如何更新

首次安装并配置 Native Host 后，后续更新只需要：右键悬浮按钮 →「检查更新」→「立即更新」。

如果「立即更新」不可点击，通常说明没有新版本，或 Native Host 不可用。先看面板里的提示文字，再参考下面的常见问题。

## 本地手动打包（可选）

正常情况下由 GitHub Actions 自动打包。如果需要在本机临时生成 zip，可以运行：

```bash
GITHUB_REPO=xy77/extensionsFloat ./scripts/package-release.sh
```

脚本会生成：

- `dist/extension-v<version>.zip`
- `dist/latest.json`
- `latest.json`

注意：这个脚本是 macOS 专用的（依赖 `plutil`、`shasum`）。Windows 用户请直接使用 GitHub Release 的 zip，不要本地打包。

## 本地文件保留规则

更新时会保留这些本地文件和目录：

- `.env`
- `config.local.json`
- `data/`
- `logs/`
- `native-host/config.json`

备份会写入插件目录下的 `backups/`。发布包会排除上述本地文件、`backups/` 和 `node_modules/`。Windows updater 还会额外保留 `.git/`（且备份时跳过它），避免误删仓库历史。Windows 的宿主文件在 `%LOCALAPPDATA%\FloatExtension\`，不在插件目录内，因此不受替换影响。

## 常见问题

`双击 install-windows.cmd 后直接报错，没有让我粘贴 ID`

早期版本的安装入口带了 `-NonInteractive`，PowerShell 在该模式下执行 `Read-Host` 会直接抛错；另外目录检查被放在输入之前，遇到 Git 仓库或旧安装包时会先失败。已修复：请更新 `scripts\install-windows.cmd` 与 `scripts\install-windows.ps1`（或重新下载 v1.0.24 及以后的 zip）。新版窗口会先显示插件目录、PowerShell 版本，再要求粘贴 ID；任何异常都会输出中文原因和排查清单。若仍失败，把窗口文字或 `%TEMP%\float-install-windows.log` 发我。

`本机 updater 还没有安装`

macOS：重新复制当前 Extension ID，在插件目录运行 `./scripts/install-native-host-macos.sh <EXTENSION_ID> "$(pwd)"`。
Windows：双击插件目录里的 `scripts\install-windows.cmd`，重新粘贴当前 Extension ID，看到自检通过为止；然后重启一次 Chrome。

`Native Host 已安装，但当前扩展 ID 没有被允许`

Chrome 当前显示的 Extension ID 和 host manifest 里的 `allowed_origins` 不一致（常见于重新解压或移动了插件目录）。用当前 ID 重新运行对应系统的安装脚本。

`发现新版本，但 updater 不可用：Native host has exited`

Windows 上先看 `%TEMP%\float-updater-windows.log`，再按顺序检查：插件目录是否被移动、是否指向 Git 仓库、是否重新解压过（ID 变化）。重新运行 `scripts\install-windows.cmd` 通常即可解决。macOS 上同样重新运行安装脚本，并确认插件不是从 GitHub Desktop 源码仓库目录加载的。

`extensionDir 不存在或不是目录`

插件目录被移动了。进入新的插件目录，重新运行对应系统的安装脚本。

`双击 install-windows.cmd 没反应 / 被安全提示拦截`

从网络下载的 zip 可能带「 Mark of the Web」：右键 `install-windows.cmd` → 属性 → 勾选「解除锁定」→ 应用，再双击。若 SmartScreen 提示，点「更多信息」→「仍要运行」。窗口会自动停留，能看到安装结果或报错。

`Windows 安装自检没通过`

安装文件其实已经写好。重启一次 Chrome，右键悬浮按钮点「检查更新」确认；仍不行时查看 `%TEMP%\float-updater-windows.log`，并确认宿主目录路径中没有 `&`，插件目录里存在 `native-host\updater-windows.ps1`。

`下载失败`

确认 GitHub Release 是 public，`latest.json` 中的 `downloadUrl` 可以匿名访问。Windows 优先使用系统自带 `curl.exe`（Windows 10 1803+），老系统会回退到 `Invoke-WebRequest`。

`下载包 sha256 校验失败`

确认 GitHub Actions 生成的 Release asset 和 `latest.json` 是同一次发布。如果手动替换过 zip，重新改一个新版本号并用 GitHub Desktop push，让 Actions 重新发布。

`更新成功但界面没变化`

通常插件会自动重新加载并刷新当前页面。如果仍然没变化，打开 `chrome://extensions`，点击扩展卡片上的刷新按钮，然后刷新当前网页。

## 卸载 Native Host

macOS：

```bash
./scripts/uninstall-native-host-macos.sh
```

Windows：双击 `scripts\uninstall-windows.cmd`。只删除注册表项和 `%LOCALAPPDATA%\FloatExtension\` 下生成的宿主文件，不会删除插件目录或便签数据。

之后如需彻底移除插件，在 `chrome://extensions` 里移除扩展，再手动删除插件目录。
