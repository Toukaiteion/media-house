// 在 MediaHouse 影片详情页注入「本地搜刮」按钮。
// 只在设置里配置的服务器地址上生效，其它网站直接返回。

const BTN_ID = 'mh-scrape-btn';
const PANEL_ID = 'mh-scrape-panel';

let busy = false;
let serverOrigin = null;

function mediaIdFromPath() {
  const m = location.pathname.match(/^\/media-center\/movies\/(\d+)\/?$/);
  return m ? m[1] : null;
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = [
    'position:fixed', 'right:24px', 'bottom:84px', 'z-index:2147483000',
    'max-width:320px', 'padding:10px 14px', 'border-radius:8px',
    'background:#1f2430', 'color:#e6e6e6', 'font:13px/1.5 system-ui,sans-serif',
    'box-shadow:0 6px 24px rgba(0,0,0,.35)', 'display:none', 'white-space:pre-wrap',
  ].join(';');
  document.body.appendChild(panel);
  return panel;
}

function setStatus(text, kind) {
  const panel = ensurePanel();
  panel.style.display = 'block';
  panel.style.color = kind === 'error' ? '#ff8a80' : kind === 'ok' ? '#7ee787' : '#e6e6e6';
  panel.textContent = text;
  if (kind === 'ok' || kind === 'error') {
    clearTimeout(setStatus._timer);
    setStatus._timer = setTimeout(() => { panel.style.display = 'none'; }, 15000);
  }
}

function removeButton() {
  document.getElementById(BTN_ID)?.remove();
}

function ensureButton() {
  const mediaId = mediaIdFromPath();
  if (!mediaId) { removeButton(); return; }
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = '🔄 本地搜刮';
  btn.style.cssText = [
    'position:fixed', 'right:24px', 'bottom:24px', 'z-index:2147483000',
    'padding:12px 18px', 'border:0', 'border-radius:24px', 'cursor:pointer',
    'background:#1976d2', 'color:#fff', 'font:600 14px system-ui,sans-serif',
    'box-shadow:0 6px 20px rgba(25,118,210,.45)',
  ].join(';');

  btn.addEventListener('click', () => start(mediaId));
  document.body.appendChild(btn);
}

async function start(mediaId) {
  if (busy) return;

  const token = localStorage.getItem('auth-token');
  if (!token) {
    setStatus('未登录：请先在 MediaHouse 页面登录一次', 'error');
    return;
  }
  if (!serverOrigin) {
    setStatus('还没配置服务器地址，请到扩展选项里设置', 'error');
    return;
  }

  busy = true;
  setStatus('正在连接本机程序…');

  let port;
  try {
    port = chrome.runtime.connect({ name: 'mh-scrape' });
  } catch (err) {
    busy = false;
    setStatus(`连接扩展后台失败：${err?.message || err}`, 'error');
    return;
  }

  port.onMessage.addListener((msg) => {
    if (msg?.type === 'progress') {
      setStatus(`${msg.message}${msg.percent != null ? `（${msg.percent}%）` : ''}`);
    } else if (msg?.type === 'done') {
      busy = false;
      setStatus(`✅ 已更新：《${msg.title || '影片'}》，正在刷新…`, 'ok');
      setTimeout(() => location.reload(), 1200);
    } else if (msg?.type === 'error') {
      busy = false;
      setStatus(`❌ ${msg.message}`, 'error');
    }
  });

  port.onDisconnect.addListener(() => {
    busy = false;
  });

  port.postMessage({
    action: 'scrapeAndUpload',
    media_id: mediaId,
    server_url: serverOrigin,
    token,
  });
}

// ---- 初始化：读配置 + 监听 SPA 路由变化 ----

(async () => {
  const { serverUrl } = await chrome.storage.sync.get('serverUrl');
  if (serverUrl) {
    try {
      serverOrigin = new URL(serverUrl).origin;
    } catch {
      serverOrigin = null;
    }
  }

  // 不在自己的服务器上就彻底不干活
  if (!serverOrigin || location.origin !== serverOrigin) return;

  ensureButton();
  setInterval(ensureButton, 1000); // 兼容 React Router 的客户端跳转
})();
