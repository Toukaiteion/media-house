/**
 * 浏览器采集的核心：启动浏览器、开会话、下载图片、落盘。
 *
 * jrender（单部）和 jscan（批量）共用这里的实现，避免两份代码慢慢走偏。
 * 只负责「怎么拿到数据、怎么写文件」，不管命令行参数和目录扫描。
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { MIN_IMAGE_BYTES, buildNfo, isAgeGate } from './parse-detail.mjs';
import { cropRightHalf } from './image-ops.mjs';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

/** 系统 Chrome 的常见位置；channel 探测不到时用这些兜底 */
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

/** 年龄验证页上「我已成年」这类按钮的文字特征 */
const AGE_GATE_TEXTS = [/確認/, /确认/, /進入/, /进入/, /Agree/i, /I am 18/i, /18\s*歲以上/, /18\s*岁以上/];

const noop = () => {};

/**
 * 按优先级启动浏览器：系统 Chrome → 常见路径的 chrome.exe → Playwright 自带 chromium。
 * 全失败时抛出带原因的错误（调用方决定怎么退出）。
 */
export async function launchBrowser(chromium, { headless = true, log = noop } = {}) {
  const attempts = [['系统 Chrome', { channel: 'chrome' }]];

  for (const exe of CHROME_PATHS) {
    if (exe && existsSync(exe)) attempts.push([`chrome.exe (${exe})`, { executablePath: exe }]);
  }

  attempts.push(['Playwright chromium', {}]);

  const errors = [];
  for (const [label, extra] of attempts) {
    try {
      const browser = await chromium.launch({
        headless,
        args: ['--disable-blink-features=AutomationControlled'],
        ...extra,
      });
      log(`使用浏览器：${label} ${browser.version()}`);
      return browser;
    } catch (err) {
      errors.push(`${label}: ${String(err?.message || err).split('\n')[0].slice(0, 160)}`);
    }
  }

  throw new Error(`启动浏览器失败：\n  ${errors.join('\n  ')}\n提示：可以运行 npx playwright install chromium`);
}

function cookieList(rawCookie, origin) {
  return String(rawCookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))
    .map((part) => {
      const index = part.indexOf('=');
      return { name: part.slice(0, index).trim(), value: part.slice(index + 1).trim(), url: `${origin}/` };
    });
}

/**
 * 打开一个页面会话。批量场景下复用同一个 browser + session，
 * 每部影片只做一次 goto，省掉反复开关上下文。
 */
