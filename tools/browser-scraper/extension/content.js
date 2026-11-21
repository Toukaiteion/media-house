// MediaHouse 本地工具面板：选择命令 → 填参数 → 执行 → 看实时日志
// 只在扩展选项里配置过的站点上生效。

const MAX_LOG_LINES = 2000;
const HOST_LABEL = '本地工具';

let allowedOrigins = [];
let port = null;
let commands = [];
let snippets = [];
let currentRunId = null;
let busy = false;
let pendingPickerTarget = null;
let panel = null;
let logEl = null;
let statusEl = null;
let selectEl = null;
let hintEl = null;
let paramsEl = null;
let snippetsEl = null;
let paramControls = {};

// ---------------- DOM 构建 ----------------

function ensureStyle() {
  if (document.getElementById('mh-tools-style')) return;
  const style = document.createElement('style');
  style.id = 'mh-tools-style';
  style.textContent = `
    #mh-tools-fab{position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;align-items:center;gap:6px;
      padding:10px 16px;border:0;border-radius:24px;cursor:pointer;background:#1976d2;color:#fff;
      font:600 13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(25,118,210,.45)}
    #mh-tools-fab.mh-busy{background:#2e7d32}
    #mh-tools-panel{position:fixed;right:24px;bottom:84px;z-index:2147483000;width:480px;max-width:calc(100vw - 48px);
      height:560px;max-height:calc(100vh - 140px);display:none;flex-direction:column;background:#1f2430;color:#e6e6e6;
      border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.5);font:13px/1.5 system-ui,sans-serif;overflow:hidden}
    #mh-tools-panel.mh-open{display:flex}
    .mh-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#252b38;font-weight:600}
    .mh-close{border:0;background:transparent;color:#9aa4b2;font-size:18px;cursor:pointer;line-height:1}
    .mh-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
    .mh-row{display:flex;align-items:center;gap:6px}
    .mh-row label{width:64px;flex:none;color:#9aa4b2;font-size:12px}
    .mh-row input,.mh-row select{flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid #3a4354;
      background:#151a23;color:#e6e6e6;font:12px/1.4 ui-monospace,Consolas,monospace}
    .mh-row input[type=checkbox]{flex:none;width:15px;height:15px;margin:0 0 0 0;accent-color:#1976d2}
    .mh-params{display:flex;flex-direction:column;gap:6px;max-height:190px;overflow:auto}
    .mh-btn{border:0;border-radius:6px;padding:6px 12px;cursor:pointer;background:#39445a;color:#e6e6e6;font-size:12px;white-space:nowrap}
    .mh-btn:hover{background:#46536d}
    .mh-btn.primary{background:#1976d2;color:#fff}
    .mh-btn.primary:disabled{background:#2a3446;color:#68748a;cursor:not-allowed}
    .mh-btn.danger{background:#7f2a2a;color:#ffd9d9}
    .mh-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .mh-status{margin-left:auto;font-size:12px;color:#9aa4b2}
    .mh-hint{margin:0;color:#9aa4b2;font-size:12px;line-height:1.4}
    .mh-log{flex:1;margin:0 12px 12px;padding:8px 10px;overflow:auto;background:#0d1117;border-radius:8px;
      font:12px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all}
    .mh-log .mh-stderr{color:#ffb4a2}
    .mh-log .mh-cmd{color:#79c0ff}
    .mh-log .mh-meta{color:#7ee787}
    .mh-snippets{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto}
    .mh-snippet{border:1px solid #2a3446;border-radius:6px;padding:6px 8px;background:#11161f}
    .mh-snippet-head{display:flex;align-items:center;gap:6px;font-size:12px;color:#e6e6e6}
    .mh-snippet-head .mh-copied{margin-left:auto;font-size:11px;color:#7ee787}
    .mh-snippet-desc{margin:2px 0 5px;font-size:11px;color:#8b95a5;line-height:1.35}
    .mh-snippet-body{display:flex;gap:6px;align-items:flex-start}
    .mh-snippet-body code{flex:1;min-width:0;font:11px/1.45 ui-monospace,Consolas,monospace;color:#9ecbff;
      background:#0d1117;border-radius:4px;padding:5px 6px;white-space:pre-wrap;word-break:break-all}
  `;
  document.head.appendChild(style);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function ensurePanel() {
  if (panel) return panel;
  ensureStyle();

  selectEl = el('select', {});
  selectEl.addEventListener('change', renderParams);

  hintEl = el('p', { class: 'mh-hint' });
  paramsEl = el('div', { class: 'mh-params' });
  snippetsEl = el('div', { class: 'mh-snippets' });
  snippetsEl.style.display = 'none';

  const runBtn = el('button', { class: 'mh-btn primary', text: '▶ 执行' });
  const stopBtn = el('button', { class: 'mh-btn danger', text: '■ 停止' });
  const copyBtn = el('button', { class: 'mh-btn', text: '复制日志' });
  const clearBtn = el('button', { class: 'mh-btn', text: '清空' });

  runBtn.addEventListener('click', runSelected);
  stopBtn.addEventListener('click', cancelRun);
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(logEl?.innerText || '').catch(() => {});
  });
  clearBtn.addEventListener('click', () => {
    if (logEl) logEl.textContent = '';
  });

  statusEl = el('span', { class: 'mh-status', text: '就绪' });
  logEl = el('div', { class: 'mh-log' });

  const closeBtn = el('button', { class: 'mh-close', text: '✕', title: '收起（命令会继续在后台运行）' });
  closeBtn.addEventListener('click', () => panel.classList.remove('mh-open'));

  panel = el('div', { id: 'mh-tools-panel' }, [
    el('div', { class: 'mh-head' }, [el('span', { text: HOST_LABEL }), closeBtn]),
    el('div', { class: 'mh-body' }, [
      el('div', { class: 'mh-row' }, [el('label', { text: '命令' }), selectEl]),
      hintEl,
      paramsEl,
      el('div', { class: 'mh-actions' }, [runBtn, stopBtn, copyBtn, clearBtn, statusEl]),
      snippetsEl,
    ]),
    logEl,
  ]);

  document.body.appendChild(panel);
  return panel;
}

