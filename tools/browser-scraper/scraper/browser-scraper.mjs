#!/usr/bin/env node
/**
 * jrender —— Playwright 版采集器（Node）。
 *
 * 和 jfetch 的区别只在于「怎么拿到 HTML」：
 *   jfetch  纯 HTTP，最快，但过不了年龄验证 / JS 渲染页
 *   jrender 真浏览器渲染 + 自动点年龄验证，慢一点但通吃
 * 解析、NFO、落盘全部复用 parse-detail.mjs，所以结果与 jfetch 一致。
 *
 * 不需要 chromedriver：优先用系统装好的 Chrome，其次 Playwright 自带 chromium。
 *
 * 用法：
 *   node browser-scraper.mjs -k SSIS-778 -o G:\tmp\out
 *   node browser-scraper.mjs -k SSIS-778 -o G:\tmp\out --no-headless
 *   node browser-scraper.mjs -k SSIS-778 -o G:\tmp\out --html saved.html   # 离线解析
 *
 * 退出码：0 成功 / 2 需要 Cookie / 3 找不到该番号 / 1 其它错误
 */

import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_ORIGIN,
  MIN_IMAGE_BYTES,
  buildNfo,
  isAgeGate,
  normalizeCookie,
  parseDetailPage,
} from './parse-detail.mjs';
import { cropRightHalf } from './image-ops.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const UA =
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

// ---------------- 参数 ----------------

function parseArgs(argv) {
  const options = {
    code: '',
    output: '',
    origin: process.env.JRENDER_ORIGIN || DEFAULT_ORIGIN,
    cookie: '',
    cookieFile: join(HERE, 'cookie.txt'),
    htmlFile: '',
    debugHtml: false,
    images: true,
    headless: true,
    timeoutMs: 30000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];

    switch (arg) {
      case '-k':
      case '--key':
        options.code = next() || '';
        break;
      case '-o':
      case '--output':
        options.output = next() || '';
        break;
      case '--origin':
        options.origin = next() || DEFAULT_ORIGIN;
        break;
      case '--cookie':
        options.cookie = next() || '';
        break;
      case '--cookie-file':
        options.cookieFile = next() || '';
        break;
      case '--no-images':
        options.images = false;
        break;
      case '--timeout':
        options.timeoutMs = Number(next() || 30) * 1000;
        break;
      case '--debug-html':
        options.debugHtml = true;
        break;
      case '--html':
        options.htmlFile = next() || '';
        break;
      case '--no-headless':
        options.headless = false;
        break;
      case '--headless':
        options.headless = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) fail(`未知参数: ${arg}`, 1);
        if (!options.code) options.code = arg;
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`jrender —— Playwright 版采集器（Node，自动过年龄验证）

用法: node browser-scraper.mjs -k <番号> -o <输出目录> [选项]

选项:
  -k, --key <番号>          例如 SSIS-778
  -o, --output <目录>       产物写到 <目录>/<番号>/
      --origin <站点>       默认 ${DEFAULT_ORIGIN}，直连不通可换镜像
      --cookie <字符串>     年龄验证用的 Cookie，优先于 cookie.txt
      --cookie-file <路径>  默认与脚本同目录的 cookie.txt
      --no-headless         显示浏览器窗口（排查用）
      --no-images           只写 nfo，不下载图片
      --timeout <秒>        页面加载超时，默认 30
      --debug-html          把渲染后的 HTML 存到输出目录
      --html <文件>         离线调试：读本地保存的页面，不启动浏览器

浏览器优先级: 系统 Chrome → 常见路径的 chrome.exe → Playwright 自带 chromium
退出码: 0 成功 / 2 需要 Cookie / 3 找不到该番号 / 1 其它错误`);
}

function fail(message, code = 1) {
  console.error(`[jrender] ${message}`);
  process.exit(code);
}

// ---------------- 浏览器 ----------------

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    fail(
      '没有安装 playwright。在该目录执行：\n' +
        '  npm install playwright\n' +
        `（原始错误：${String(err?.message || err).split('\n')[0]}）`,
      1,
    );
  }
}

async function launchBrowser(chromium, headless) {
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
      console.error(`[jrender] 使用浏览器：${label} ${browser.version()}`);
      return browser;
    } catch (err) {
      errors.push(`${label}: ${String(err?.message || err).split('\n')[0].slice(0, 160)}`);
    }
  }

  fail(
    '启动浏览器失败：\n  ' +
      errors.join('\n  ') +
      '\n提示：可以运行 `npx playwright install chromium` 下载自带浏览器',
    1,
  );
}

/**
 * 尝试点掉年龄验证页。返回是否点了。
 * 站点的按钮文字五花八门，这里按内容匹配而不是按选择器。
 */
