(function () {
  const PREVIEW_MESSAGE_SOURCE = 'float-extension-preview';
  const PREVIEW_RENDER_MESSAGE_TYPE = 'render';
  const PREVIEW_ACK_MESSAGE_TYPE = 'ack';
  const PAYLOAD_TIMEOUT_MS = 5000;

  const frame = document.getElementById('preview-frame');
  const status = document.getElementById('preview-status');

  let hasPayload = false;
  let lastPayloadId = '';

  function setTitle(title) {
    const nextTitle = title || '预览';
    document.title = nextTitle;
    frame.title = nextTitle;
  }

  function showStatus(message, isError) {
    document.body.classList.toggle('has-preview', false);
    document.body.classList.toggle('has-error', Boolean(isError));
    status.textContent = message || (isError ? '预览失败。' : '正在等待预览数据...');
  }

  function renderPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      showStatus('预览数据无效。', true);
      return;
    }

    if (payload.id && payload.id === lastPayloadId) return;

    hasPayload = true;
    lastPayloadId = payload.id || '';
    setTitle(payload.title);
    document.body.classList.remove('has-error');
    document.body.classList.add('has-preview');
    status.textContent = '';
    frame.srcdoc = payload.frameHtml || '';
  }

  function sendAck(sourceWindow, id) {
    if (!sourceWindow || !id) return;

    sourceWindow.postMessage({
      source: PREVIEW_MESSAGE_SOURCE,
      type: PREVIEW_ACK_MESSAGE_TYPE,
      id
    }, '*');
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.source !== PREVIEW_MESSAGE_SOURCE || data.type !== PREVIEW_RENDER_MESSAGE_TYPE) return;

    renderPayload(data.payload);
    sendAck(event.source, data.payload && data.payload.id);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      window.close();
    }
  });

  window.setTimeout(() => {
    if (!hasPayload) {
      showStatus('没有收到预览数据。请回到原页面重新点击预览。', true);
    }
  }, PAYLOAD_TIMEOUT_MS);
})();
