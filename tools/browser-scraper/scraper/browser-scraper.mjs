#!/usr/bin/env node
/**
 * jrender —— Playwright 版采集器（Node）。
 *
 * 和 jfetch 的区别只在于「怎么拿到 HTML」：
 *   jfetch  纯 HTTP，最快，但过不了年龄验证 / JS 渲染页
 *   jrender 真浏览器渲染 + 自动点年龄验证，慢一点但通吃
 * 解析、NFO、落盘、图片下载都在 scrape-core.mjs 里，与 jscan 共用。
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DEFAULT_ORIGIN,
  isAgeGate,
  normalizeCookie,
  parseDetailPage,
} from './parse-detail.mjs';
import { createPageSession, launchBrowser, writeMetadataFiles } from './scrape-core.mjs';

// ---------------- 参数 ----------------

function parseArgs(argv) {
  const options = {
    code: '',
    output: '',
    origin: process.env.JRENDER_ORIGIN || DEFAULT_ORIGIN,
    cookie: '',
    cookieFile: new URL('./cookie.txt', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
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

const log = (message) => console.error(`[jrender] ${message}`);

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

// ---------------- 主流程 ----------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const code = String(options.code || '').trim().toUpperCase();
  if (!code) {
    printHelp();
    fail('缺少番号（-k）', 1);
  }
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) fail(`不像番号: ${code}`, 1);
  if (!options.output && !options.htmlFile) fail('缺少输出目录（-o）', 1);

  options.origin = options.origin.replace(/\/+$/, '');
  const cookie = await loadCookie(options);

  let browser = null;
  let session = null;
  let html;
  let url = `${options.origin}/${code}`;

  try {
    if (options.htmlFile) {
      html = await readFile(options.htmlFile, 'utf8');
      log(`离线解析本地页面: ${options.htmlFile}`);
    } else {
      const { chromium } = await import('playwright').catch(() =>
        fail('没有安装 playwright。在该目录执行：\n  npm install playwright', 1),
      );

      browser = await launchBrowser(chromium, { headless: options.headless, log }).catch((err) =>
        fail(String(err?.message || err), 1),
      );
      session = await createPageSession(browser, {
        origin: options.origin,
        cookie,
        timeoutMs: options.timeoutMs,
        log,
      });

      log(`打开 ${url}${cookie ? '（带 Cookie）' : '（无 Cookie）'}`);

      try {
        ({ html, url } = await session.open(code));
      } catch (err) {
        if (err?.code === 'AGE_GATE') {
          fail(
            '年龄验证页无法自动通过。请在浏览器里手动打开该站过一次验证，' +
              '然后把整段 Cookie 填进 --cookie 或 cookie.txt',
            2,
          );
        }
        fail(`打开页面失败：${String(err?.message || err).split('\n')[0].slice(0, 200)}`, 1);
      }
    }

    if (isAgeGate(html)) fail('拿到的是年龄验证页，需要先提供有效 Cookie', 2);

    const meta = parseDetailPage(html, options.origin);
    if (!meta.title) {
      fail('页面上没解析到标题，番号可能不存在或站点改版了（加 --debug-html 看原始页面）', 3);
    }
    if (!meta.code) meta.code = code;
    meta.website = url;

    const targetDir = join(options.output, code);
    await mkdir(targetDir, { recursive: true });

    if (options.debugHtml) {
      const debugPath = join(targetDir, 'debug.html');
      await writeFile(debugPath, html, 'utf8');
      log(`原始页面已保存: ${debugPath}`);
    }

    const saved = await writeMetadataFiles(meta, code, targetDir, {
      session,
      withImages: options.images,
      log,
    });

    const summary = {
      code,
      title: meta.title,
      releaseDate: meta.releasedate,
      runtime: meta.runtime,
      actors: meta.actors.length,
      genres: meta.genres.length,
      images: saved.filter((name) => !name.endsWith('.nfo')).length,
      output: targetDir,
    };

    console.log(JSON.stringify(summary, null, 2));
    log(
      `完成：${code}｜演员 ${summary.actors} 位｜分类 ${summary.genres} 个｜图片 ${summary.images} 张`,
    );
    process.exit(0);
  } finally {
    if (session) await session.close();
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((err) => fail(String(err?.message || err), 1));