function ensureButton() {
  if (document.getElementById('mh-tools-fab')) return;

  // 之前只在 ensurePanel() 里注入样式，导致按钮先出现时是无样式的裸 <button>
  ensureStyle();

  const btn = el('button', { id: 'mh-tools-fab', type: 'button', text: `🛠 ${HOST_LABEL}` });

  // 关键定位属性同时写成内联，避免被站点的全局样式覆盖
  btn.style.cssText = [
    'position:fixed',
    'right:24px',
    'bottom:24px',
    'z-index:2147483000',
    'display:flex',
    'align-items:center',
    'padding:10px 16px',
    'border:0',
    'border-radius:24px',
    'background:#1976d2',
    'color:#fff',
    'font:600 13px system-ui,sans-serif',
    'box-shadow:0 6px 20px rgba(25,118,210,.45)',
    'cursor:pointer',
  ].join(';');

  btn.addEventListener('click', () => {
    const p = ensurePanel();
    p.classList.toggle('mh-open');
    if (p.classList.contains('mh-open')) {
      connect();
      send({ action: 'list' });
    }
  });

  (document.body || document.documentElement).appendChild(btn);

  const rect = btn.getBoundingClientRect();
  console.info(
    '[MediaHouse 本地工具] 按钮已注入，位置：',
    `left=${Math.round(rect.left)} top=${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`,
  );
}

// ---------------- 与后台通信 ----------------

function connect() {
  if (port) return port;
  try {
    port = chrome.runtime.connect({ name: 'mh-runner' });
  } catch (err) {
    appendLog('stderr', `连接扩展后台失败：${err?.message || err}`);
    return null;
  }

  port.onMessage.addListener(onHostMessage);
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    port = null;
    if (err) appendLog('stderr', `与本机程序断开：${err.message}`);
  });

  return port;
}

function send(message) {
  const p = connect();
  if (!p) return;
  p.postMessage(message);
}

function context() {
  const match = location.pathname.match(/^\/media-center\/movies\/(\d+)\/?$/);
  return {
    mediaId: match ? match[1] : '',
    title: document.title,
    url: location.href,
    serverUrl: location.origin,
    token: localStorage.getItem('auth-token') || '',
  };
}

// ---------------- 参数表单 ----------------

function selectedCommand() {
  return commands.find((c) => c.id === selectEl?.value) || null;
}