export async function createPageSession(browser, { origin, cookie = '', timeoutMs = 30000, log = noop } = {}) {
  const context = await browser.newContext({ userAgent: UA, locale: 'zh-CN' });

  if (cookie) {
    try {
      await context.addCookies(cookieList(cookie, origin));
    } catch (err) {
      log(`Cookie 注入失败（忽略）：${String(err?.message || err).split('\n')[0]}`);
    }
  }

  const page = await context.newPage();

  /** 尝试点掉年龄验证页。返回是否点了。 */
  async function passAgeGate() {
    for (const selector of ['button', 'a', 'input[type="submit"]']) {
      const items = page.locator(selector);
      const count = Math.min(await items.count().catch(() => 0), 80);

      for (let i = 0; i < count; i += 1) {
        const element = items.nth(i);
        try {
          const text = (await element.innerText({ timeout: 500 })) || '';
          const value = text || (await element.getAttribute('value', { timeout: 500 })) || '';
          if (!AGE_GATE_TEXTS.some((pattern) => pattern.test(value))) continue;

          await element.click({ timeout: 2000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          log(`已点击年龄验证：${value.trim().slice(0, 20)}`);
          return true;
        } catch {
          /* 元素不可点就跳过 */
        }
      }
    }
    return false;
  }

  /** 打开某部影片的详情页，返回渲染后的 HTML。 */
  async function open(code) {
    const url = `${origin}/${encodeURIComponent(code)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    let html = await page.content();

    if (isAgeGate(html)) {
      const passed = await passAgeGate();
      if (!passed) {
        const err = new Error('年龄验证页无法自动通过');
        err.code = 'AGE_GATE';
        throw err;
      }
      html = await page.content();
    }

    // 正文可能稍后才渲染，等不到就先用当前 HTML
    await page.locator('.movie, h3').first().waitFor({ timeout: 8000 }).catch(() => {});
    html = await page.content();

    return { html, url };
  }

  function checkImage(type, bytes) {
    if (!type.startsWith('image/')) {
      throw new Error(`返回的不是图片（content-type=${type || '空'}，${bytes} 字节）`);
    }
    if (bytes < MIN_IMAGE_BYTES) {
      throw new Error(`图片过小（${bytes} 字节），多半是错误页或下载中断`);
    }
  }

  /**
   * 在页面里 fetch 图片字节。
   *
   * 不用 context.request：那是 Node 侧的请求，不走浏览器的网络栈。
   * 实际遇到过「页面能打开、剧照能下，但封面走 Node 侧 ETIMEDOUT」。
   */
  async function fetchInPage(url) {
    return page.evaluate(async (target) => {
      try {
        const res = await fetch(target, { credentials: 'include' });
        if (!res.ok) {
          return { ok: false, status: res.status, type: res.headers.get('content-type') || '', base64: '' };
        }
        const buffer = new Uint8Array(await res.arrayBuffer());

        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < buffer.length; i += chunk) {
          binary += String.fromCharCode.apply(null, buffer.subarray(i, i + chunk));
        }

        return { ok: true, status: res.status, type: res.headers.get('content-type') || '', base64: btoa(binary) };
      } catch (err) {
        return { ok: false, status: 0, type: '', base64: '', error: String(err?.message || err) };
      }
    }, url);
  }

  /** 下图片：先在页面里取，失败退回 Node 侧请求。两条路都校验类型和大小。 */
  async function image(url) {
    const failures = [];

    try {
      const result = await fetchInPage(url);
      if (!result.ok) throw new Error(`HTTP ${result.status}${result.error ? ` ${result.error}` : ''}`);

      const body = Buffer.from(result.base64, 'base64');
      checkImage(result.type.toLowerCase(), body.length);
      return body;
    } catch (err) {
      failures.push(`页面内: ${String(err?.message || err).split('\n')[0].slice(0, 120)}`);
    }

    try {
      const response = await context.request.get(url, {
        headers: { referer: `${origin}/`, 'user-agent': UA },
        timeout: 30000,
      });
      if (!response.ok()) throw new Error(`HTTP ${response.status()}`);

      const type = (response.headers()['content-type'] || '').toLowerCase();
      const body = await response.body();
      checkImage(type, body.length);
      return body;
    } catch (err) {
      failures.push(`Node 侧: ${String(err?.message || err).split('\n')[0].slice(0, 120)}`);
    }

    throw new Error(failures.join(' | ') || '没有可用的下载通道');
  }

  return {
    page,
    context,
    open,
    image,
    close: () => context.close().catch(() => {}),
  };
}

/** 本次没写到的剧照删掉，否则上一轮多出来的会一直留着。 */
async function pruneStaleScreenshots(extraDir, keepNames) {
  const removed = [];
  try {
    for (const name of await readdir(extraDir)) {
      if (keepNames.has(name)) continue;
      if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) continue;
      await rm(join(extraDir, name), { force: true });
      removed.push(name);
    }
  } catch {
    /* 忽略 */
  }
  return removed;
}

/**
 * 把元数据和图片写进 targetDir：
 *   <code>.nfo / -poster.jpg（裁右半）/ -fanart.jpg / -thumb.jpg / extrafanart/
 * 返回写入的文件列表（相对 targetDir）。
 */
export async function writeMetadataFiles(meta, code, targetDir, { session = null, withImages = true, log = noop } = {}) {
  const extraDir = join(targetDir, 'extrafanart');
  await mkdir(extraDir, { recursive: true });

  const saved = [];
  const written = new Set();

  if (withImages && session) {
    let coverWritten = false;

    if (meta.cover) {
      try {
        const cover = await session.image(meta.cover);

        await writeFile(join(targetDir, `${code}-fanart.jpg`), cover);
        await writeFile(join(targetDir, `${code}-thumb.jpg`), cover);
        saved.push(`${code}-fanart.jpg`, `${code}-thumb.jpg`);

        // 封面是横向拼图：poster 裁右半，否则 Emby 里是一条扁横图
        const poster = (await cropRightHalf(cover, { name: code })) || cover;
        await writeFile(join(targetDir, `${code}-poster.jpg`), poster);
        saved.push(`${code}-poster.jpg`);

        coverWritten = true;
        log(poster === cover ? '封面已下载（裁切跳过，用整张）' : '封面已下载（poster 已裁右半）');
      } catch (err) {
        log(`封面下载失败: ${String(err?.message || err).split('\n')[0]}`);
      }
    }

    let index = 0;
    let firstSample = null;

    for (const sampleUrl of meta.samples || []) {
      try {
        const buffer = await session.image(sampleUrl);
        index += 1;
        const name = `extrafanart-${index}.jpg`;
        await writeFile(join(extraDir, name), buffer);
        written.add(name);
        saved.push(`extrafanart/${name}`);
        if (!firstSample) firstSample = buffer;
      } catch (err) {
        log(`剧照下载失败（${String(sampleUrl).slice(0, 60)}）: ${String(err?.message || err).split('\n')[0]}`);
      }
    }

    // 封面彻底拿不到时用第一张剧照兜底，否则服务端认为这部片没有封面
    if (!coverWritten && firstSample) {
      for (const suffix of ['fanart', 'thumb', 'poster']) {
        await writeFile(join(targetDir, `${code}-${suffix}.jpg`), firstSample);
        saved.push(`${code}-${suffix}.jpg`);
      }
      log('封面缺失，已用第一张剧照替代');
    }

    const removed = await pruneStaleScreenshots(extraDir, written);
    if (removed.length > 0) log(`清理旧剧照 ${removed.length} 张`);
  }

  await writeFile(join(targetDir, `${code}.nfo`), buildNfo(meta), 'utf8');
  saved.push(`${code}.nfo`);

  return saved;
}