async function passAgeGate(page) {
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
        console.error(`[jrender] 已点击年龄验证：${value.trim().slice(0, 20)}`);
        return true;
      } catch {
        /* 元素不可点就跳过 */
      }
    }
  }

  return false;
}

async function fetchHtml(options, cookie) {
  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium, options.headless);

  try {
    const context = await browser.newContext({ userAgent: UA, locale: 'zh-CN' });

    if (cookie) {
      try {
        await context.addCookies(
          cookie
            .split(';')
            .map((part) => part.trim())
            .filter((part) => part.includes('='))
            .map((part) => {
              const [name, ...rest] = part.split('=');
              return { name: name.trim(), value: rest.join('=').trim(), url: `${options.origin}/` };
            }),
        );
      } catch (err) {
        console.error(`[jrender] Cookie 注入失败（忽略）：${String(err?.message || err).split('\n')[0]}`);
      }
    }

    const page = await context.newPage();
    const url = `${options.origin}/${encodeURIComponent(options.code)}`;
    console.error(`[jrender] 打开 ${url}${cookie ? '（带 Cookie）' : '（无 Cookie）'}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });

    let html = await page.content();

    if (isAgeGate(html)) {
      console.error('[jrender] 检测到年龄验证页，尝试自动通过…');
      const passed = await passAgeGate(page);
      if (!passed) {
        throw Object.assign(new Error('年龄验证页无法自动通过'), { exitCode: 2 });
      }
      html = await page.content();
    }

    // 正文可能稍后才渲染出来，等不到就先用当前 HTML
    await page.locator('.movie, h3').first().waitFor({ timeout: 8000 }).catch(() => {});
    html = await page.content();

    const request = context.request;
    return { html, page, request, browser, context };
  } catch (err) {
    await browser.close().catch(() => {});
    if (err?.exitCode === 2) {
      fail(
        '年龄验证页无法自动通过。请在浏览器里手动打开该站过一次验证，' +
          '然后把整段 Cookie 填进 --cookie 或 cookie.txt',
        2,
      );
    }
    throw err;
  }
}

// ---------------- 图片 ----------------

/**
 * 在页面里 fetch 图片字节。
 *
 * 为什么不用 context.request：那是 Node 侧的请求，不走浏览器的网络栈
 * （代理、TLS、Cookie 全都不一样）。实际遇到过「页面能打开、剧照能下，
 * 但封面走 Node 侧直接 ETIMEDOUT」的情况——同一个 host，浏览器能连、
 * Node 连不上。既然 jrender 的目的就是「用浏览器拿数据」，
 * 图片也交给页面去取最稳。
 */
async function fetchImageInPage(page, url) {
  return page.evaluate(async (target) => {
    try {
      const res = await fetch(target, { credentials: 'include' });
      if (!res.ok) {
        return { ok: false, status: res.status, type: res.headers.get('content-type') || '', base64: '' };
      }
      const buffer = new Uint8Array(await res.arrayBuffer());

      // 分块转 base64，避免大图把参数栈打爆
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < buffer.length; i += chunk) {
        binary += String.fromCharCode.apply(null, buffer.subarray(i, i + chunk));
      }

      return {
        ok: true,
        status: res.status,
        type: res.headers.get('content-type') || '',
        base64: btoa(binary),
      };
    } catch (err) {
      return { ok: false, status: 0, type: '', base64: '', error: String(err?.message || err) };
    }
  }, url);
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
 * 下图片：先在页面里取，失败再退回 Node 侧请求。
 * 两条路都做 content-type + 大小校验 —— 图床出错时常返回 200 的 HTML。
 */
async function downloadImage(channels, url, origin) {
  const { page, request } = channels;
  const failures = [];

  if (page) {
    try {
      const result = await fetchImageInPage(page, url);
      if (!result.ok) throw new Error(`HTTP ${result.status}${result.error ? ` ${result.error}` : ''}`);

      const body = Buffer.from(result.base64, 'base64');
      checkImage(result.type.toLowerCase(), body.length);
      return body;
    } catch (err) {
      failures.push(`页面内: ${String(err?.message || err).split('\n')[0].slice(0, 120)}`);
    }
  }

  if (request) {
    try {
      const response = await request.get(url, {
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
  }

  throw new Error(failures.join(' | ') || '没有可用的下载通道');
}

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

// ---------------- 主流程 ----------------

async function loadCookie(options) {
  if (options.cookie) return normalizeCookie(options.cookie);

  const fromEnv = process.env.JRENDER_COOKIE || process.env.JAVBUS_COOKIE;
  if (fromEnv) return normalizeCookie(fromEnv);

  try {
    return normalizeCookie((await readFile(options.cookieFile, 'utf8')).trim());
  } catch {
    return '';
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const code = String(options.code || '').trim().toUpperCase();
  if (!code) {
    printHelp();
    fail('缺少番号（-k）', 1);
  }
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) fail(`不像番号: ${code}`, 1);
  if (!options.output && !options.htmlFile) fail('缺少输出目录（-o）', 1);

  options.code = code;
  options.origin = options.origin.replace(/\/+$/, '');
  const cookie = await loadCookie(options);

  let html;
  let page = null;
  let request = null;
  let browser = null;

  if (options.htmlFile) {
    html = await readFile(options.htmlFile, 'utf8');
    console.error(`[jrender] 离线解析本地页面: ${options.htmlFile}`);
  } else {
    ({ html, page, request, browser } = await fetchHtml(options, cookie));
  }

  try {
    if (isAgeGate(html)) fail('拿到的是年龄验证页，需要先提供有效 Cookie', 2);

    const meta = parseDetailPage(html, options.origin);
    if (!meta.title) {
      fail('页面上没解析到标题，番号可能不存在或站点改版了（加 --debug-html 看原始页面）', 3);
    }
    if (!meta.code) meta.code = code;
    meta.website = `${options.origin}/${code}`;

    const targetDir = join(options.output, code);
    const extraDir = join(targetDir, 'extrafanart');
    await mkdir(extraDir, { recursive: true });

    if (options.debugHtml) {
      const debugPath = join(targetDir, 'debug.html');
      await writeFile(debugPath, html, 'utf8');
      console.error(`[jrender] 原始页面已保存: ${debugPath}`);
    }

    const saved = [];
    const written = new Set();
    const channels = { page, request };

    if (options.images && (page || request)) {
      let coverWritten = false;

      if (meta.cover) {
        try {
          const cover = await downloadImage(channels, meta.cover, options.origin);

          // 封面是横向拼图：fanart / thumb 用整张（当背景刚好），
          // poster 裁右半 —— 整张当海报在 Emby 里会变成一条扁横图
          await writeFile(join(targetDir, `${code}-fanart.jpg`), cover);
          await writeFile(join(targetDir, `${code}-thumb.jpg`), cover);
          saved.push(`${code}-fanart.jpg`, `${code}-thumb.jpg`);

          const poster = (await cropRightHalf(cover, { name: code })) || cover;
          await writeFile(join(targetDir, `${code}-poster.jpg`), poster);
          saved.push(`${code}-poster.jpg`);

          coverWritten = true;
          console.error(
            poster === cover ? '[jrender] 封面已下载（裁切跳过，用整张）' : '[jrender] 封面已下载（poster 已裁右半）',
          );
        } catch (err) {
          console.error(`[jrender] 封面下载失败: ${err.message}`);
        }
      }

      let index = 0;
      let firstSample = null;

      for (const sampleUrl of meta.samples) {
        try {
          const buffer = await downloadImage(channels, sampleUrl, options.origin);
          index += 1;
          const name = `extrafanart-${index}.jpg`;
          await writeFile(join(extraDir, name), buffer);
          written.add(name);
          saved.push(`extrafanart/${name}`);
          if (!firstSample) firstSample = buffer;
        } catch (err) {
          console.error(`[jrender] 剧照下载失败（${sampleUrl.slice(0, 60)}）: ${err.message}`);
        }
      }

      // 封面彻底拿不到时用第一张剧照兜底：海报难看总比没有好，
      // 否则服务端会认为没有封面，详情页一片空白
      if (!coverWritten && firstSample) {
        for (const suffix of ['fanart', 'thumb', 'poster']) {
          await writeFile(join(targetDir, `${code}-${suffix}.jpg`), firstSample);
          saved.push(`${code}-${suffix}.jpg`);
        }
        console.error('[jrender] 封面缺失，已用第一张剧照替代');
      }

      const removed = await pruneStaleScreenshots(extraDir, written);
      if (removed.length > 0) console.error(`[jrender] 清理旧剧照 ${removed.length} 张`);
    }

    await writeFile(join(targetDir, `${code}.nfo`), buildNfo(meta), 'utf8');

    const summary = {
      code,
      title: meta.title,
      releaseDate: meta.releasedate,
      runtime: meta.runtime,
      actors: meta.actors.length,
      genres: meta.genres.length,
      images: saved.length,
      output: targetDir,
    };

    console.log(JSON.stringify(summary, null, 2));
    console.error(
      `[jrender] 完成：${code}｜演员 ${summary.actors} 位｜分类 ${summary.genres} 个｜图片 ${summary.images} 张`,
    );
    process.exit(0);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((err) => fail(String(err?.message || err), 1));