function renderParams() {
  const command = selectedCommand();
  const params = command?.params || [];

  paramControls = {};
  if (paramsEl) paramsEl.textContent = '';

  for (const param of params) {
    const type = param.type || 'text';
    const row = el('div', { class: 'mh-row' });
    row.appendChild(el('label', { text: param.label || param.key }));

    if (type === 'boolean') {
      const box = el('input', { type: 'checkbox' });
      box.checked = String(param.default ?? 'false').toLowerCase() === 'true';
      row.appendChild(box);
      paramControls[param.key] = { type, node: box };
    } else {
      const input = el('input', {
        type: type === 'number' ? 'number' : 'text',
        placeholder: param.placeholder || (param.required ? '必填' : '可留空'),
      });
      if (param.default) input.value = param.default;
      row.appendChild(input);
      paramControls[param.key] = { type, node: input };

      if (type === 'directory' || type === 'file') {
        const pick = el('button', { class: 'mh-btn', text: '选择' });
        pick.addEventListener('click', () => {
          pendingPickerTarget = input;
          send({ action: type === 'directory' ? 'pickDirectory' : 'pickFile' });
        });
        row.appendChild(pick);
      }
    }

    paramsEl.appendChild(row);
  }

  if (hintEl) {
    const parts = [];
    if (command?.description) parts.push(command.description);
    if (command && params.length === 0) parts.push('不需要参数，直接点「执行」');
    hintEl.textContent = parts.join(' · ');
    hintEl.style.display = hintEl.textContent ? 'block' : 'none';
  }
}

function collectParams() {
  const values = {};

  for (const [key, control] of Object.entries(paramControls)) {
    if (control.type === 'boolean') {
      values[key] = control.node.checked ? 'true' : 'false';
    } else {
      values[key] = control.node.value.trim();
    }
  }

  const command = selectedCommand();
  for (const param of command?.params || []) {
    if (!param.required) continue;
    const value = values[param.key];
    // 带默认值的参数可以留空（默认值可能是 ${num} 这类，由主机在运行时填）
    if (!value && !param.hasDefault) {
      return { error: `请填写「${param.label || param.key}」` };
    }
  }

  return { values };
}

function runSelected() {
  const command = selectedCommand();
  if (!command) return;

  if (busy) {
    setStatus('有命令在跑，先停止');
    return;
  }

  const collected = collectParams();
  if (collected.error) {
    setStatus(collected.error);
    return;
  }

  appendMeta(`$ ${command.name}`);
  send({ action: 'run', commandId: command.id, params: collected.values, context: context() });
}

function cancelRun() {
  if (!busy || !currentRunId) return;
  send({ action: 'cancel', runId: currentRunId });
  setStatus('正在停止…');
}

// ---------------- 渲染 ----------------

function appendLine(text, className) {
  if (!logEl) return;
  const row = document.createElement('div');
  if (className) row.className = className;
  row.textContent = text;
  logEl.appendChild(row);
  while (logEl.childElementCount > MAX_LOG_LINES) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

function appendLog(stream, line) {
  appendLine(line, stream === 'stderr' ? 'mh-stderr' : '');
}

function appendMeta(text) {
  appendLine(text, 'mh-cmd');
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setBusy(value) {
  busy = value;
  const fab = document.getElementById('mh-tools-fab');
  if (fab) {
    fab.classList.toggle('mh-busy', value);
    fab.textContent = value ? `⏳ ${HOST_LABEL}（运行中）` : `🛠 ${HOST_LABEL}`;
  }
}

// ---------------- 主机消息 ----------------

function onHostMessage(message) {
  switch (message?.type) {
    case 'commands':
      snippets = message.snippets || [];
      onCommands(message.commands || [], message.configError);
      renderSnippets(snippets);
      break;

    case 'directory':
    case 'file':
      if (message.path && pendingPickerTarget) {
        pendingPickerTarget.value = message.path;
      }
      pendingPickerTarget = null;
      break;

    case 'started':
      currentRunId = message.runId;
      setBusy(true);
      setStatus(`运行中：${message.name || message.commandId}`);
      break;

    case 'log':
      appendLog(message.stream, message.line);
      break;

    case 'progress':
      setStatus(`运行中 ${message.percent}%`);
      break;

    case 'heartbeat':
      break;

    case 'exit':
      setBusy(false);
      currentRunId = null;
      appendLine(`— 结束（退出码 ${message.code}，耗时 ${(message.durationMs / 1000).toFixed(1)}s）`, 'mh-meta');
      setStatus(message.code === 0 ? '完成' : `结束，退出码 ${message.code}`);
      break;

    case 'cancelled':
      setStatus('已停止');
      break;

    case 'error':
      setBusy(false);
      currentRunId = null;
      appendLog('stderr', `[错误] ${message.message}`);
      setStatus('出错');
      break;

    default:
      break;
  }
}

// ---------------- 批量命令（只显示 + 复制） ----------------

/** 剪贴板写入，失败时退回 execCommand（有些页面/权限下 clipboard 不可用） */
function copyText(text) {
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
    } finally {
      area.remove();
    }
  };

  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallback());
  }

  fallback();
  return Promise.resolve();
}

