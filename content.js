// content.js
(function () {
  // 防止重复注入
  if (window.__glass_memo_injected__) return;
  window.__glass_memo_injected__ = true;

	  const STORAGE_KEY = 'glass_memo_state';
	  const MIN_WIDTH = 300;
	  const MIN_HEIGHT = 200;
	  const CLICK_SEQUENCE_DELAY = 260;

  // 初始化宿主容器和 Shadow DOM
  const host = document.createElement('div');
  host.id = 'glass-memo-host';
  // 确保宿主容器本身不影响页面布局，层级最高
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    zIndex: '2147483647',
    overflow: 'visible'
  });
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // 注入样式
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }
    
	    #wrapper {
	      position: absolute;
	      width: 56px;
	      height: 56px;
		      --memo-button-bg: #ffffff;
		      --memo-button-hover-bg: #f8f9fa;
		      --memo-button-shadow: 0 0 0 1px rgba(160, 210, 255, 0.24), 0 0 18px rgba(120, 190, 255, 0.42), 0 0 42px rgba(120, 190, 255, 0.24), 0 12px 24px -10px rgba(0, 0, 0, 0.45);
		      --memo-panel-bg: rgba(255, 255, 255, 0.05);
		      --memo-panel-border: rgba(255, 255, 255, 0.05);
		      --memo-panel-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
		      --memo-text-color: #333;
		      --memo-caret-color: #333;
		      --memo-muted-text-color: #5f6368;
		      --memo-input-bg: rgba(255, 255, 255, 0.72);
		      --memo-input-border: rgba(60, 64, 67, 0.18);
		      --memo-modal-bg: rgba(255, 255, 255, 0.92);
		      --memo-action-bg: #202124;
		      --memo-action-color: #ffffff;
		      --memo-particle-color: 218,218,240;
	    }

	    #wrapper[data-theme="dark"] {
		      --memo-button-bg: #ffffff;
		      --memo-button-hover-bg: #f8f9fa;
		      --memo-button-shadow: 0 0 0 1px rgba(160, 210, 255, 0.24), 0 0 18px rgba(120, 190, 255, 0.42), 0 0 42px rgba(120, 190, 255, 0.24), 0 12px 24px -10px rgba(0, 0, 0, 0.45);
		      --memo-panel-bg: rgba(18, 18, 22, 0.58);
		      --memo-panel-border: rgba(160, 210, 255, 0.42);
		      --memo-panel-shadow: 0 0 0 1px rgba(160, 210, 255, 0.20), 0 0 22px rgba(120, 190, 255, 0.32), 0 0 58px rgba(120, 190, 255, 0.18), 0 25px 50px -12px rgba(0,0,0,0.55);
		      --memo-text-color: #f1f3f4;
		      --memo-caret-color: #ffffff;
		      --memo-muted-text-color: #c6c9d4;
		      --memo-input-bg: rgba(255, 255, 255, 0.10);
		      --memo-input-border: rgba(160, 210, 255, 0.30);
		      --memo-modal-bg: rgba(24, 25, 32, 0.94);
		      --memo-action-bg: #ffffff;
		      --memo-action-color: #202124;
		      --memo-particle-color: 110,155,205;
	    }

    /* 悬浮按钮 */
    #float-btn {
      position: relative;
      width: 100%;
      height: 100%;
	      background-color: var(--memo-button-bg);
      border-radius: 50%;
	      box-shadow: var(--memo-button-shadow);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
	      transition: transform 0.2s, background-color 0.2s, box-shadow 0.2s;
      user-select: none;
      touch-action: none;
      animation: memo-button-breathe 3.8s ease-in-out infinite;
      isolation: isolate;
      overflow: visible;
      will-change: filter;
    }
    #float-btn::before {
      content: "";
      position: absolute;
      inset: -9px;
      border-radius: 50%;
      pointer-events: none;
      z-index: 0;
      opacity: 0.2;
      transform: scale(0.92);
      background: radial-gradient(circle, rgba(120, 190, 255, 0.13) 0%, rgba(120, 190, 255, 0.07) 45%, rgba(161, 66, 244, 0) 72%);
      box-shadow: 0 0 12px rgba(120, 190, 255, 0.20), 0 0 24px rgba(161, 66, 244, 0.10);
      animation: memo-button-halo-breathe 3.2s ease-in-out infinite;
      will-change: transform, opacity, box-shadow;
    }
    #float-btn:hover {
	      background-color: var(--memo-button-hover-bg);
      transform: scale(1.05);
    }
    #float-btn svg {
      position: relative;
      z-index: 1;
      transform-box: fill-box;
      transform-origin: center;
      filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.2));
      animation: memo-icon-breathe 3.2s ease-in-out infinite;
      will-change: transform, filter, opacity;
    }

    @keyframes memo-button-breathe {
      0%, 100% {
        filter: brightness(1);
      }
      50% {
        filter: brightness(1.02);
      }
    }

    @keyframes memo-button-halo-breathe {
      0%, 100% {
        opacity: 0.16;
        transform: scale(0.92);
        box-shadow: 0 0 10px rgba(120, 190, 255, 0.16), 0 0 20px rgba(161, 66, 244, 0.08);
      }
      50% {
        opacity: 0.38;
        transform: scale(1.02);
        box-shadow: 0 0 16px rgba(120, 190, 255, 0.22), 0 0 30px rgba(161, 66, 244, 0.12);
      }
    }

    @keyframes memo-icon-breathe {
      0%, 100% {
        opacity: 0.96;
        transform: scale(1);
        filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.2));
      }
      50% {
        opacity: 1;
        transform: scale(1.035);
        filter: drop-shadow(0px 2px 7px rgba(26,115,232,0.25));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #float-btn,
      #float-btn::before,
      #float-btn svg {
        animation: none;
      }
    }

    /* 玻璃态面板 */
    .glass-panel {
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      border-radius: 16px;
	      background: var(--memo-panel-bg);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
		      box-shadow: var(--memo-panel-shadow);
	      border: 1px solid var(--memo-panel-border);
      overflow: hidden;
      box-sizing: border-box;
	      color: var(--memo-text-color);
      font-family: system-ui, -apple-system, sans-serif;
      transform-origin: top right;
			      transition: opacity 0.3s, transform 0.3s, filter 0.2s, background 0.2s, border-color 0.2s, box-shadow 0.2s;
	      
	      /* 隐藏状态 */
	      opacity: 0;
	      pointer-events: none;
		      transform: translateY(-10px) scale(0.95);
		    }

	    .glass-panel.show {
		      opacity: 1;
		      pointer-events: auto;
		      transform: translateY(0) scale(1);
		    }

	    .glass-panel.closing {
		      pointer-events: none;
		      animation: memo-panel-scale-hide 0.28s cubic-bezier(0.2, 0, 0, 1) both;
		    }

	    @keyframes memo-panel-scale-hide {
	      0% {
	        opacity: 1;
	        filter: blur(0);
	        transform: translateY(0) scale(1);
	      }
	      55% {
	        opacity: 0.72;
	        filter: blur(0.2px);
	        transform: translateY(-3px) scale(0.92);
	      }
	      100% {
	        opacity: 0;
	        filter: blur(0.6px);
	        transform: translateY(-8px) scale(0.72);
	      }
	    }

    canvas#bg-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    }

    /* Editor */
    #editor {
      position: relative;
      flex-grow: 1;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      resize: none;
      border: none;
      outline: none;
      background: transparent;
      padding: 10px;
      font-family: Consolas, monospace;
      font-size: 16px;
	      color: var(--memo-text-color);
	      caret-color: var(--memo-caret-color);
      z-index: 10;
      line-height: 1.5;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    #editor::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }

	    #download-dialog {
	      position: absolute;
	      inset: 0;
	      z-index: 130;
	      display: none;
	      align-items: center;
	      justify-content: center;
	      padding: 18px;
	      box-sizing: border-box;
	      background: rgba(0, 0, 0, 0.08);
	      backdrop-filter: blur(5px);
	      -webkit-backdrop-filter: blur(5px);
	    }

	    #download-dialog.show {
	      display: flex;
	    }

	    .download-box {
	      width: min(100%, 340px);
	      box-sizing: border-box;
	      border: 1px solid var(--memo-panel-border);
	      border-radius: 12px;
	      background: var(--memo-modal-bg);
	      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
	      color: var(--memo-text-color);
	      padding: 14px;
	    }

	    .download-title {
	      margin: 0 0 10px;
	      font: 600 14px/1.4 system-ui, -apple-system, sans-serif;
	    }

	    .download-row {
	      display: flex;
	      align-items: stretch;
	      min-width: 0;
	    }

	    #download-name-input {
	      min-width: 0;
	      flex: 1 1 auto;
	      box-sizing: border-box;
	      border: 1px solid var(--memo-input-border);
	      border-right: none;
	      border-radius: 8px 0 0 8px;
	      background: var(--memo-input-bg);
	      color: var(--memo-text-color);
	      outline: none;
	      padding: 9px 10px;
	      font: 14px/1.4 system-ui, -apple-system, sans-serif;
	    }

	    #download-name-input:focus {
	      border-color: rgba(26, 115, 232, 0.55);
	    }

	    #download-extension {
	      flex: 0 0 auto;
	      display: inline-flex;
	      align-items: center;
	      border: 1px solid var(--memo-input-border);
	      border-radius: 0 8px 8px 0;
	      background: rgba(128, 134, 139, 0.12);
	      color: var(--memo-muted-text-color);
	      padding: 0 10px;
	      font: 600 14px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	      user-select: none;
	    }

	    .download-actions {
	      display: flex;
	      justify-content: flex-end;
	      gap: 8px;
	      margin-top: 12px;
	    }

	    .download-actions button {
	      border: 1px solid transparent;
	      border-radius: 8px;
	      cursor: pointer;
	      padding: 8px 12px;
	      font: 600 13px/1 system-ui, -apple-system, sans-serif;
	    }

	    #download-cancel {
	      background: transparent;
	      border-color: var(--memo-input-border);
	      color: var(--memo-text-color);
	    }

	    #download-confirm {
	      background: var(--memo-action-bg);
	      color: var(--memo-action-color);
	    }

	    #update-popover {
	      position: absolute;
	      top: 68px;
	      right: -4px;
	      z-index: 80;
	      display: none;
	      flex-direction: column;
	      gap: 10px;
	      width: 150px;
	      box-sizing: border-box;
	      padding: 12px;
	      border: 1px solid rgba(255, 255, 255, 0.34);
	      border-radius: 12px;
	      background: linear-gradient(180deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.42));
	      color: var(--memo-text-color);
	      box-shadow: 0 18px 38px -20px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.28) inset;
	      font-family: system-ui, -apple-system, sans-serif;
	      backdrop-filter: blur(18px) saturate(1.35);
	      -webkit-backdrop-filter: blur(18px) saturate(1.35);
	    }

	    #update-popover::before {
	      content: "";
	      position: absolute;
	      top: -7px;
	      right: 22px;
	      width: 12px;
	      height: 12px;
	      transform: rotate(45deg);
	      border-left: 1px solid rgba(255, 255, 255, 0.34);
	      border-top: 1px solid rgba(255, 255, 255, 0.34);
	      background: rgba(255, 255, 255, 0.62);
	      backdrop-filter: blur(18px) saturate(1.35);
	      -webkit-backdrop-filter: blur(18px) saturate(1.35);
	    }

	    #wrapper[data-theme="dark"] #update-popover {
	      border-color: rgba(160, 210, 255, 0.28);
	      background: linear-gradient(180deg, rgba(24, 25, 32, 0.72), rgba(24, 25, 32, 0.46));
	      box-shadow: 0 18px 42px -20px rgba(0, 0, 0, 0.72), 0 0 0 1px rgba(160, 210, 255, 0.14) inset;
	    }

	    #wrapper[data-theme="dark"] #update-popover::before {
	      border-color: rgba(160, 210, 255, 0.28);
	      background: rgba(24, 25, 32, 0.66);
	    }

	    #update-popover.show {
	      display: flex;
	    }

	    #update-popover-row {
	      display: flex;
	      flex-direction: column;
	      align-items: center;
	      gap: 10px;
	    }

	    #update-popover-actions {
	      width: 100%;
	    }

	    #update-popover-actions .update-button {
	      width: 100%;
	    }

	    #version-label {
	      display: block;
	      color: var(--memo-muted-text-color);
	      font: 700 13px/1.2 system-ui, -apple-system, sans-serif;
	      letter-spacing: 0;
	      user-select: none;
	    }

	    .update-button {
	      min-height: 28px;
	      border: 1px solid rgba(128, 134, 139, 0.22);
	      border-radius: 999px;
	      background: rgba(255, 255, 255, 0.64);
	      color: var(--memo-text-color);
	      cursor: pointer;
	      padding: 0 12px;
	      font: 600 12px/1 system-ui, -apple-system, sans-serif;
	      transition: transform 0.16s, background-color 0.16s, border-color 0.16s;
	    }

	    .update-button:hover:not(:disabled) {
	      transform: translateY(-1px);
	      border-color: rgba(60, 64, 67, 0.28);
	      background: rgba(255, 255, 255, 0.86);
	    }

	    .update-button.primary {
	      border-color: transparent;
	      background: var(--memo-action-bg);
	      color: var(--memo-action-color);
	    }

	    .update-button:disabled {
	      cursor: not-allowed;
	      opacity: 0.55;
	    }

	    #update-status,
	    #update-changelog {
	      box-sizing: border-box;
	      width: 100%;
	      color: var(--memo-muted-text-color);
	      font: 12px/1.45 system-ui, -apple-system, sans-serif;
	    }

	    #update-status {
	      min-height: 17px;
	    }

	    #update-status.error {
	      color: #b3261e;
	    }

	    #update-status.success {
	      color: #137333;
	    }

	    #wrapper[data-theme="dark"] #update-status.error {
	      color: #ffb4ab;
	    }

	    #wrapper[data-theme="dark"] #update-status.success {
	      color: #8bd58f;
	    }

	    #update-changelog {
	      display: none;
	      max-height: 70px;
	      overflow: auto;
	      white-space: pre-wrap;
	      border-left: 2px solid var(--memo-input-border);
	      padding-left: 8px;
	    }

	    #update-changelog.show {
	      display: block;
	    }

    /* 调整边缘 Resizers */
    .resizer {
      position: absolute;
      z-index: 100;
      background: transparent;
      touch-action: none;
      user-select: none;
    }
	    .resizer-l { left: 0; top: 0; bottom: 0; width: 8px; cursor: ew-resize; }
	    .resizer-b { bottom: 0; left: 0; right: 0; height: 8px; cursor: ns-resize; }
	    .resizer-bl { bottom: 0; left: 0; width: 16px; height: 16px; cursor: nesw-resize; }

    #drag-guard {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      background: transparent;
      pointer-events: auto;
      touch-action: none;
      user-select: none;
    }

    #drag-guard.active {
      display: block;
    }
    `;
  shadow.appendChild(style);

  // 构建 HTML 结构
  const wrapper = document.createElement('div');
  wrapper.id = 'wrapper';
    wrapper.innerHTML = `
    <div id="drag-guard"></div>
      <div id="float-btn">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.0001 1.6001C12.0001 7.34385 16.6563 12.0001 22.4001 12.0001C16.6563 12.0001 12.0001 16.6563 12.0001 22.4001C12.0001 16.6563 7.34385 12.0001 1.6001 12.0001C7.34385 12.0001 12.0001 7.34385 12.0001 1.6001Z" fill="url(#gemini-gradient)" />
        <defs>
          <linearGradient id="gemini-gradient" x1="1.6" y1="12" x2="22.4" y2="12" gradientUnits="userSpaceOnUse">
            <stop stop-color="#1A73E8" />
            <stop offset="0.5" stop-color="#A142F4" />
            <stop offset="1" stop-color="#E8406E" />
          </linearGradient>
        </defs>
      </svg>
    </div>

	    <div id="update-popover" aria-hidden="true">
	      <div id="update-popover-row">
	        <span id="version-label">--</span>
	        <div id="update-popover-actions">
	          <button id="check-update-btn" class="update-button" type="button">检查更新</button>
	          <button id="update-now-btn" class="update-button primary" type="button" hidden>立即更新</button>
	        </div>
	      </div>
	      <div id="update-status" role="status" aria-live="polite"></div>
	      <div id="update-changelog"></div>
	    </div>

    <div id="panel" class="glass-panel">
      <canvas id="bg-canvas"></canvas>
      
	      <div class="resizer resizer-l" data-dir="l"></div>
	      <div class="resizer resizer-b" data-dir="b"></div>
	      <div class="resizer resizer-bl" data-dir="bl"></div>
	      
	      <div id="download-dialog" aria-hidden="true">
	        <div class="download-box" role="dialog" aria-modal="true" aria-labelledby="download-title">
	          <p id="download-title" class="download-title"></p>
	          <div class="download-row">
	            <input id="download-name-input" type="text" autocomplete="off" spellcheck="false" aria-label="文件名">
	            <span id="download-extension" aria-label="文件格式"></span>
	          </div>
	          <div class="download-actions">
	            <button id="download-cancel" type="button">取消</button>
	            <button id="download-confirm" type="button">下载</button>
	          </div>
	        </div>
	      </div>

	      <textarea id="editor" spellcheck="false" placeholder=""></textarea>
    </div>
  `;
  shadow.appendChild(wrapper);

    const floatBtn = shadow.getElementById('float-btn');
	    const panel = shadow.getElementById('panel');
	    const editor = shadow.getElementById('editor');
	    const canvas = shadow.getElementById('bg-canvas');
	    const dragGuard = shadow.getElementById('drag-guard');
	    const downloadDialog = shadow.getElementById('download-dialog');
	    const downloadNameInput = shadow.getElementById('download-name-input');
	    const downloadExtension = shadow.getElementById('download-extension');
	    const downloadCancel = shadow.getElementById('download-cancel');
	    const downloadConfirm = shadow.getElementById('download-confirm');
	    const updatePopover = shadow.getElementById('update-popover');
	    const versionLabel = shadow.getElementById('version-label');
	    const checkUpdateBtn = shadow.getElementById('check-update-btn');
	    const updateNowBtn = shadow.getElementById('update-now-btn');
	    const updateStatus = shadow.getElementById('update-status');
	    const updateChangelog = shadow.getElementById('update-changelog');
  const ctx = canvas.getContext('2d');

  // ==================== 状态管理与防抖同步 ====================
	  let state = {
	    x: window.innerWidth - 100,
	    y: 100,
	    w: 380,
		    h: 350,
		    panelRight: 0,
		    isOpen: false,
		    theme: 'light',
		    themeUpdatedAt: 0,
		    content: '',
		    contentUpdatedAt: 0
		  };
		  let isComposing = false;
		  let pendingContentSync = null;
		  let particleColor = '218,218,240';
		  let panelCloseTimer = null;

	  const saveState = debounce(() => {
	    chrome.storage.local.get([STORAGE_KEY], (res) => {
	      const stored = res[STORAGE_KEY] || {};
		      const storedContentUpdatedAt = getContentUpdatedAt(stored);
		      const localContentUpdatedAt = getContentUpdatedAt(state);
		      const contentSource = storedContentUpdatedAt > localContentUpdatedAt ? stored : state;
		      const storedThemeUpdatedAt = getThemeUpdatedAt(stored);
		      const localThemeUpdatedAt = getThemeUpdatedAt(state);
		      const themeSource = storedThemeUpdatedAt > localThemeUpdatedAt ? stored : state;

		      chrome.storage.local.set({
		        [STORAGE_KEY]: {
		          ...stored,
	          x: state.x,
	          y: state.y,
	          w: state.w,
		          h: state.h,
		          panelRight: state.panelRight,
		          isOpen: state.isOpen,
		          theme: normalizeTheme(themeSource.theme),
		          themeUpdatedAt: getThemeUpdatedAt(themeSource),
		          content: contentSource.content || '',
		          contentUpdatedAt: getContentUpdatedAt(contentSource)
		        }
	      });
	    });
	  }, 100);

	  function updateLayout() {
	    wrapper.style.left = `${state.x}px`;
		    wrapper.style.top = `${state.y}px`;
	    panel.style.width = `${state.w}px`;
	    panel.style.height = `${state.h}px`;
	    panel.style.right = `${state.panelRight}px`;
	    wrapper.dataset.theme = normalizeTheme(state.theme);
	    syncParticleColor();
	    
	    if (state.isOpen) {
	      panel.classList.remove('closing');
	      panel.classList.add('show');
	    } else {
	      panel.classList.remove('show');
	    }
	  }

		  function getContentUpdatedAt(source) {
		    return typeof source.contentUpdatedAt === 'number' ? source.contentUpdatedAt : 0;
		  }

		  function getThemeUpdatedAt(source) {
		    return typeof source.themeUpdatedAt === 'number' ? source.themeUpdatedAt : 0;
		  }

		  function normalizeTheme(theme) {
		    return theme === 'dark' ? 'dark' : 'light';
		  }

		  function syncParticleColor() {
		    particleColor = getComputedStyle(wrapper).getPropertyValue('--memo-particle-color').trim() || '218,218,240';
		  }

		  function nextContentUpdatedAt() {
		    const pendingContentUpdatedAt = pendingContentSync ? pendingContentSync.contentUpdatedAt : 0;
		    return Math.max(Date.now(), getContentUpdatedAt(state) + 1, pendingContentUpdatedAt + 1);
		  }

		  function nextThemeUpdatedAt() {
		    return Math.max(Date.now(), getThemeUpdatedAt(state) + 1);
		  }

	  function isEditorFocused() {
	    return shadow.activeElement === editor;
	  }

	  function setEditorValuePreservingSelection(nextContent) {
	    const hadFocus = isEditorFocused();
	    const selectionStart = editor.selectionStart;
	    const selectionEnd = editor.selectionEnd;
	    const selectionDirection = editor.selectionDirection;

	    editor.value = nextContent;

	    if (hadFocus) {
	      const max = nextContent.length;
	      editor.setSelectionRange(
	        Math.min(selectionStart, max),
	        Math.min(selectionEnd, max),
	        selectionDirection
	      );
	    }
	  }

	  function applySyncedContent(nextContent, contentUpdatedAt) {
	    const normalizedContent = typeof nextContent === 'string' ? nextContent : '';

	    if (editor.value !== normalizedContent) {
	      setEditorValuePreservingSelection(normalizedContent);
	    }

	    state.content = normalizedContent;
	    state.contentUpdatedAt = contentUpdatedAt;
	  }

	  function handleIncomingContent(newVal) {
	    const incomingContentUpdatedAt = getContentUpdatedAt(newVal);
	    const localContentUpdatedAt = getContentUpdatedAt(state);
	    const incomingContent = typeof newVal.content === 'string' ? newVal.content : '';

	    if (incomingContentUpdatedAt < localContentUpdatedAt) return;

	    if (incomingContentUpdatedAt === localContentUpdatedAt) {
	      if (incomingContent === state.content) {
	        state.content = incomingContent;
	      }
	      return;
	    }

	    if (editor.value === incomingContent) {
	      state.content = incomingContent;
	      state.contentUpdatedAt = incomingContentUpdatedAt;
	      pendingContentSync = null;
	      return;
	    }

	    if (isEditorFocused() || isComposing) {
	      pendingContentSync = {
	        content: incomingContent,
	        contentUpdatedAt: incomingContentUpdatedAt
	      };
	      return;
	    }

	    pendingContentSync = null;
	    applySyncedContent(incomingContent, incomingContentUpdatedAt);
	  }

	  function applyPendingContentSync() {
	    if (!pendingContentSync || isComposing) return;

	    const pending = pendingContentSync;
	    pendingContentSync = null;

	    if (pending.contentUpdatedAt > getContentUpdatedAt(state)) {
	      applySyncedContent(pending.content, pending.contentUpdatedAt);
	    }
	  }

		  function recordEditorContent(nextContent) {
		    state.content = nextContent;
		    state.contentUpdatedAt = nextContentUpdatedAt();
		    pendingContentSync = null;
		    saveState();
		  }

		  function handleIncomingTheme(newVal) {
		    const incomingThemeUpdatedAt = getThemeUpdatedAt(newVal);
		    if (incomingThemeUpdatedAt < getThemeUpdatedAt(state)) return;

		    state.theme = normalizeTheme(newVal.theme);
		    state.themeUpdatedAt = incomingThemeUpdatedAt;
		  }

		  function toggleTheme() {
		    state.theme = normalizeTheme(state.theme) === 'dark' ? 'light' : 'dark';
		    state.themeUpdatedAt = nextThemeUpdatedAt();
		    updateLayout();
		    saveState();
		  }

  // 初始化加载
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    if (res[STORAGE_KEY]) {
      const saved = res[STORAGE_KEY];
      state.w = Math.max(MIN_WIDTH, saved.w || 380);
      state.h = Math.max(MIN_HEIGHT, saved.h || 350);
	      state.panelRight = saved.panelRight || 0;
	      state.isOpen = saved.isOpen || false;
	      state.theme = normalizeTheme(saved.theme);
	      state.themeUpdatedAt = getThemeUpdatedAt(saved);
	      state.content = saved.content || '';
	      state.contentUpdatedAt = getContentUpdatedAt(saved);

	      // 防止主包装越界
      const maxLeft = window.innerWidth - 56 - 20;
      const maxTop = window.innerHeight - 56 - 20;
      state.x = Math.min(Math.max(20, saved.x || window.innerWidth - 100), maxLeft);
      state.y = Math.min(Math.max(20, saved.y || 100), maxTop);
    }
    updateLayout();
	    applySyncedContent(state.content, state.contentUpdatedAt);
    
    // 初始化时确切获取到了面板设定尺寸后再生成粒子，避免出现集中在左上角的现象
    initParticles();

    // 初始化时如果面板是打开状态，则启动粒子动画
    if (state.isOpen) {
      drawParticles();
    }
  });

  // 跨页同步监听
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      const newVal = changes[STORAGE_KEY].newValue;
      if (!newVal) return;
	      
	      handleIncomingContent(newVal);
	      handleIncomingTheme(newVal);
	      
	      if (!isAiDragging && !isResizing) {
        state.x = newVal.x; 
        state.y = newVal.y;
        state.w = newVal.w; 
        state.h = newVal.h;
        state.panelRight = newVal.panelRight;
        state.isOpen = newVal.isOpen;
        updateLayout();
        
        // 跨页同步面板状态时，控制动画启停
        if (state.isOpen && !animationId) {
            drawParticles();
        }
      }
    }
  });

	  function stopInputEventPropagation(e) {
	    e.stopPropagation();
	  }

	  function isolateInputEvents(inputElement) {
	    [
	      'keydown',
	      'keyup',
	      'keypress',
	      'beforeinput',
	      'input',
	      'compositionstart',
	      'compositionupdate',
	      'compositionend',
	      'paste',
	      'copy',
	      'cut'
	    ].forEach((eventName) => {
	      inputElement.addEventListener(eventName, stopInputEventPropagation, true);
	    });
	  }

	  isolateInputEvents(editor);
	  isolateInputEvents(downloadNameInput);

	  editor.addEventListener('compositionstart', () => {
	    isComposing = true;
	  });

	  editor.addEventListener('compositionend', (e) => {
	    isComposing = false;
	    // 选定汉字后，更新状态并触发保存
	    recordEditorContent(e.target.value);
	  });

	  editor.addEventListener('input', (e) => {
	    // 如果处于拼音合成状态，则不执行任何操作；否则正常更新并保存
	    if (!isComposing) {
	      recordEditorContent(e.target.value);
	    }
	  });

	  editor.addEventListener('blur', applyPendingContentSync);

    // ==================== 拖拽与缩放逻辑 ====================
    let isAiDragging = false;
    let isAiMoved = false;
    let isResizing = false;
    let initialAiX, initialAiY;
    let activePointerId = null;
    let activePointerTarget = null;
    let activePointerMove = null;
    let activePointerEnd = null;
    let activePointerCancel = null;
    let previousUserSelect = '';
    let previousWebkitUserSelect = '';
    const pointerListenerOptions = { capture: true };

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function setPointerCaptureSafely(target, pointerId) {
      if (!target.setPointerCapture) return;
      try {
        target.setPointerCapture(pointerId);
      } catch (_) {
        // 页面可能在 capture 建立前取消 pointer 流。
      }
    }

    function releasePointerCaptureSafely(target, pointerId) {
      if (!target.releasePointerCapture) return;
      try {
        target.releasePointerCapture(pointerId);
      } catch (_) {
        // pointercancel 或窗口失焦后，忽略已失效的 pointerId。
      }
    }

    function beginPointerInteraction(e, target, onMove, onEnd, cursor) {
      if (activePointerId !== null) return false;

      activePointerId = e.pointerId;
      activePointerTarget = target;
      previousUserSelect = document.documentElement.style.userSelect;
      previousWebkitUserSelect = document.documentElement.style.webkitUserSelect;
      document.documentElement.style.userSelect = 'none';
      document.documentElement.style.webkitUserSelect = 'none';

      dragGuard.style.cursor = cursor;
      dragGuard.classList.add('active');
      setPointerCaptureSafely(target, activePointerId);

      activePointerMove = (ev) => {
        if (ev.pointerId !== activePointerId) return;
        onMove(ev);
      };

      activePointerEnd = (ev) => {
        if (ev.pointerId !== activePointerId) return;
        onEnd();
        cleanupPointerInteraction();
      };

      activePointerCancel = () => {
        onEnd();
        cleanupPointerInteraction();
      };

      window.addEventListener('pointermove', activePointerMove, pointerListenerOptions);
      window.addEventListener('pointerup', activePointerEnd, pointerListenerOptions);
      window.addEventListener('pointercancel', activePointerEnd, pointerListenerOptions);
      window.addEventListener('blur', activePointerCancel, { once: true });
      return true;
    }

    function cleanupPointerInteraction() {
      if (activePointerTarget && activePointerId !== null) {
        releasePointerCaptureSafely(activePointerTarget, activePointerId);
      }

      window.removeEventListener('pointermove', activePointerMove, pointerListenerOptions);
      window.removeEventListener('pointerup', activePointerEnd, pointerListenerOptions);
      window.removeEventListener('pointercancel', activePointerEnd, pointerListenerOptions);
      window.removeEventListener('blur', activePointerCancel);

      dragGuard.classList.remove('active');
      dragGuard.style.cursor = '';
      document.documentElement.style.userSelect = previousUserSelect;
      document.documentElement.style.webkitUserSelect = previousWebkitUserSelect;

      activePointerId = null;
      activePointerTarget = null;
      activePointerMove = null;
      activePointerEnd = null;
      activePointerCancel = null;
    }

    // 1. 拖拽主容器 (仅悬浮按钮)
    function startAiDragEvent(e) {
      if (e.button !== 0) return;
      if (e.target.classList.contains('resizer')) return;

      e.stopPropagation();
      isAiMoved = false;
      isAiDragging = false;
      wrapper.style.transition = '';

      const rect = wrapper.getBoundingClientRect();
      initialAiX = e.clientX - rect.left;
      initialAiY = e.clientY - rect.top;

      let latestX = e.clientX;
      let latestY = e.clientY;
      let dragFrame = null;

	      const applyDrag = () => {
	        dragFrame = null;
	        clearClickSequence();
	        isAiDragging = true;
	        isAiMoved = true;
        state.x = latestX - initialAiX;
        state.y = latestY - initialAiY;

        wrapper.style.left = state.x + 'px';
        wrapper.style.top = state.y + 'px';
      };

      const moveDrag = (ev) => {
        ev.preventDefault();
        latestX = ev.clientX;
        latestY = ev.clientY;

        if (dragFrame === null) {
          dragFrame = requestAnimationFrame(applyDrag);
        }
      };

      const endDrag = () => {
        if (dragFrame !== null) {
          cancelAnimationFrame(dragFrame);
          applyDrag();
        }

        // 屏幕边缘回弹保护
        const rect = wrapper.getBoundingClientRect();
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const padding = 20;

        let newLeft = state.x;
        let newTop = state.y;
        let overBounds = false;

        if (newLeft < padding) { newLeft = padding; overBounds = true; }
        if (newTop < padding) { newTop = padding; overBounds = true; }
        if (newLeft + rect.width > screenW - padding) { newLeft = screenW - rect.width - padding; overBounds = true; }
        if (newTop + rect.height > screenH - padding) { newTop = screenH - rect.height - padding; overBounds = true; }

        if (overBounds) {
          wrapper.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
          state.x = newLeft;
          state.y = newTop;
          wrapper.style.left = newLeft + 'px';
          wrapper.style.top = newTop + 'px';

          setTimeout(() => {
            wrapper.style.transition = '';
          }, 300);
        }

        setTimeout(() => {
          isAiDragging = false;
          if (isAiMoved) saveState();
        }, 0);
      };

      if (!beginPointerInteraction(e, floatBtn, moveDrag, endDrag, 'grabbing')) {
        return;
      }
    }

    floatBtn.addEventListener('pointerdown', startAiDragEvent);

	  // 2. 展开、收起与双击切换主题
	  let clickSequenceCount = 0;
	  let clickSequenceTimer = null;

	  function clearClickSequence() {
	    if (clickSequenceTimer !== null) {
	      clearTimeout(clickSequenceTimer);
	    }

	    clickSequenceCount = 0;
	    clickSequenceTimer = null;
	  }

	  function clearPanelClosingAnimation() {
	    if (panelCloseTimer !== null) {
	      clearTimeout(panelCloseTimer);
	      panelCloseTimer = null;
	    }
	    panel.classList.remove('closing');
	  }

	  function playPanelCloseAnimation() {
	    clearPanelClosingAnimation();
	    void panel.offsetWidth;
	    panel.classList.add('closing');
	    panelCloseTimer = setTimeout(() => {
	      panel.classList.remove('closing');
	      panelCloseTimer = null;
	    }, 300);
	  }

	  function showPanel() {
	    clearPanelClosingAnimation();
	    state.isOpen = true;
	    updateLayout();
	    saveState();

	    if (!animationId) {
	      drawParticles();
	    }
	  }

	  function togglePanel() {
	    if (state.isOpen) {
	      hideDownloadDialog();
	      playPanelCloseAnimation();
	      state.isOpen = false;
	      updateLayout();
	      saveState();
	      return;
	    } else {
	      showPanel();
	    }
	  }

	  function flushClickSequence() {
	    const count = clickSequenceCount;
	    clearClickSequence();

	    if (count >= 2) {
	      toggleTheme();
	      if (!state.isOpen) {
	        showPanel();
	      }
	      return;
	    }

	    for (let i = 0; i < count; i++) {
	      togglePanel();
	    }
	  }

	  floatBtn.addEventListener('click', () => {
	    if (isAiMoved) return;

	    clickSequenceCount += 1;

	    if (clickSequenceTimer !== null) {
	      clearTimeout(clickSequenceTimer);
	    }

	    if (clickSequenceCount >= 2) {
	      flushClickSequence();
	      return;
	    }

	    clickSequenceTimer = setTimeout(flushClickSequence, CLICK_SEQUENCE_DELAY);
	  });

	  floatBtn.addEventListener('contextmenu', (e) => {
	    e.preventDefault();
	    e.stopPropagation();
	    clearClickSequence();
	    showUpdatePopover();
	  });

	  ['pointerdown', 'click', 'contextmenu'].forEach((eventName) => {
	    updatePopover.addEventListener(eventName, (e) => {
	      e.stopPropagation();
	    });
	  });

	  function hideUpdatePopoverForPageAction(e) {
	    hideUpdatePopover();
	  }

	  document.addEventListener('pointerdown', hideUpdatePopoverForPageAction);
	  document.addEventListener('click', hideUpdatePopoverForPageAction);

	  document.addEventListener('keydown', (e) => {
	    if (e.key === 'Escape') {
	      hideUpdatePopover();
	    }
	  }, true);

    // 3. 拖拽调整大小 (仅允许 l, b, bl)
    function startPanelResize(e, dir) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      isResizing = true;
      panel.style.transition = 'none';

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = state.w;
      const startH = state.h;
      let latestX = startX;
      let latestY = startY;
      let resizeFrame = null;

      function applyResize() {
        resizeFrame = null;
        let newW = startW;
        let newH = startH;

        if (dir.includes('l')) {
          newW = startW + (startX - latestX);
        }
        if (dir.includes('b')) {
          newH = startH + (latestY - startY);
        }

        newW = clamp(newW, MIN_WIDTH, 800);
        newH = clamp(newH, MIN_HEIGHT, 800);

        state.w = newW;
        state.h = newH;

        panel.style.width = newW + 'px';
        panel.style.height = newH + 'px';
      }

      function doResize(ev) {
        ev.preventDefault();
        latestX = ev.clientX;
        latestY = ev.clientY;

        if (resizeFrame === null) {
          resizeFrame = requestAnimationFrame(applyResize);
        }
      }

      function stopResize() {
        if (resizeFrame !== null) {
          cancelAnimationFrame(resizeFrame);
          applyResize();
        }

        isResizing = false;
        panel.style.transition = '';
        saveState();
      }

      const cursor = dir === 'l' ? 'ew-resize' : dir === 'b' ? 'ns-resize' : 'nesw-resize';
      if (!beginPointerInteraction(e, e.currentTarget, doResize, stopResize, cursor)) {
        isResizing = false;
        panel.style.transition = '';
      }
    }

    shadow.querySelectorAll('.resizer').forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        startPanelResize(e, handle.dataset.dir);
      });
    });

  // ==================== 动效与视觉交互 ====================

	  let particles = [];
	  const PARTICLE_COUNT = 99;
	  let animationId = null;
	  let mouseNode = { x: null, y: null, max: 20000 };

  function initParticles() {
    canvas.width = panel.clientWidth || state.w || MIN_WIDTH;
    canvas.height = panel.clientHeight || state.h || MIN_HEIGHT;
    particles = [];
    for (let p = 0; p < PARTICLE_COUNT; p++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        xa: 2 * Math.random() - 1,
        ya: 2 * Math.random() - 1,
        max: 6000
      });
    }
  }

  function drawParticles() {
    if (!state.isOpen) {
      cancelAnimationFrame(animationId);
      animationId = null;
      return;
    }

    animationId = requestAnimationFrame(drawParticles);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 渲染节点
	    ctx.fillStyle = "rgba(" + particleColor + ", 0.8)";
    let allNodes = [mouseNode].concat(particles);

    particles.forEach(function (i) {
      i.x += i.xa;
      i.y += i.ya;

      // 碰壁反弹
      i.xa *= (i.x > canvas.width || i.x < 0) ? -1 : 1;
      i.ya *= (i.y > canvas.height || i.y < 0) ? -1 : 1;

      // 绘制粒子
      ctx.fillRect(i.x - 0.5, i.y - 0.5, 1, 1);

      for (let v = 0; v < allNodes.length; v++) {
        let x = allNodes[v];
        if (i !== x && x.x !== null && x.y !== null) {
          let dx = i.x - x.x;
          let dy = i.y - x.y;
          let distSq = dx * dx + dy * dy;

          if (distSq < x.max) {
            // 鼠标交互引力
            if (x === mouseNode && distSq >= x.max / 2) {
              i.x -= 0.03 * dx;
              i.y -= 0.03 * dy;
            }

            let ratio = (x.max - distSq) / x.max;
            ctx.beginPath();
            ctx.lineWidth = ratio / 2;
	            ctx.strokeStyle = "rgba(" + particleColor + "," + (ratio + 0.2) + ")";
            ctx.moveTo(i.x, i.y);
            ctx.lineTo(x.x, x.y);
            ctx.stroke();
          }
        }
      }
      allNodes.splice(allNodes.indexOf(i), 1);
    });
  }

  // 面板内鼠标跟踪
  panel.addEventListener('mousemove', function(e) {
    const rect = panel.getBoundingClientRect();
    mouseNode.x = e.clientX - rect.left;
    mouseNode.y = e.clientY - rect.top;
  });

  // 鼠标移出面板时清除吸附节点
  panel.addEventListener('mouseleave', function() {
    mouseNode.x = null;
    mouseNode.y = null;
  });

  const resizeObserver = new ResizeObserver(debounce(() => {
    if (state.isOpen) {
      canvas.width = panel.clientWidth;
      canvas.height = panel.clientHeight;
      // 注意：尺寸变化不重置粒子数组，保持平滑过度
    }
  }, 100));
  
  resizeObserver.observe(panel);
  
  // ==================== 业务逻辑与快捷键 ====================

	  const UPDATE_MESSAGE_TYPES = {
	    STATUS: 'float-updater:get-status',
	    CHECK: 'float-updater:check',
	    UPDATE: 'float-updater:update'
	  };
	  let latestUpdatePayload = null;
	  let latestNativeHostInfo = null;

	  function setUpdateStatus(message, type) {
	    updateStatus.textContent = message || '';
	    updateStatus.classList.toggle('error', type === 'error');
	    updateStatus.classList.toggle('success', type === 'success');
	  }

	  function syncUpdateActionVisibility() {
	    const shouldShow = Boolean(latestUpdatePayload);
	    checkUpdateBtn.hidden = shouldShow;
	    updateNowBtn.hidden = !shouldShow;
	  }

	  function setUpdateBusy(isBusy) {
	    checkUpdateBtn.disabled = isBusy;
	    syncUpdateActionVisibility();
	    updateNowBtn.disabled = isBusy || !latestUpdatePayload || (latestNativeHostInfo && latestNativeHostInfo.ok === false);
	  }

	  function setUpdateChangelog(changelog) {
	    const normalized = String(changelog || '').trim();
	    updateChangelog.textContent = normalized;
	    updateChangelog.classList.toggle('show', Boolean(normalized));
	  }

	  function sendUpdateMessage(type, payload) {
	    return new Promise((resolve, reject) => {
	      chrome.runtime.sendMessage({ type, payload }, (response) => {
	        const lastError = chrome.runtime.lastError;
	        if (lastError) {
	          reject(new Error(lastError.message || '扩展后台通信失败。'));
	          return;
	        }
	        resolve(response);
	      });
	    });
	  }

	  function updateVersionLabel(version) {
	    const currentVersion = version || (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '--';
	    versionLabel.textContent = currentVersion;
	  }

	  function showUpdatePopover() {
	    updateVersionLabel();
	    updatePopover.classList.add('show');
	    updatePopover.setAttribute('aria-hidden', 'false');
	  }

	  function hideUpdatePopover() {
	    updatePopover.classList.remove('show');
	    updatePopover.setAttribute('aria-hidden', 'true');
	  }

	  async function initUpdaterUi() {
	    updateVersionLabel();

	    try {
	      const result = await sendUpdateMessage(UPDATE_MESSAGE_TYPES.STATUS);
	      if (result && result.ok) {
	        updateVersionLabel(result.version);
	      }
	    } catch (_) {
	      setUpdateStatus('更新后台未就绪，请重新加载扩展后再试。', 'error');
	    }
	  }

	  async function checkForUpdate() {
	    latestUpdatePayload = null;
	    latestNativeHostInfo = null;
	    syncUpdateActionVisibility();
	    showUpdatePopover();
	    setUpdateChangelog('');
	    setUpdateStatus('正在检查更新...', '');
	    setUpdateBusy(true);

	    try {
	      const result = await sendUpdateMessage(UPDATE_MESSAGE_TYPES.CHECK);

	      if (!result || !result.ok) {
	        setUpdateStatus((result && result.message) || '检查更新失败。', 'error');
	        return;
	      }

	      updateVersionLabel(result.currentVersion || result.version);

	      if (!result.updateAvailable) {
	        setUpdateStatus(result.isDowngrade ? '当前版本高于 latest.json 中的版本。' : '当前已经是最新版本。', 'success');
	        return;
	      }

	      latestUpdatePayload = result.latest;
	      latestNativeHostInfo = result.nativeHost;
	      syncUpdateActionVisibility();
	      showPanel();
	      setUpdateChangelog(result.latest.changelog);

	      if (latestNativeHostInfo && latestNativeHostInfo.ok === false) {
	        setUpdateStatus(`发现 ${result.latest.version}，但 updater 不可用：${latestNativeHostInfo.message}`, 'error');
	        return;
	      }

	      if (latestNativeHostInfo && latestNativeHostInfo.extensionDir) {
	        latestUpdatePayload.extensionDir = latestNativeHostInfo.extensionDir;
	      }

	      setUpdateStatus(`发现新版本 ${result.latest.version}。`, '');
	    } catch (error) {
	      setUpdateStatus(error.message || '检查更新失败。', 'error');
	    } finally {
	      setUpdateBusy(false);
	    }
	  }

	  async function updateNow() {
	    if (!latestUpdatePayload) {
	      showUpdatePopover();
	      setUpdateStatus('请先检查更新。', 'error');
	      return;
	    }

	    showUpdatePopover();
	    setUpdateStatus('正在下载并安装更新...', '');
	    setUpdateBusy(true);

	    try {
	      const result = await sendUpdateMessage(UPDATE_MESSAGE_TYPES.UPDATE, {
	        latest: latestUpdatePayload,
	        extensionDir: latestUpdatePayload.extensionDir || ''
	      });

	      if (!result || !result.ok) {
	        setUpdateStatus((result && result.message) || '更新失败。', 'error');
	        return;
	      }

	      setUpdateStatus('更新成功，正在重新加载插件并刷新页面。', 'success');
	      latestUpdatePayload = null;
	      latestNativeHostInfo = null;
	      syncUpdateActionVisibility();
	      setTimeout(() => {
	        window.location.reload();
	      }, 1200);
	    } catch (error) {
	      setUpdateStatus(error.message || '更新失败。', 'error');
	    } finally {
	      setUpdateBusy(false);
	    }
	  }

	  initUpdaterUi();
	  checkUpdateBtn.addEventListener('click', checkForUpdate);
	  updateNowBtn.addEventListener('click', updateNow);

	  function detectFormat(text) {
	    const t = text.trim();
	    if (!t) return 'txt';
	    if (/<(?:!doctype|html)\b/i.test(t)) return 'html';
	    if (isReactCode(t)) return 'react';
	    if (t.startsWith('{') || t.startsWith('[')) {
	      try {
	        JSON.parse(t);
	        return 'json';
	      } catch (_) {
	        // 不是合法 JSON 时继续按其他文本格式识别。
	      }
	    }
	    if (isMarkdownText(t)) return 'md';
	    return 'txt';
	  }

	  function isReactCode(text) {
	    if (!text) return false;

	    return (
	      /\bfrom\s+['"]react(?:\/[^'"]*)?['"]/.test(text) ||
	      /\bReactDOM\b|\bcreateRoot\s*\(/.test(text) ||
	      /\buse(State|Effect|Memo|Ref|Callback|Reducer|Context|LayoutEffect)\s*\(/.test(text) ||
	      /<[A-Z][A-Za-z0-9_.$-]*(\s|>|\/)/.test(text) ||
	      /return\s*\(?\s*<[a-zA-Z][\w:.-]*(\s|>|\/)/.test(text) ||
	      /=>\s*\(?\s*<[a-zA-Z][\w:.-]*(\s|>|\/)/.test(text)
	    );
	  }

		  function escapeHtml(value) {
		    return String(value)
		      .replace(/&/g, '&amp;')
		      .replace(/</g, '&lt;')
		      .replace(/>/g, '&gt;')
		      .replace(/"/g, '&quot;')
		      .replace(/'/g, '&#39;');
		  }

	  function isMarkdownText(text) {
	    if (!text) return false;

	    return (
	      /^#{1,6}\s+\S+/m.test(text) ||
	      /^>\s+\S+/m.test(text) ||
	      /^\s*[-*+]\s+\S+/m.test(text) ||
	      /^\s*\d+\.\s+\S+/m.test(text) ||
	      /```[\s\S]*```/.test(text) ||
	      /\[[^\]]+\]\([^)]+\)/.test(text) ||
	      /\*\*[^*\n]+\*\*/.test(text) ||
	      /`[^`\n]+`/.test(text) ||
	      /^\|.+\|\s*$/m.test(text)
	    );
	  }

	  function renderMarkdownInline(text) {
	    let html = escapeHtml(text);

	    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
	    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	    html = html.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
	    return html;
	  }

	  function parseMarkdownTableRow(line) {
	    return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
	  }

	  function buildMarkdownPreviewHtml(markdown) {
	    const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
	    let html = '';
	    let paragraph = [];
	    let listItems = [];
	    let listType = null;
	    let quoteLines = [];
	    let inCode = false;
	    let codeLanguage = '';
	    let codeLines = [];

	    function flushParagraph() {
	      if (!paragraph.length) return;
	      html += `<p>${renderMarkdownInline(paragraph.join(' '))}</p>`;
	      paragraph = [];
	    }

	    function flushList() {
	      if (!listItems.length) return;
	      const tag = listType === 'ol' ? 'ol' : 'ul';
	      html += `<${tag}>${listItems.map(item => `<li>${renderMarkdownInline(item)}</li>`).join('')}</${tag}>`;
	      listItems = [];
	      listType = null;
	    }

	    function flushQuote() {
	      if (!quoteLines.length) return;
	      html += `<blockquote>${quoteLines.map(line => `<p>${renderMarkdownInline(line)}</p>`).join('')}</blockquote>`;
	      quoteLines = [];
	    }

	    function flushCode() {
	      html += `<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
	      codeLanguage = '';
	      codeLines = [];
	    }

	    for (let i = 0; i < lines.length; i++) {
	      const line = lines[i];
	      const trimmed = line.trim();

	      if (/^```/.test(trimmed)) {
	        if (inCode) {
	          flushCode();
	          inCode = false;
	        } else {
	          flushParagraph();
	          flushList();
	          flushQuote();
	          inCode = true;
	          codeLanguage = trimmed.replace(/^```/, '').trim();
	        }
	        continue;
	      }

	      if (inCode) {
	        codeLines.push(line);
	        continue;
	      }

	      if (!trimmed) {
	        flushParagraph();
	        flushList();
	        flushQuote();
	        continue;
	      }

	      const tableSeparator = lines[i + 1] && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1]);
	      if (/^\s*\|.+\|\s*$/.test(line) && tableSeparator) {
	        flushParagraph();
	        flushList();
	        flushQuote();
	        const headers = parseMarkdownTableRow(line);
	        i += 2;
	        const rows = [];
	        while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
	          rows.push(parseMarkdownTableRow(lines[i]));
	          i += 1;
	        }
	        i -= 1;
	        html += `<table><thead><tr>${headers.map(cell => `<th>${renderMarkdownInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${renderMarkdownInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
	        continue;
	      }

	      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
	      if (heading) {
	        flushParagraph();
	        flushList();
	        flushQuote();
	        const level = heading[1].length;
	        html += `<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`;
	        continue;
	      }

	      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
	        flushParagraph();
	        flushList();
	        flushQuote();
	        html += '<hr>';
	        continue;
	      }

	      const quote = line.match(/^>\s?(.*)$/);
	      if (quote) {
	        flushParagraph();
	        flushList();
	        quoteLines.push(quote[1]);
	        continue;
	      }

	      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
	      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
	      if (unordered || ordered) {
	        flushParagraph();
	        flushQuote();
	        const nextType = ordered ? 'ol' : 'ul';
	        if (listType && listType !== nextType) flushList();
	        listType = nextType;
	        listItems.push((unordered || ordered)[1]);
	        continue;
	      }

	      flushList();
	      flushQuote();
	      paragraph.push(trimmed);
	    }

	    if (inCode) flushCode();
	    flushParagraph();
	    flushList();
	    flushQuote();

	    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Markdown Preview</title>
  <style>
    body {
      margin: 0;
      background: #f6f7fb;
      color: #202124;
      font: 16px/1.65 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 32px 24px 56px;
    }
    h1, h2, h3, h4, h5, h6 {
      line-height: 1.25;
      margin: 1.4em 0 0.55em;
    }
    h1 { font-size: 2rem; border-bottom: 1px solid #d9dee8; padding-bottom: 0.3em; }
    h2 { font-size: 1.5rem; border-bottom: 1px solid #e4e7ef; padding-bottom: 0.25em; }
    p, ul, ol, blockquote, pre, table {
      margin: 0 0 1em;
    }
    a { color: #1a73e8; }
    blockquote {
      border-left: 4px solid #b7c2d6;
      color: #526070;
      padding-left: 14px;
    }
    code {
      background: #e9edf5;
      border-radius: 4px;
      padding: 0.12em 0.35em;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
    pre {
      overflow: auto;
      background: #111827;
      color: #e5e7eb;
      border-radius: 8px;
      padding: 14px;
    }
    pre code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid #d9dee8;
      padding: 8px 10px;
      text-align: left;
    }
    th { background: #eef2f8; }
  </style>
</head>
<body>
  <main>${html || '<p></p>'}</main>
</body>
</html>`;
	  }

	  function serializeForScript(value) {
	    return JSON.stringify(value).replace(/</g, '\\u003C');
	  }

	  function escapeJsSingleQuotedString(value) {
	    return String(value)
	      .replace(/\\/g, '\\\\')
	      .replace(/'/g, "\\'")
	      .replace(/\r/g, '\\r')
	      .replace(/\n/g, '\\n');
	  }

	  function parseNamedImportSpecifiers(specifiers) {
	    return specifiers
	      .split(',')
	      .map(item => item.trim())
	      .filter(Boolean)
	      .map(item => {
	        const parts = item.split(/\s+as\s+/i).map(part => part.trim());
	        return {
	          imported: parts[0],
	          local: parts[1] || parts[0]
	        };
	      });
	  }

	  function isCssImportPath(importPath) {
	    return /\.css(?:\?|$)/.test(importPath);
	  }

	  function toPreviewStylesheetHref(importPath) {
	    if (/^https?:\/\//.test(importPath)) return importPath;
	    if (importPath.startsWith('//')) return `https:${importPath}`;
	    if (importPath.startsWith('.') || importPath.startsWith('/')) return null;
	    return `https://unpkg.com/${importPath}`;
	  }

		  function prepareReactSource(source) {
		    let prepared = source;
		    let defaultComponentName = null;
		    const unsupportedImports = [];
		    const stylesheetLinks = [];
		    const missingStyleImports = [];
		    const importPrelude = [];

		    function registerLucideReactImport(importClause) {
		      const namespaceMatch = importClause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
		      if (namespaceMatch) {
		        importPrelude.push(`const ${namespaceMatch[1]} = __ReactPreviewImports.lucideReact || {};`);
	      }

	      const namedMatch = importClause.match(/\{([\s\S]*?)\}/);
	      if (namedMatch) {
	        parseNamedImportSpecifiers(namedMatch[1]).forEach(({ imported, local }) => {
	          importPrelude.push(`const ${local} = (__ReactPreviewImports.lucideReact && __ReactPreviewImports.lucideReact.${imported}) || __ReactPreviewMissingIcon('${escapeJsSingleQuotedString(imported)}');`);
	        });
	      }

	      const withoutNamed = importClause.replace(/\{[\s\S]*?\}/, '').replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, '');
	      const defaultMatch = withoutNamed.match(/^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/);
	      if (defaultMatch) {
	        importPrelude.push(`const ${defaultMatch[1]} = __ReactPreviewImports.lucideReact || {};`);
		      }
		    }

		    function registerStyleImport(importPath) {
		      const href = toPreviewStylesheetHref(importPath);

		      if (href) {
		        stylesheetLinks.push(href);
		      } else {
		        missingStyleImports.push(importPath);
		      }
		    }

		    prepared = prepared.replace(/^\s*import\s+['"]([^'"]+)['"];?\s*$/gm, (_, importPath) => {
		      if (isCssImportPath(importPath)) {
		        registerStyleImport(importPath);
		      }

		      return '';
		    });
		    prepared = prepared.replace(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.css(?:\?[^'"]*)?)['"];?\s*$/gm, (_, localName, importPath) => {
		      registerStyleImport(importPath);
		      importPrelude.push(`const ${localName} = new Proxy({}, { get: (_, key) => String(key) });`);
		      return '';
		    });
		    prepared = prepared.replace(/^\s*import\s+[\s\S]*?\s+from\s+['"](?:react|react-dom|react-dom\/client)['"];?\s*/gm, '');
	    prepared = prepared.replace(/^\s*import\s+([\s\S]*?)\s+from\s+['"]lucide-react['"];?\s*/gm, (_, importClause) => {
	      registerLucideReactImport(importClause.trim());
	      return '';
	    });
	    prepared = prepared.replace(/^\s*import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*/gm, (statement) => {
	      unsupportedImports.push(statement.trim());
	      return '';
	    });

	    prepared = prepared.replace(/\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)/g, (_, name) => {
	      defaultComponentName = name;
	      return `function ${name}`;
	    });
	    prepared = prepared.replace(/\bexport\s+default\s+class\s+([A-Za-z_$][\w$]*)/g, (_, name) => {
	      defaultComponentName = name;
	      return `class ${name}`;
	    });
	    prepared = prepared.replace(/\bexport\s+default\s+function\s*\(/g, 'const __ReactPreviewDefault = function (');
	    prepared = prepared.replace(/\bexport\s+default\s+class\s*/g, 'const __ReactPreviewDefault = class ');
	    prepared = prepared.replace(/\bexport\s+default\s+/g, 'const __ReactPreviewDefault = ');
	    prepared = prepared.replace(/\bexport\s+(const|let|var|function|class)\s+/g, '$1 ');
	    prepared = prepared.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');

	    if (defaultComponentName) {
	      prepared += `\nconst __ReactPreviewDefault = ${defaultComponentName};`;
	    }

		    return {
		      source: prepared,
		      unsupportedImports,
		      stylesheetLinks,
		      missingStyleImports,
		      importPrelude
		    };
		  }

	  function buildReactPreviewHtml(source) {
	    const prepared = prepareReactSource(source);
	    const hasManualRender = /\b(createRoot|ReactDOM\.render|ReactDOM\.createRoot)\s*\(/.test(prepared.source);
	    const unsupportedImportMessage = prepared.unsupportedImports.length
	      ? `console.warn('React 预览暂时只内置 React/ReactDOM，已忽略这些 import：\\n${prepared.unsupportedImports.map(escapeJsSingleQuotedString).join('\\n')}');`
	      : '';
	    const stylesheetTags = prepared.stylesheetLinks
	      .map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
	      .join('\n  ');
	    const missingStyleWarning = prepared.missingStyleImports.length
	      ? `<div id="style-warning">这些本地样式文件无法在 blob 预览页中直接读取：${prepared.missingStyleImports.map(escapeHtml).join('，')}。如果样式仍不对，请把 CSS 改成远程 URL import，或把样式内容直接放进 React 代码生成的 style 标签里。</div>`
	      : '';
	    const sourceWithRuntime = `
		${unsupportedImportMessage}
const __ReactPreviewImports = window.__ReactPreviewImports || {};
const __ReactPreviewMissingIcon = window.__ReactPreviewMissingIcon;
${prepared.importPrelude.join('\n')}

		const {
		  Component,
	  Fragment,
	  PureComponent,
	  StrictMode,
	  Suspense,
	  createContext,
	  forwardRef,
	  lazy,
	  memo,
	  startTransition,
	  useCallback,
	  useContext,
	  useDeferredValue,
	  useEffect,
	  useId,
	  useImperativeHandle,
	  useLayoutEffect,
	  useMemo,
	  useReducer,
	  useRef,
	  useState,
	  useSyncExternalStore,
	  useTransition
	} = React;
	const createRoot = ReactDOM.createRoot.bind(ReactDOM);
	const ReactDOMClient = ReactDOM;

${prepared.source}

${hasManualRender ? '' : `
const __ReactPreviewComponent =
  typeof __ReactPreviewDefault !== 'undefined' ? __ReactPreviewDefault :
  typeof App !== 'undefined' ? App :
  typeof Main !== 'undefined' ? Main :
  typeof Preview !== 'undefined' ? Preview :
  null;

if (!__ReactPreviewComponent) {
  throw new Error('未找到可渲染组件：请定义 App/Main/Preview，使用 export default，或手动调用 createRoot(...).render(...)。');
}

createRoot(document.getElementById('root')).render(
  React.createElement(__ReactPreviewComponent)
);
`}
`;

	    return `<!DOCTYPE html>
<html>
<head>
	  <meta charset="utf-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1">
	  <title>HTML 预览</title>
	  ${stylesheetTags}
	  <script>
	    window.tailwind = window.tailwind || {};
	    window.tailwind.config = {
	      darkMode: 'class'
	    };
	  </script>
	  <script src="https://cdn.tailwindcss.com"></script>
	  <style>
    html, body, #root {
      min-height: 100%;
      margin: 0;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f7fb;
      color: #202124;
    }
	    #root {
	      box-sizing: border-box;
	      min-height: 100vh;
	    }
	    #error {
	      display: none;
      box-sizing: border-box;
      margin: 16px;
      padding: 14px 16px;
      border: 1px solid rgba(185, 28, 28, 0.25);
      border-radius: 8px;
      background: #fff5f5;
      color: #7f1d1d;
      white-space: pre-wrap;
	      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	    }
	    #style-warning {
	      box-sizing: border-box;
	      margin: 16px;
	      padding: 10px 12px;
	      border: 1px solid rgba(180, 83, 9, 0.24);
	      border-radius: 8px;
	      background: #fffbeb;
	      color: #92400e;
	      font: 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	    }
	  </style>
	</head>
	<body>
	  ${missingStyleWarning}
	  <div id="root"></div>
	  <pre id="error"></pre>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
	  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
		  <script id="react-preview-source" type="application/json">${serializeForScript(sourceWithRuntime)}</script>
		  <script>
		    const errorEl = document.getElementById('error');

		    function showError(error) {
		      const message = error && error.stack ? error.stack : String(error);
		      errorEl.style.display = 'block';
		      errorEl.textContent = message;
		      console.error(error);
		    }

	    function createMissingIcon(name) {
	      return function ReactPreviewMissingIcon(props) {
	        const {
	          size = 24,
	          color = 'currentColor',
	          strokeWidth = 2,
	          className,
	          style,
	          ...rest
	        } = props || {};
	        const label = String(name).replace(/[^A-Z0-9]/g, '').slice(0, 2) || '?';

	        return React.createElement(
	          'svg',
	          {
	            ...rest,
	            className,
	            style,
	            width: size,
	            height: size,
	            viewBox: '0 0 24 24',
	            fill: 'none',
	            stroke: color,
	            strokeWidth,
	            strokeLinecap: 'round',
	            strokeLinejoin: 'round',
	            role: 'img',
	            'aria-label': name
	          },
	          React.createElement('title', null, name),
	          React.createElement('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }),
	          React.createElement('path', { d: 'M8 9h8M8 13h8M8 17h5' }),
	          React.createElement('text', {
	            x: 12,
	            y: 15,
	            textAnchor: 'middle',
	            fontSize: 6,
	            fill: color,
	            stroke: 'none',
	            fontFamily: 'system-ui, sans-serif'
	          }, label)
	        );
	      };
	    }

		    async function loadReactPreviewImports() {
		      const imports = {
		        lucideReact: new Proxy({}, {
		          get(target, prop) {
		            if (typeof prop !== 'string') return target[prop];
		            if (!target[prop]) {
		              target[prop] = createMissingIcon(prop);
		            }
		            return target[prop];
		          }
		        })
		      };

		      window.__ReactPreviewImports = imports;
		      window.__ReactPreviewMissingIcon = createMissingIcon;
		    }

	    window.addEventListener('error', (event) => {
	      showError(event.error || event.message);
	    });

    window.addEventListener('unhandledrejection', (event) => {
      showError(event.reason || 'Unhandled promise rejection');
    });

	    (async () => {
	      try {
	        if (!window.React || !window.ReactDOM || !window.Babel) {
	          throw new Error('React 预览运行时加载失败，请检查网络或把 React/Babel 运行时打包进扩展。');
	        }

	        await loadReactPreviewImports();

	        const source = JSON.parse(document.getElementById('react-preview-source').textContent);
	        const compiled = Babel.transform(source, {
	          filename: 'preview.tsx',
	          sourceType: 'script',
	          presets: [
	            ['env', { modules: false }],
	            ['react', { runtime: 'classic' }],
	            ['typescript', { allExtensions: true, isTSX: true }]
	          ]
	        }).code;

	        new Function('React', 'ReactDOM', compiled + '\\n//# sourceURL=react-preview.jsx')(window.React, window.ReactDOM);
	      } catch (error) {
	        showError(error);
	      }
	    })();
	  </script>
</body>
</html>`;
	  }

	  const FORMAT_META = {
	    json: {
	      extension: 'json',
	      mime: 'application/json',
	      defaultBaseName: 'json'
	    },
	    html: {
	      extension: 'html',
	      mime: 'text/html',
	      defaultBaseName: 'html'
	    },
	    react: {
	      extension: 'html',
	      mime: 'text/html',
	      defaultBaseName: 'react'
	    },
	    md: {
	      extension: 'md',
	      mime: 'text/markdown',
	      defaultBaseName: 'md'
	    },
	    txt: {
	      extension: 'txt',
	      mime: 'text/plain',
	      defaultBaseName: 'text'
	    }
	  };

	  function getFormatMeta(format) {
	    return FORMAT_META[format] || FORMAT_META.txt;
	  }

	  function getDefaultFileBaseName(format) {
	    return `${getFormatMeta(format).defaultBaseName}_${Date.now()}`;
	  }

	  function sanitizeFileBaseName(value, extension) {
	    const suffix = `.${extension}`;
	    let name = String(value || '').trim();

	    if (name.toLowerCase().endsWith(suffix.toLowerCase())) {
	      name = name.slice(0, -suffix.length);
	    }

	    name = name
	      .replace(/[\\/:*?"<>|]+/g, '-')
	      .replace(/\s+/g, ' ')
	      .replace(/^\.+|\.+$/g, '')
	      .trim();

	    return name || `memo_${Date.now()}`;
	  }

	  function hideDownloadDialog() {
	    downloadDialog.classList.remove('show');
	    downloadDialog.setAttribute('aria-hidden', 'true');
	  }

	  function openDownloadDialog() {
	    const format = detectFormat(editor.value);
	    const meta = getFormatMeta(format);

	    if (!state.isOpen) {
	      clearPanelClosingAnimation();
	      state.isOpen = true;
	      updateLayout();
	      saveState();
	      if (!animationId) {
	        drawParticles();
	      }
	    }

	    downloadDialog.dataset.format = format;
	    downloadNameInput.value = getDefaultFileBaseName(format);
	    downloadExtension.textContent = `.${meta.extension}`;
	    downloadDialog.classList.add('show');
	    downloadDialog.setAttribute('aria-hidden', 'false');

	    requestAnimationFrame(() => {
	      downloadNameInput.focus();
	      downloadNameInput.select();
	    });
	  }

	  function downloadCurrentContent() {
	    const text = editor.value;
	    const format = downloadDialog.dataset.format || detectFormat(text);
	    const meta = getFormatMeta(format);
	    const fileBaseName = sanitizeFileBaseName(downloadNameInput.value, meta.extension);
	    const downloadContent = format === 'react' ? buildReactPreviewHtml(text) : text;
	    const blob = new Blob([downloadContent], { type: `${meta.mime};charset=utf-8` });
	    const url = URL.createObjectURL(blob);
	    const a = document.createElement('a');

	    a.href = url;
	    a.download = `${fileBaseName}.${meta.extension}`;
	    a.click();
	    URL.revokeObjectURL(url);
	    hideDownloadDialog();
	    editor.focus();
	  }

	  function handlePreview() {
	    const text = editor.value;
	    const format = detectFormat(text);
	    let htmlContent = '';

	    if (format === 'json') {
	      try {
	        const parsed = JSON.parse(text);
	        htmlContent = `<pre style="font-family: monospace; padding: 20px;">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
	      } catch (e) {
	        htmlContent = `<pre style="color: red;">JSON Parse Error: ${escapeHtml(e.message)}</pre><pre>${escapeHtml(text)}</pre>`;
	      }
	    } else if (format === 'html') {
	      htmlContent = text;
	    } else if (format === 'react') {
	      htmlContent = buildReactPreviewHtml(text);
	    } else if (format === 'md') {
	      htmlContent = buildMarkdownPreviewHtml(text);
	    } else {
	      htmlContent = `<pre style="font-family: system-ui; white-space: pre-wrap; padding: 20px; line-height: 1.6;">${escapeHtml(text)}</pre>`;
	    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

	  function handleDownload() {
	    openDownloadDialog();
	  }

	  downloadCancel.addEventListener('click', () => {
	    hideDownloadDialog();
	    editor.focus();
	  });

	  downloadConfirm.addEventListener('click', downloadCurrentContent);

	  downloadDialog.addEventListener('mousedown', (e) => {
	    if (e.target === downloadDialog) {
	      hideDownloadDialog();
	      editor.focus();
	    }
	  });

	  downloadNameInput.addEventListener('keydown', (e) => {
	    if (e.key === 'Enter') {
	      e.preventDefault();
	      downloadCurrentContent();
	    }

	    if (e.key === 'Escape') {
	      e.preventDefault();
	      hideDownloadDialog();
	      editor.focus();
	    }
	  });

	  // 快捷键劫持
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handlePreview();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      handleDownload();
    }
  });

  // 工具函数
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
})();
