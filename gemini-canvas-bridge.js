(function () {
  if (window.__floatGeminiCanvasBridgeInstalled__) return;
  window.__floatGeminiCanvasBridgeInstalled__ = true;

  const MESSAGE_SOURCE = 'float-extension-gemini-canvas';
  const REQUEST_TYPE = 'request-code';
  const RESPONSE_TYPE = 'response-code';

  function normalizeCode(text) {
    const normalized = String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .trim();

    return /^\[object .+\]$/.test(normalized) ? '' : normalized;
  }

  function addCandidate(candidates, seenTexts, text, source, priority) {
    const normalized = normalizeCode(text);
    if (!normalized || seenTexts.has(normalized)) return;

    seenTexts.add(normalized);
    candidates.push({
      text: normalized,
      source,
      priority
    });
  }

  function safeCall(receiver, methodName) {
    try {
      if (!receiver || typeof receiver[methodName] !== 'function') return '';
      return receiver[methodName]();
    } catch (_) {
      return '';
    }
  }

  function addEditorPropertyValue(candidates, seenTexts, value, source, priority, seenObjects, depth) {
    if (typeof value === 'string') {
      addCandidate(candidates, seenTexts, value, source, priority);
      return;
    }

    addEditorLikeValue(candidates, seenTexts, value, source, priority, seenObjects, depth);
  }

  function getLikelyEditorPropertyNames(value) {
    const knownNames = [
      'editor',
      'view',
      'model',
      '_model',
      '_modelData',
      'state',
      'doc',
      'cmView',
      'CodeMirror'
    ];
    let ownNames = [];

    try {
      ownNames = Object.getOwnPropertyNames(value).filter((propertyName) => (
        /(code|content|editor|model|view|state|doc|value|cm|monaco)/i.test(propertyName)
      ));
    } catch (_) {
      ownNames = [];
    }

    return Array.from(new Set(knownNames.concat(ownNames))).slice(0, 60);
  }

  function addEditorLikeValue(candidates, seenTexts, value, source, priority, seenObjects, depth = 0) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return;
    if (seenObjects.has(value)) return;

    seenObjects.add(value);

    addCandidate(candidates, seenTexts, safeCall(value, 'getValue'), `${source}-getValue`, priority);

    try {
      const model = typeof value.getModel === 'function' ? value.getModel() : value.model;
      if (model) {
        addCandidate(candidates, seenTexts, safeCall(model, 'getValue'), `${source}-model`, priority + 10);
      }
    } catch (_) {
      // Ignore editor internals that throw when touched.
    }

    try {
      const stateDoc = value.state && value.state.doc;
      if (stateDoc && typeof stateDoc.toString === 'function') {
        addCandidate(candidates, seenTexts, stateDoc.toString(), `${source}-state-doc`, priority + 12);
      }
    } catch (_) {
      // Ignore editor internals that throw when touched.
    }

    try {
      const viewDoc = value.view && value.view.state && value.view.state.doc;
      if (viewDoc && typeof viewDoc.toString === 'function') {
        addCandidate(candidates, seenTexts, viewDoc.toString(), `${source}-view-state-doc`, priority + 12);
      }
    } catch (_) {
      // Ignore editor internals that throw when touched.
    }

    if (depth >= 2) return;

    getLikelyEditorPropertyNames(value).forEach((propertyName) => {
      try {
        addEditorPropertyValue(
          candidates,
          seenTexts,
          value[propertyName],
          `${source}-${propertyName}`,
          priority - 5,
          seenObjects,
          depth + 1
        );
      } catch (_) {
        // Ignore inaccessible properties.
      }
    });
  }

  function collectMonacoCandidates(candidates, seenTexts) {
    try {
      const monaco = window.monaco;
      const models = monaco && monaco.editor && typeof monaco.editor.getModels === 'function'
        ? monaco.editor.getModels()
        : [];

      models.forEach((model) => {
        addCandidate(candidates, seenTexts, safeCall(model, 'getValue'), 'monaco-model', 280);
      });
    } catch (_) {
      // Monaco is not exposed on every page.
    }
  }

  function collectElementBackedCandidates(candidates, seenTexts) {
    const seenObjects = new WeakSet();
    const selectors = [
      '.monaco-editor',
      '.cm-editor',
      '.CodeMirror',
      '.cm-content',
      '.CodeMirror-code',
      'textarea',
      '[contenteditable="true"]'
    ].join(',');

    document.querySelectorAll(selectors).forEach((element) => {
      addEditorLikeValue(candidates, seenTexts, element, 'element-editor', 230, seenObjects);

      if (element.matches('textarea')) {
        addCandidate(candidates, seenTexts, element.value, 'textarea-value', 190);
      }

      if (element.CodeMirror && typeof element.CodeMirror.getValue === 'function') {
        addCandidate(candidates, seenTexts, element.CodeMirror.getValue(), 'codemirror5-instance', 270);
      }

      if (element.cmView) {
        addEditorLikeValue(candidates, seenTexts, element.cmView, 'codemirror6-cmview', 270, seenObjects);
      }
    });
  }

  function collectGlobalEditorCandidates(candidates, seenTexts) {
    const seenObjects = new WeakSet();
    let globalNames = [];

    try {
      globalNames = Object.getOwnPropertyNames(window).filter((propertyName) => (
        /(monaco|codemirror|code|editor|canvas)/i.test(propertyName)
      ));
    } catch (_) {
      globalNames = [];
    }

    globalNames.slice(0, 120).forEach((propertyName) => {
      try {
        addEditorPropertyValue(
          candidates,
          seenTexts,
          window[propertyName],
          `global-${propertyName}`,
          210,
          seenObjects,
          0
        );
      } catch (_) {
        // Some globals intentionally throw when read.
      }
    });
  }

  function collectPageCandidates() {
    const candidates = [];
    const seenTexts = new Set();

    collectMonacoCandidates(candidates, seenTexts);
    collectElementBackedCandidates(candidates, seenTexts);
    collectGlobalEditorCandidates(candidates, seenTexts);

    return candidates;
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || typeof data !== 'object') return;
    if (data.source !== MESSAGE_SOURCE || data.type !== REQUEST_TYPE || !data.requestId) return;

    window.postMessage({
      source: MESSAGE_SOURCE,
      type: RESPONSE_TYPE,
      requestId: data.requestId,
      candidates: collectPageCandidates()
    }, '*');
  });
})();
