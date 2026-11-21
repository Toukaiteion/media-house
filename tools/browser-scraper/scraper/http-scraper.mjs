#!/usr/bin/env node
/**
 * jfetch —— 纯 HTTP 采集器（不启动浏览器）。
 *
 * 站点是服务端渲染的，HTML 里就有全部数据，那就不必起浏览器：
 * 一次请求几百毫秒，比 chromedriver / Playwright 快一个数量级。
 * 过不了年龄验证时换 jrender（Playwright）或 jcatch（Selenium）。
 *
 * 产物布局（三套采集器一致，服务端直接认）：
 *   <输出目录>/<番号>/<番号>.nfo
 *   <输出目录>/<番号>/<番号>-poster.jpg
 *   <输出目录>/<番号>/<番号>-fanart.jpg
 *   <输出目录>/<番号>/<番号>-thumb.jpg
 *   <输出目录>/<番号>/extrafanart/extrafanart-1.jpg ...
 *
 * 用法：
 *   node http-scraper.mjs -k SSIS-778 -o G:\tmp\out
 *   node http-scraper.mjs -k SSIS-778 -o G:\tmp\out --cookie "PHPSESSID=xxx"
 *   node http-scraper.mjs -k SSIS-778 -o G:\tmp\out --html saved.html   # 离线解析
 *
 * 退出码：0 成功 / 2 需要 Cookie / 3 找不到该番号 / 1 其它错误
 *
 * 零依赖：只用 Node 内置模块（Node >= 18）。
 */

import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
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

// ---------------- 参数 ----------------

function parseArgs(argv) {
  const options = {
    code: '',
    output: '',
    origin: process.env.JFETCH_ORIGIN || DEFAULT_ORIGIN,
    cookie: '',
    cookieFile: join(HERE, 'cookie.txt'),
    htmlFile: '',
    debugHtml: false,
    images: true,
    timeoutMs: 20000,
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
        options.timeoutMs = Number(next() || 20) * 1000;
        break;
      case '--debug-html':
        options.debugHtml = true;
        break;
      case '--html':
        options.htmlFile = next() || '';
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) fail(`未知参数: ${arg}`, 1);
        if (!options.code) options.code = arg; // 允许 jfetch SSIS-778
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`jfetch —— 纯 HTTP 采集器（不启动浏览器）

用法: node http-scraper.mjs -k <番号> -o <输出目录> [选项]

选项:
  -k, --key <番号>          例如 SSIS-778
  -o, --output <目录>       产物写到 <目录>/<番号>/
      --origin <站点>       默认 ${DEFAULT_ORIGIN}，直连不通可换镜像
      --cookie <字符串>     年龄验证用的 Cookie，优先于 cookie.txt
      --cookie-file <路径>  默认与脚本同目录的 cookie.txt
      --no-images           只写 nfo，不下载图片
      --timeout <秒>        单次请求超时，默认 20
      --debug-html          把抓到的原始 HTML 存到输出目录
      --html <文件>         离线调试：读本地保存的页面，不发请求

退出码: 0 成功 / 2 需要 Cookie / 3 找不到该番号 / 1 其它错误`);
}

function fail(message, code = 1) {
  console.error(`[jfetch] ${message}`);
  process.exit(code);
}

// ---------------- HTTP ----------------

async function loadCookie(options) {
  if (options.cookie) return normalizeCookie(options.cookie);

  const fromEnv = process.env.JFETCH_COOKIE || process.env.JAVBUS_COOKIE;
  if (fromEnv) return normalizeCookie(fromEnv);

  try {
    const text = await readFile(options.cookieFile, 'utf8');
    return normalizeCookie(text.trim());
  } catch {
    return '';
  }
}

