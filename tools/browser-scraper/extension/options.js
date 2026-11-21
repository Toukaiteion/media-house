const $servers = document.getElementById('servers');
const $status = document.getElementById('status');

function setStatus(text, ok) {
  $status.textContent = text;
  $status.className = ok === true ? 'ok' : ok === false ? 'err' : '';
}

function parseEntry(value) {
  const raw = (value || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: `地址格式不对：${value.trim()}` };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return { error: `只支持 http / https：${value.trim()}` };
  }
  return { origin: url.origin };
}

function parseAll(text) {
  const origins = [];
  for (const line of text.split(/\r?\n/)) {
    const entry = parseEntry(line);
    if (!entry) continue;
    if (entry.error) return { error: entry.error };
    if (!origins.includes(entry.origin)) origins.push(entry.origin);
  }
  if (origins.length === 0) return { error: '请至少填一个地址，需要 http:// 或 https:// 开头' };
  return { origins };
}

// 兼容旧版本只存了一个 serverUrl 的情况
chrome.storage.sync.get(['serverOrigins', 'serverUrl']).then(({ serverOrigins, serverUrl }) => {
  const origins = Array.isArray(serverOrigins) && serverOrigins.length
    ? serverOrigins
    : serverUrl
      ? [serverUrl]
      : [];
  $servers.value = origins.join('\n');
});

document.getElementById('save').addEventListener('click', async () => {
  const result = parseAll($servers.value);
  if (result.error) return setStatus(result.error, false);

  // serverUrl 留一份首项，供老逻辑/排错时查看
  await chrome.storage.sync.set({ serverOrigins: result.origins, serverUrl: result.origins[0] });
  $servers.value = result.origins.join('\n');
  setStatus(`已保存 ${result.origins.length} 个站点：\n${result.origins.join('\n')}\n刷新对应页面即可看到按钮。`, true);
});

document.getElementById('test').addEventListener('click', async () => {
  const result = parseAll($servers.value);
  if (result.error) return setStatus(result.error, false);

  setStatus('请求中…');
  const lines = [];
  let allOk = true;

  for (const origin of result.origins) {
    try {
      // 依赖服务端 CORS（当前 AllowAnyOrigin）；若之后收紧这里会失败，
      // 但真正的上传由本机 host 发起，不经过浏览器，不受影响。
      const res = await fetch(`${origin}/health`, { cache: 'no-store' });
      const text = await res.text();
      if (res.ok) {
        lines.push(`✅ ${origin} → ${text.slice(0, 80)}`);
      } else {
        allOk = false;
        lines.push(`❌ ${origin} → HTTP ${res.status}`);
      }
    } catch (err) {
      allOk = false;
      lines.push(`❌ ${origin} → ${err?.message || err}（CORS 报错可忽略）`);
    }
  }

  setStatus(lines.join('\n'), allOk);
});
