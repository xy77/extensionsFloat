(function (scope) {
  const DEFAULT_LATEST_JSON_URL = 'https://raw.githubusercontent.com/xy77/extensionsFloat/main/latest.json';

  function parseSemver(version) {
    const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) {
      throw new Error(`Invalid semver version: ${version}`);
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

  function normalizeLatestInfo(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('latest.json 格式不正确。');
    }

    const version = String(raw.version || '').trim().replace(/^v/, '');
    const downloadUrl = String(raw.downloadUrl || '').trim();
    const changelog = typeof raw.changelog === 'string' ? raw.changelog : '';
    const sha256 = typeof raw.sha256 === 'string' && raw.sha256.trim() ? raw.sha256.trim().toLowerCase() : '';

    parseSemver(version);

    if (!downloadUrl) {
      throw new Error('latest.json 缺少 downloadUrl。');
    }

    if (!/^https:\/\/github\.com\//.test(downloadUrl) && !/^https:\/\/.+/.test(downloadUrl)) {
      throw new Error('downloadUrl 必须是 HTTPS 地址。');
    }

    if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error('sha256 必须是 64 位十六进制字符串。');
    }

    return {
      version,
      downloadUrl,
      changelog,
      sha256
    };
  }

  async function fetchLatestInfo(latestJsonUrl = DEFAULT_LATEST_JSON_URL) {
    const response = await fetch(latestJsonUrl, {
      cache: 'no-store',
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`latest.json 请求失败：HTTP ${response.status}`);
    }

    return normalizeLatestInfo(await response.json());
  }

  async function checkUpdate(currentVersion, options = {}) {
    const latest = await fetchLatestInfo(options.latestJsonUrl);
    const comparison = compareSemver(latest.version, currentVersion);

    return {
      currentVersion,
      latest,
      updateAvailable: comparison > 0,
      isDowngrade: comparison < 0
    };
  }

  scope.FloatUpdateCheck = {
    DEFAULT_LATEST_JSON_URL,
    parseSemver,
    compareSemver,
    fetchLatestInfo,
    checkUpdate
  };
})(globalThis);
