importScripts('src/updater/checkUpdate.js', 'src/updater/nativeHost.js');

const UPDATE_MESSAGE_TYPES = {
  STATUS: 'float-updater:get-status',
  CHECK: 'float-updater:check',
  UPDATE: 'float-updater:update'
};

function getCurrentVersion() {
  return chrome.runtime.getManifest().version;
}

function getFriendlyError(error) {
  const message = error && error.message ? error.message : String(error || '');

  if (/Failed to fetch/i.test(message)) {
    return '无法获取 latest.json，请检查网络或 GitHub Release 配置。';
  }

  return message || '更新检查失败。';
}

async function handleStatus() {
  return {
    ok: true,
    version: getCurrentVersion(),
    hostName: FloatNativeHost.HOST_NAME,
    latestJsonUrl: FloatUpdateCheck.DEFAULT_LATEST_JSON_URL
  };
}

async function handleCheck() {
  const currentVersion = getCurrentVersion();

  try {
    const checkResult = await FloatUpdateCheck.checkUpdate(currentVersion);
    let nativeHost = null;

    if (checkResult.updateAvailable) {
      nativeHost = await FloatNativeHost.sendNativeCommand('check', { currentVersion });
    }

    return {
      ok: true,
      ...checkResult,
      nativeHost
    };
  } catch (error) {
    return {
      ok: false,
      code: 'CHECK_FAILED',
      version: currentVersion,
      message: getFriendlyError(error)
    };
  }
}

async function handleUpdate(payload) {
  const currentVersion = getCurrentVersion();
  const latest = payload && payload.latest;

  if (!latest || typeof latest !== 'object') {
    return {
      ok: false,
      code: 'INVALID_UPDATE_PAYLOAD',
      message: '缺少最新版本信息，请先检查更新。'
    };
  }

  try {
    if (FloatUpdateCheck.compareSemver(latest.version, currentVersion) <= 0) {
      return {
        ok: false,
        code: 'ALREADY_UP_TO_DATE',
        message: '当前已经是最新版本。'
      };
    }
  } catch (error) {
    return {
      ok: false,
      code: 'INVALID_VERSION',
      message: getFriendlyError(error)
    };
  }

  const nativeResult = await FloatNativeHost.sendNativeCommand('update', {
    currentVersion,
    latestVersion: latest.version,
    downloadUrl: latest.downloadUrl,
    sha256: latest.sha256 || '',
    extensionDir: payload.extensionDir || ''
  });

  if (nativeResult.ok) {
    setTimeout(() => {
      chrome.runtime.reload();
    }, 800);
  }

  return {
    ...nativeResult,
    reloadScheduled: Boolean(nativeResult.ok)
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;
  if (message.type === 'float-ui:get-zoom') {
    if (!sender.tab) return false;
    chrome.tabs.getZoom(sender.tab.id, (zoomFactor) => {
      const error = chrome.runtime.lastError;
      sendResponse({ zoomFactor: error ? 1 : zoomFactor });
    });
    return true;
  }

  const run = async () => {
    if (message.type === UPDATE_MESSAGE_TYPES.STATUS) {
      return handleStatus();
    }

    if (message.type === UPDATE_MESSAGE_TYPES.CHECK) {
      return handleCheck();
    }

    if (message.type === UPDATE_MESSAGE_TYPES.UPDATE) {
      return handleUpdate(message.payload || {});
    }

    return null;
  };

  run()
    .then((response) => {
      if (response) sendResponse(response);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        code: 'BACKGROUND_ERROR',
        message: getFriendlyError(error)
      });
    });

  return true;
});

// 使用浏览器提供的真实网页缩放值，避免把显示器 DPI 当成网页缩放。
chrome.tabs.onZoomChange.addListener(({ tabId, newZoomFactor }) => {
  chrome.tabs.sendMessage(tabId, { type: 'float-ui:zoom-changed', zoomFactor: newZoomFactor }, () => {
    void chrome.runtime.lastError; // 未注入插件的标签页无需处理。
  });
});
