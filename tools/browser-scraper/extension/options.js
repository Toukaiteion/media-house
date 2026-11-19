const $server = document.getElementById('serverUrl');
const $status = document.getElementById('status');

function setStatus(text, ok) {
  $status.textContent = text;
  $status.className = ok === true ? 'ok' : ok === false ? 'err' : '';
}

function normalize(value) {
  const raw = (value || '').trim().replace(/\/+$/, '');
  if (!raw) return { ok: false, message: '请先填写地址' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: '地址格式不对，需要 http:// 或 https:// 开头' };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return { ok: false, message: '只支持 http / https' };
  }
  return { ok: true, origin: url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')) };
}

chrome.storage.sync.get('serverUrl').then(({ serverUrl }) => {
  if (serverUrl) $server.value = serverUrl;
});

document.getElementById('save').addEventListener('click', async () => {
  const result = normalize($server.value);
  if (!result.ok) return setStatus(result.message, false);

  await chrome.storage.sync.set({ serverUrl: result.origin });
  $server.value = result.origin;
  setStatus(`已保存：${result.origin}\n刷新一下 MediaHouse 页面即可看到按钮。`, true);
});

document.getElementById('test').addEventListener('click', async () => {
  const result = normalize($server.value);
  if (!result.ok) return setStatus(result.message, false);

  setStatus('请求中…');
  try {
    // 依赖服务端的 CORS 配置（当前是 AllowAnyOrigin）；若之后收紧，这里会失败但上传仍可用，
    // 因为真正的上传是由本机 host 发起的，不经过浏览器。
    const res = await fetch(`${result.origin}/health`, { cache: 'no-store' });
    const text = await res.text();
    if (res.ok) setStatus(`连接正常：${text}`, true);
    else setStatus(`服务器返回 ${res.status}：${text.slice(0, 200)}`, false);
  } catch (err) {
    setStatus(`连不上：${err?.message || err}\n（如果是 CORS 报错可忽略，直接去页面点按钮试试）`, false);
  }
});