/**
 * 批量任务不放在下拉里（跑一次几十分钟，误点很痛），
 * 改成给一条可直接粘贴到终端的命令行。
 */
function renderSnippets(list) {
  if (!snippetsEl) return;

  snippetsEl.textContent = '';

  if (!list || list.length === 0) {
    snippetsEl.style.display = 'none';
    return;
  }

  snippetsEl.style.display = '';
  snippetsEl.appendChild(el('p', { class: 'mh-hint', text: '批量任务（复制到终端运行）' }));

  for (const snippet of list) {
    const copiedTip = el('span', { class: 'mh-copied' });
    const copyBtn = el('button', { class: 'mh-btn', text: '复制' });

    copyBtn.addEventListener('click', () => {
      copyText(snippet.command || '').then(() => {
        copiedTip.textContent = '已复制';
        setTimeout(() => {
          copiedTip.textContent = '';
        }, 1500);
      });
    });

    const head = el('div', { class: 'mh-snippet-head' }, [
      el('span', { text: snippet.name || '命令' }),
      copiedTip,
    ]);

    const box = el('div', { class: 'mh-snippet' }, [head]);

    if (snippet.description) {
      box.appendChild(el('div', { class: 'mh-snippet-desc', text: snippet.description }));
    }

    box.appendChild(
      el('div', { class: 'mh-snippet-body' }, [el('code', { text: snippet.command || '' }), copyBtn]),
    );

    snippetsEl.appendChild(box);
  }
}

function onCommands(list, configError) {
  commands = list;
  if (!selectEl) return;

  if (configError) {
    appendLog('stderr', `[配置错误] ${configError}`);
  }
  const previous = selectEl.value;
  selectEl.textContent = '';
  for (const command of list) {
    const option = document.createElement('option');
    option.value = command.id;
    option.textContent = command.name || command.id;
    if (command.description) option.title = command.description;
    selectEl.appendChild(option);
  }

  if (previous && list.some((c) => c.id === previous)) selectEl.value = previous;
  renderParams();

  if (list.length === 0) {
    appendLog('stderr', '本机 commands.json 里没有配置任何命令');
  }
}

// ---------------- 启动 ----------------

function toOrigin(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

async function loadOrigins() {
  let stored = {};
  try {
    stored = (await chrome.storage.sync.get(['serverOrigins', 'serverUrl'])) || {};
  } catch (err) {
    console.warn('[MediaHouse 本地工具] 读取配置失败：', err);
    return [];
  }

  const { serverOrigins, serverUrl } = stored;

  if (Array.isArray(serverOrigins) && serverOrigins.length > 0) {
    return serverOrigins.filter((item) => typeof item === 'string' && item.length > 0);
  }

  const legacy = toOrigin(serverUrl);
  return legacy ? [legacy] : [];
}

function applyOrigins(origins) {
  allowedOrigins = origins;
  const active = origins.includes(location.origin);

  if (active) {
    ensureButton();
  } else {
    document.getElementById('mh-tools-fab')?.remove();
    panel?.classList.remove('mh-open');
  }

  return active;
}

(async () => {
  console.info('[MediaHouse 本地工具] content script v0.3.0 @', location.origin);

  let origins = [];
  try {
    origins = await loadOrigins();
  } catch (err) {
    console.warn('[MediaHouse 本地工具] 初始化失败：', err);
    return;
  }

  const active = applyOrigins(origins);

  if (active) {
    console.info('[MediaHouse 本地工具] 已启用，当前站点：', location.origin);
  } else if (origins.length === 0) {
    console.warn('[MediaHouse 本地工具] 还没配置站点，请在扩展的「选项」里填写服务器地址后保存');
  } else {
    console.warn('[MediaHouse 本地工具] 当前站点不在已配置的名单里\n  当前：', location.origin, '\n  已配置：', origins);
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (!changes.serverOrigins && !changes.serverUrl) return;

      void loadOrigins()
        .then((next) => {
          if (applyOrigins(next)) console.info('[MediaHouse 本地工具] 配置已更新，按钮已启用');
        })
        .catch((err) => console.warn('[MediaHouse 本地工具] 监听配置变化失败：', err));
    });
  } catch (err) {
    console.warn('[MediaHouse 本地工具] 注册 storage 监听失败：', err);
  }

  setInterval(() => {
    if (allowedOrigins.includes(location.origin) && !document.getElementById('mh-tools-fab')) {
      ensureButton();
    }
  }, 1500);
})();
