// 扩展后台：把页面端的长连接和本机 Native Messaging 主机对接起来（双向转发）。
// 页面 <-> background <-> 本机 exe

const HOST_NAME = 'com.mediahouse.scraper';

chrome.runtime.onInstalled.addListener(async () => {
  const { serverUrl } = await chrome.storage.sync.get('serverUrl');
  if (!serverUrl) chrome.runtime.openOptionsPage();
});

chrome.runtime.onConnect.addListener((pagePort) => {
  if (pagePort.name !== 'mh-runner') return;

  let hostPort = null;
  try {
    hostPort = chrome.runtime.connectNative(HOST_NAME);
  } catch (err) {
    pagePort.postMessage({ type: 'error', message: `无法连接本机程序：${err?.message || err}` });
    return;
  }

  // 本机 -> 页面（日志、进度、退出码都是走这条）
  hostPort.onMessage.addListener((msg) => pagePort.postMessage(msg));

  hostPort.onDisconnect.addListener(() => {
    // 读取 lastError 以消除控制台告警，同时把原因带回页面
    const err = chrome.runtime.lastError;
    const reason = err?.message || '本机程序已退出';
    try {
      pagePort.postMessage({ type: 'error', message: `与本机程序断开：${reason}` });
    } catch {
      /* 页面已关闭 */
    }
  });

  // 页面 -> 本机
  pagePort.onMessage.addListener((msg) => {
    try {
      hostPort.postMessage(msg);
    } catch (err) {
      pagePort.postMessage({ type: 'error', message: `发送到本机失败：${err?.message || err}` });
    }
  });

  pagePort.onDisconnect.addListener(() => {
    try {
      hostPort.disconnect();
    } catch {
      /* 忽略 */
    }
  });
});