async function request(url, { cookie = '', origin = DEFAULT_ORIGIN, timeoutMs = 20000, accept } = {}) {
  return fetch(url, {
    headers: {
      'user-agent': UA,
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      accept: accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      referer: `${origin}/`,
      ...(cookie ? { cookie } : {}),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// ---------------- 图片 ----------------

/** 出错时图床常返回 200 的 HTML 页面，只判断状态码会把错误页当 jpg 写盘。 */
async function downloadImage(url, { cookie, origin, timeoutMs }) {
  const res = await request(url, { cookie, origin, timeoutMs, accept: 'image/*,*/*;q=0.8' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const type = (res.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await res.arrayBuffer());

  if (!type.startsWith('image/')) {
    throw new Error(`返回的不是图片（content-type=${type || '空'}，${buffer.length} 字节）`);
  }
  if (buffer.length < MIN_IMAGE_BYTES) {
    throw new Error(`图片过小（${buffer.length} 字节），多半是错误页或下载中断`);
  }

  return buffer;
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
    /* 目录不存在或删不掉就算了 */
  }
  return removed;
}

// ---------------- 主流程 ----------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const code = String(options.code || '').trim().toUpperCase();
  if (!code) {
    printHelp();
    fail('缺少番号（-k）', 1);
  }
  // 番号会直接当目录名用，挡住路径穿越
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) fail(`不像番号: ${code}`, 1);
  if (!options.output && !options.htmlFile) fail('缺少输出目录（-o）', 1);

  const origin = options.origin.replace(/\/+$/, '');
  const cookie = await loadCookie(options);
  const url = `${origin}/${encodeURIComponent(code)}`;

  let html;

  if (options.htmlFile) {
    html = await readFile(options.htmlFile, 'utf8');
    console.error(`[jfetch] 离线解析本地页面: ${options.htmlFile}`);
  } else {
    console.error(`[jfetch] 抓取 ${url}${cookie ? '（带 Cookie）' : '（无 Cookie）'}`);

    let res;
    try {
      res = await request(url, { cookie, origin, timeoutMs: options.timeoutMs });
    } catch (err) {
      fail(`请求失败: ${err?.message || err}`, 1);
    }

    if (!res.ok) fail(`站点返回 HTTP ${res.status}`, res.status === 404 ? 3 : 1);
    html = await res.text();
  }

  if (isAgeGate(html)) {
    fail(
      '站点要求年龄验证。请在浏览器里打开该站过一次验证，然后：\n' +
        '  1) 面板里把整段 Cookie 粘进「Cookie」参数，或\n' +
        `  2) 把 Cookie 写进 ${options.cookieFile}\n` +
        '  也可以改用 jrender（Playwright）自动过验证',
      2,
    );
  }

  const meta = parseDetailPage(html, origin);
  if (!meta.title) {
    fail('页面上没解析到标题，番号可能不存在或站点改版了（加 --debug-html 可保存原始页面）', 3);
  }
  if (!meta.code) meta.code = code;
  meta.website = url;

  const targetDir = join(options.output, code);
  const extraDir = join(targetDir, 'extrafanart');
  await mkdir(extraDir, { recursive: true });

  if (options.debugHtml) {
    const debugPath = join(targetDir, 'debug.html');
    await writeFile(debugPath, html, 'utf8');
    console.error(`[jfetch] 原始页面已保存: ${debugPath}`);
  }

  const saved = [];
  const written = new Set();

  if (options.images) {
    if (meta.cover) {
      try {
        const cover = await downloadImage(meta.cover, { cookie, origin, timeoutMs: options.timeoutMs });

        // 封面是横向拼图：fanart / thumb 用整张，poster 裁右半
        await writeFile(join(targetDir, `${code}-fanart.jpg`), cover);
        await writeFile(join(targetDir, `${code}-thumb.jpg`), cover);
        saved.push(`${code}-fanart.jpg`, `${code}-thumb.jpg`);

        const poster = (await cropRightHalf(cover, { name: code })) || cover;
        await writeFile(join(targetDir, `${code}-poster.jpg`), poster);
        saved.push(`${code}-poster.jpg`);

        console.error(
          poster === cover ? '[jfetch] 封面已下载（裁切跳过，用整张）' : '[jfetch] 封面已下载（poster 已裁右半）',
        );
      } catch (err) {
        console.error(`[jfetch] 封面下载失败: ${err.message}`);
      }
    }

    let index = 0;
    for (const sampleUrl of meta.samples) {
      try {
        const buffer = await downloadImage(sampleUrl, { cookie, origin, timeoutMs: options.timeoutMs });
        index += 1;
        const name = `extrafanart-${index}.jpg`;
        await writeFile(join(extraDir, name), buffer);
        written.add(name);
        saved.push(`extrafanart/${name}`);
      } catch (err) {
        console.error(`[jfetch] 剧照下载失败（${sampleUrl.slice(0, 60)}）: ${err.message}`);
      }
    }

    const removed = await pruneStaleScreenshots(extraDir, written);
    if (removed.length > 0) console.error(`[jfetch] 清理旧剧照 ${removed.length} 张`);
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
    `[jfetch] 完成：${code}｜演员 ${summary.actors} 位｜分类 ${summary.genres} 个｜图片 ${summary.images} 张`,
  );
  process.exit(0);
}

main().catch((err) => fail(String(err?.message || err), 1));
