(function (scope) {
  const HOST_NAME = 'com.float.extension_updater';

  function toUserMessage(error) {
    const message = error && error.message ? error.message : String(error || '');

    if (/native messaging host.*not found/i.test(message) || /specified native messaging host not found/i.test(message)) {
      return '本机 updater 还没有安装。请先运行 macOS Native Host 安装脚本。';
    }

    if (/access to the specified native messaging host is forbidden/i.test(message)) {
      return 'Native Host 已安装，但当前扩展 ID 没有被允许。请用当前 Extension ID 重新运行安装脚本。';
    }

    if (/Error when communicating with the native messaging host/i.test(message)) {
      return '无法和本机 updater 通信。请重新安装 Native Host。';
    }

    return message || 'Native Messaging 调用失败。';
  }

  function sendNativeCommand(command, payload = {}) {
    return new Promise((resolve) => {
      if (!chrome.runtime || typeof chrome.runtime.sendNativeMessage !== 'function') {
        resolve({
          ok: false,
          code: 'NATIVE_MESSAGING_UNAVAILABLE',
          message: '当前 Chrome 环境不支持 Native Messaging。'
        });
        return;
      }

      chrome.runtime.sendNativeMessage(HOST_NAME, { command, ...payload }, (response) => {
        const lastError = chrome.runtime.lastError;

        if (lastError) {
          resolve({
            ok: false,
            code: 'NATIVE_HOST_UNAVAILABLE',
            message: toUserMessage(lastError)
          });
          return;
        }

        if (!response || typeof response !== 'object') {
          resolve({
            ok: false,
            code: 'INVALID_NATIVE_RESPONSE',
            message: '本机 updater 返回了无效结果。'
          });
          return;
        }

        resolve(response);
      });
    });
  }

  scope.FloatNativeHost = {
    HOST_NAME,
    sendNativeCommand
  };
})(globalThis);
