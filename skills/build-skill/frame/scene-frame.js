/**
 * scene-frame.js — 场景组件统一运行时
 *
 * 由 compile.py 在编译时内联注入到每个组件 HTML 的 <head> 末尾。
 * 组件通过 window.SceneFrame.xxx 调用，无需自己实现 callAction / toast / loading / restoreHistory。
 *
 * API:
 *   SceneFrame.callAction(actionType, payload, file?)  → Promise<data>
 *   SceneFrame.toast.success(msg) / .error(msg) / .info(msg)
 *   SceneFrame.loading.show(msg?) / .hide()
 *   SceneFrame.restoreHistory(actionType, callback)    → boolean (是否成功恢复)
 *   SceneFrame.meta                                    → { componentId, stepLabel, sealed, projectId }
 *   SceneFrame.esc(s)                                  → HTML 转义字符串
 *   SceneFrame.fmt(n)                                  → 数字千分位格式化
 */
(function (w) {
  'use strict';

  // ── 读取组件元数据 ──
  // meta 由 compile.py 从 __COMPONENT_DATA__.meta 注入（或从 componentId 字段兼容读取）
  var _cd = w.__COMPONENT_DATA__ || {};
  var _meta = _cd.meta || {};
  var _componentId = _meta.componentId || _cd.componentId || '';
  var _sealed = !!_meta.sealed;
  var _history = _cd.history || w.__COMPONENT_DATA_MOCK__ || [];

  // ── backend URL (通用化, 支持多 backend 部署) ──
  // 优先级: window.__SCENE_BACKEND_URL__ (iframe 挂载前注入) > 默认 '/budget-chat/api'
  // 默认值 = budget-chat 生产/预览环境的 mount 路径 (nginx 一般都是 /<app>/api).
  // 未来接入其他 backend 时, 由宿主页 (FlowView.jsx / MessageBubble.jsx) 注入
  // window.__SCENE_BACKEND_URL__ 覆盖.
  var _SCENE_BACKEND_URL = (typeof w !== 'undefined' && w.__SCENE_BACKEND_URL__) || '/budget-chat/api';
  var _COMPONENT_ACTION_URL = _SCENE_BACKEND_URL + '/component-action';

  // ── callAction ──
  function callAction(actionType, payload, file) {
    var dialogueId = localStorage.getItem('previewFileDialogueId') || '';
    if (file) {
      var fd = new FormData();
      fd.append('dialogueId', dialogueId);
      fd.append('componentId', _componentId);
      fd.append('actionType', actionType);
      fd.append('payload', JSON.stringify(payload || {}));
      fd.append('file', file, file.name);
      return fetch(_COMPONENT_ACTION_URL, {
        method: 'POST',
        credentials: 'include',
        body: fd
      })
        .then(function (r) { return r.json(); })
        .then(_handleResponse);
    }
    return fetch(_COMPONENT_ACTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        dialogueId: dialogueId,
        componentId: _componentId,
        actionType: actionType,
        payload: payload || {}
      })
    })
      .then(function (r) { return r.json(); })
      .then(_handleResponse);
  }

  function _handleResponse(j) {
    if (j.code !== 0) throw new Error(j.msg || j.detail || '操作失败');
    if (j.data && j.data.userMessage) {
      try { w.parent.postMessage({ type: 'user_message', message: j.data.userMessage }, '*'); } catch (e) {}
    }
    if (j.data && j.data.agentPrompt) {
      try { w.parent.postMessage({ type: 'agent_prompt', prompt: j.data.agentPrompt }, '*'); } catch (e) {}
    }
    return j.data;
  }

  // ── toast ──
  var _toastEl = null;
  var _toastTimer = null;

  function _showToast(msg, type) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.id = '__sf_toast__';
      _toastEl.style.cssText = [
        'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999',
        'display:flex;align-items:center;gap:6px;padding:8px 16px',
        'border-radius:8px;font-size:12px;white-space:nowrap',
        'box-shadow:0 4px 16px rgba(0,0,0,0.12);font-family:inherit'
      ].join(';');
      document.body.appendChild(_toastEl);
    }
    var styles = {
      error: 'background:#fef2f2;border:1px solid #fecaca;color:#dc2626',
      success: 'background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d',
      info: 'background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8'
    };
    var icons = {
      error: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      success: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      info: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    _toastEl.style.cssText += ';' + (styles[type] || styles.info);
    _toastEl.innerHTML = (icons[type] || icons.info) + msg;
    _toastEl.style.display = 'flex';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { if (_toastEl) _toastEl.style.display = 'none'; }, 3500);
  }

  var toast = {
    error: function (msg) { _showToast(msg, 'error'); },
    success: function (msg) { _showToast(msg, 'success'); },
    info: function (msg) { _showToast(msg, 'info'); }
  };

  // ── loading ──
  var _loadingEl = null;

  function _ensureLoading() {
    if (_loadingEl) return _loadingEl;
    _loadingEl = document.createElement('div');
    _loadingEl.id = '__sf_loading__';
    _loadingEl.style.cssText = [
      'display:none;position:fixed;inset:0;z-index:99998',
      'background:rgba(255,255,255,0.72);backdrop-filter:blur(2px)',
      'align-items:center;justify-content:center;flex-direction:column;gap:10px'
    ].join(';');
    _loadingEl.innerHTML = [
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2c5aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:__sf_spin__ 1s linear infinite">',
      '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
      '</svg>',
      '<span id="__sf_loading_msg__" style="font-size:13px;color:#5b6476;font-family:inherit"></span>'
    ].join('');
    var style = document.createElement('style');
    style.textContent = '@keyframes __sf_spin__{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
    document.body.appendChild(_loadingEl);
    return _loadingEl;
  }

  var loading = {
    show: function (msg) {
      var el = _ensureLoading();
      var msgEl = el.querySelector('#__sf_loading_msg__');
      if (msgEl) msgEl.textContent = msg || '';
      el.style.display = 'flex';
    },
    hide: function () {
      if (_loadingEl) _loadingEl.style.display = 'none';
    }
  };

  // ── restoreHistory ──
  // 约定：_history 是数组，每项格式 { actionType, payloadList: [...] }
  // callback(payload) → true 表示恢复成功，跳过 API 初始化
  function restoreHistory(actionType, callback) {
    if (!Array.isArray(_history) || !_history.length) return false;
    // 找最后一条匹配的 actionType entry
    var entry = null;
    for (var i = _history.length - 1; i >= 0; i--) {
      if (_history[i].actionType === actionType) { entry = _history[i]; break; }
    }
    if (!entry) return false;
    var plds = entry.payloadList || [];
    var payload = plds[plds.length - 1] || {};
    try {
      var result = callback(payload);
      return result !== false; // callback 显式返回 false 表示恢复失败
    } catch (e) {
      console.warn('[SceneFrame] restoreHistory callback error:', e);
      return false;
    }
  }

  // 遍历全部历史（用于多 actionType 中间态恢复）
  function forEachHistory(actionType, callback) {
    if (!Array.isArray(_history)) return;
    _history.forEach(function (entry) {
      if (entry.actionType !== actionType) return;
      var plds = entry.payloadList || [];
      plds.forEach(function (pl) { try { callback(pl); } catch (e) {} });
    });
  }

  // ── 工具函数 ──
  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]);
    });
  }

  function fmt(n) {
    return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '—';
  }

  // ── modal ──
  // 替代被 iframe sandbox 拦掉的 alert/confirm/prompt。
  // 若组件模板 include 了 frame/_shared/modal.html, 使用其 DOM + CSS token 样式；
  // 否则动态注入极简版 (功能一致, 样式内联无 token)。
  function _ensureModalRoot() {
    var root = document.getElementById('sc-modal-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'sc-modal-root';
    root.className = 'sc-modal-root';
    root.hidden = true;
    root.style.cssText = 'position:fixed;inset:0;z-index:10000;font-family:inherit';
    root.innerHTML = [
      '<div class="sc-modal-mask" style="position:absolute;inset:0;background:rgba(15,23,42,0.42)"></div>',
      '<div class="sc-modal-dialog" role="dialog" aria-modal="true" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:8px;box-shadow:0 12px 40px rgba(15,23,42,0.18);min-width:320px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;overflow:hidden">',
      '  <div class="sc-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e6e8ef;background:#f9fafb">',
      '    <span class="sc-modal-title" style="font-size:13px;font-weight:600;color:#1d2230"></span>',
      '    <button class="sc-modal-close" type="button" aria-label="关闭" style="background:none;border:none;font-size:20px;line-height:1;color:#5b6476;cursor:pointer;padding:0 4px">&times;</button>',
      '  </div>',
      '  <div class="sc-modal-body" style="padding:16px;overflow:auto;font-size:13px;color:#1d2230;flex:1"></div>',
      '  <div class="sc-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e6e8ef;background:#fafbfd">',
      '    <button class="sc-modal-cancel" type="button" style="padding:6px 14px;font-size:12px;border:1px solid #e6e8ef;border-radius:4px;background:#fafafa;color:#5b6476;cursor:pointer;font-family:inherit"></button>',
      '    <button class="sc-modal-ok" type="button" style="padding:6px 14px;font-size:13px;font-weight:600;border:none;border-radius:8px;background:#2c5aff;color:#fff;cursor:pointer;font-family:inherit"></button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(root);
    return root;
  }

  function _openModal(opts) {
    // opts: { title, bodyText?, bodyNode?, okText?, cancelText?, showCancel?, onOk, onCancel, focusEl? }
    var root = _ensureModalRoot();
    var titleEl = root.querySelector('.sc-modal-title');
    var bodyEl = root.querySelector('.sc-modal-body');
    var okBtn = root.querySelector('.sc-modal-ok');
    var cancelBtn = root.querySelector('.sc-modal-cancel');
    var closeBtn = root.querySelector('.sc-modal-close');
    var maskEl = root.querySelector('.sc-modal-mask');

    titleEl.textContent = opts.title || '';
    if (opts.bodyNode) {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(opts.bodyNode);
    } else {
      bodyEl.textContent = opts.bodyText || '';
    }
    okBtn.textContent = opts.okText || '确认';
    cancelBtn.textContent = opts.cancelText || '取消';
    cancelBtn.style.display = opts.showCancel === false ? 'none' : '';
    root.hidden = false;

    function cleanup() {
      root.hidden = true;
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
      maskEl.onclick = null;
    }
    okBtn.onclick = function () { cleanup(); if (opts.onOk) opts.onOk(); };
    var onCancelFn = function () { cleanup(); if (opts.onCancel) opts.onCancel(); };
    cancelBtn.onclick = onCancelFn;
    closeBtn.onclick = onCancelFn;
    maskEl.onclick = onCancelFn;

    if (opts.focusEl) {
      try { opts.focusEl.focus(); } catch (e) {}
    }
  }

  var modal = {
    // confirm(message, options?) → Promise<boolean>
    // options: { title?, okText?, cancelText? }
    confirm: function (message, options) {
      options = options || {};
      return new Promise(function (resolve) {
        _openModal({
          title: options.title || '确认',
          bodyText: message,
          okText: options.okText || '确认',
          cancelText: options.cancelText || '取消',
          showCancel: true,
          onOk: function () { resolve(true); },
          onCancel: function () { resolve(false); }
        });
      });
    },

    // alert(message, options?) → Promise<void>
    // options: { title?, okText? }
    alert: function (message, options) {
      options = options || {};
      return new Promise(function (resolve) {
        _openModal({
          title: options.title || '提示',
          bodyText: message,
          okText: options.okText || '好的',
          showCancel: false,
          onOk: function () { resolve(); },
          onCancel: function () { resolve(); }
        });
      });
    },

    // prompt(message, defaultValue?, options?) → Promise<string|null>
    // options: { title?, okText?, cancelText?, placeholder? }
    prompt: function (message, defaultValue, options) {
      options = options || {};
      return new Promise(function (resolve) {
        var wrap = document.createElement('div');
        var label = document.createElement('div');
        label.textContent = message || '';
        label.style.cssText = 'margin-bottom:8px;color:#1d2230';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'sc-modal-input';
        input.value = defaultValue == null ? '' : String(defaultValue);
        if (options.placeholder) input.placeholder = options.placeholder;
        // 兜底样式 (模板未 include modal.html 时也可看)
        input.style.cssText = 'width:100%;padding:6px 10px;font-size:13px;font-family:inherit;color:#1d2230;border:1px solid #e6e8ef;border-radius:4px;background:#fff;outline:none';
        wrap.appendChild(label);
        wrap.appendChild(input);

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var root = document.getElementById('sc-modal-root');
            var okBtn = root && root.querySelector('.sc-modal-ok');
            if (okBtn) okBtn.click();
          }
        });

        _openModal({
          title: options.title || '输入',
          bodyNode: wrap,
          okText: options.okText || '确认',
          cancelText: options.cancelText || '取消',
          showCancel: true,
          focusEl: input,
          onOk: function () { resolve(input.value); },
          onCancel: function () { resolve(null); }
        });
      });
    }
  };

  // ── sealed 状态：锁定所有 callAction ──
  // sealed 时 callAction 返回 rejected promise，并显示提示
  var _rawCallAction = callAction;
  if (_sealed) {
    callAction = function (actionType) {
      toast.info('当前任务已封存，不可编辑');
      return Promise.reject(new Error('sealed'));
    };
  }

  // ── 导出 ──
  w.SceneFrame = {
    callAction: callAction,
    toast: toast,
    loading: loading,
    modal: modal,
    restoreHistory: restoreHistory,
    forEachHistory: forEachHistory,
    esc: esc,
    fmt: fmt,
    meta: {
      componentId: _componentId,
      stepLabel: _meta.stepLabel || '',
      sealed: _sealed,
      projectId: _meta.projectId || ''
    }
  };

})(window);
