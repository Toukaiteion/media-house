#!/usr/bin/env node
/**
 * jscan —— 批量扫描 + 搜刮 + 整理（Playwright）。
 *
 * 和 jsearch 做的是同一件事，但不依赖 jcatch / chromedriver：
 *   1. 递归扫描目录，挑出体积达标的视频
 *   2. 从文件名解析番号（会学习前缀，和 jsearch 共用 prefixes.json）
 *   3. 逐部用浏览器抓元数据，写进 <输出>/<番号>/
 *   4. 把视频改名成 <番号>.mp4 一起挪进那个目录
 *
 * 用法：
 *   node scan-scraper.mjs G:\迅雷下载 -o F:\迅雷下载\emby_out -m 1G -l 3
 *   node scan-scraper.mjs G:\迅雷下载 -o F:\迅雷下载\emby_out --dry-run
 *   node scan-scraper.mjs G:\迅雷下载 -o F:\迅雷下载\emby_out --skip-scrape   # 只整理
 *
 * 退出码：0 全部成功 / 1 有失败 / 2 需要 Cookie / 3 没找到可处理的视频
 */

import { copyFile, mkdir, readdir, rename, stat, unlink, readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';

import { DEFAULT_ORIGIN, isAgeGate, normalizeCookie, parseDetailPage } from './parse-detail.mjs';
import { createPageSession, launchBrowser, writeMetadataFiles } from './scrape-core.mjs';

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.rmvb', '.rm',
]);

const log = (message) => console.error(`[jscan] ${message}`);

// ---------------- 参数 ----------------

function parseArgs(argv) {
  const options = {
    directory: '',
    output: '',
    minSizeMb: 1024,
    limit: 3,
    origin: process.env.JSCAN_ORIGIN || DEFAULT_ORIGIN,
    cookie: '',
    cookieFile: join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'cookie.txt'),
    headless: true,
    timeoutMs: 30000,
    move: true,
    dryRun: false,
    force: false,
    skipScrape: false,
    delayMin: 5,
    delayMax: 10,
    prefixFile: join(homedir(), '.jsearch', 'prefixes.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];

    switch (arg) {
      case '-o':
      case '--output':
        options.output = next() || '';
        break;
      case '-m':
      case '--min-size':
        options.minSizeMb = parseSize(next() || '1G');
        break;
      case '-l':
      case '--limit':
        options.limit = Number(next() || 3);
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
      case '--no-headless':
        options.headless = false;
        break;
      case '--headless':
        options.headless = true;
        break;
      case '--timeout':
        options.timeoutMs = Number(next() || 30) * 1000;
        break;
      case '--copy':
        options.move = false;
        break;
      case '--move':
        options.move = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--skip-scrape':
        options.skipScrape = true;
        break;
      case '--delay':
        {
          const [min, max] = String(next() || '5-10').split('-');
          options.delayMin = Number(min) || 0;
          options.delayMax = Number(max ?? min) || options.delayMin;
        }
        break;
      case '--prefix-file':
        options.prefixFile = next() || options.prefixFile;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) fail(`未知参数: ${arg}`, 1);
        if (!options.directory) options.directory = arg;
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`jscan —— 批量扫描 + 搜刮 + 整理（Playwright，不依赖 jcatch）

用法: node scan-scraper.mjs <扫描目录> [选项]

选项:
  -o, --output <目录>      整理到的输出目录（默认当前目录）
  -m, --min-size <1G>      最小体积，支持 1G / 1.5G / 500M / 1024(按 MB)
  -l, --limit <N>          最多处理几部，0 = 不限（默认 3）
      --origin <站点>      默认 ${DEFAULT_ORIGIN}
      --cookie <字符串>    年龄验证用的 Cookie
      --cookie-file <路径> 默认与脚本同目录的 cookie.txt
      --no-headless        显示浏览器窗口
      --timeout <秒>       页面加载超时，默认 30
      --copy               复制源文件而不是移动
      --dry-run            只列出计划，不动文件
      --force              已搜刮过的也重做
      --skip-scrape        只整理移动，不搜刮
      --delay <5-10>       每部之间随机等待秒数
      --prefix-file <路径> 已知番号前缀，默认 ~/.jsearch/prefixes.json

产物: <输出>/<番号>/{<番号>.nfo, -poster.jpg, -fanart.jpg, -thumb.jpg, extrafanart/, 视频}
退出码: 0 全部成功 / 1 有失败 / 2 需要 Cookie / 3 没找到可处理的视频`);
}

function fail(message, code = 1) {
  console.error(`[jscan] ${message}`);
  process.exit(code);
}

/** 1G → 1024（MB），支持小数：1.5G → 1536 */
function parseSize(text) {
  const raw = String(text).trim().toUpperCase();
  const match = raw.match(/^([\d.]+)\s*([GMKT]?)$/);
  if (!match) return 1024;

  const value = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(value)) return 1024;
  if (unit === 'G') return Math.round(value * 1024);
  if (unit === 'M' || unit === '') return Math.round(value);
  if (unit === 'K') return Math.round(value / 1024);
  if (unit === 'T') return Math.round(value * 1024 * 1024);
  return 1024;
}

// ---------------- 番号解析 ----------------

/**
 * 站点前缀五花八门，直接跑正则会认错：
 *   hhd800.com@IPOK-026        → 会认成 HHD-800
 *   第一會所新片@SIS001@WANZ-150 → 会认成 SIS-001
 * 所以先剥掉域名和 [..]/(..) 标签，再按 @ 取最后一段。
 */
function cleanStem(stem) {
  let text = String(stem || '');

  // hhd800.com@ / www.xxx.net_ / 4k688.com@ 这类站点域名前缀
  text = text.replace(
    /^[A-Za-z0-9._-]+\.(com|net|org|cc|xyz|top|vip|me|tv|info|club|site|tw|cn)\s*[@_\-\s]*/i,
    '',
  );

  // [xxx] 【xxx】 (xxx) 这类标签
  text = text.replace(/\[[^\]]*\]|【[^】]*】|\([^)]*\)/g, ' ');

  // 站点前缀常以 @ 分隔，真正的番号一般在最后一段
  const parts = text.split('@').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : text;
}

/**
 * 在一段文本里挑番号。优先带连字符的形式，其次取最右边那个
 * （站点前缀总在左边，真正的番号在后面）。
 */
function pickCode(text) {
  const matches = [...text.matchAll(/([A-Za-z]{2,6})(-?)(\d{2,5})(?![\dA-Za-z])/g)];
  if (matches.length === 0) return null;

  // 排除域名残渣，例如 hhd800.com 里的 hhd800
  const usable = matches.filter((match) => {
    const rest = text.slice(match.index + match[0].length);
    return !/^\.(com|net|org|cc|xyz|top|vip|me|tv|info|club|site)/i.test(rest);
  });
  if (usable.length === 0) return null;

  const dashed = usable.filter((match) => match[2] === '-');
  const pool = dashed.length > 0 ? dashed : usable;
  const best = pool[pool.length - 1];

  return { code: `${best[1].toUpperCase()}-${best[3]}`, dashed: best[2] === '-' };
}

/**
 * 和 jsearch 一样会「学习前缀」：同一批里出现两次以上的前缀记下来，
 * 下次优先用它匹配。共用 ~/.jsearch/prefixes.json，两个工具互相帮对方。
 * 只学带连字符的形式，避免把 hhd800 这种站点名当成前缀记下来。
 */
class CodeExtractor {
  constructor(prefixFile) {
    this.prefixFile = prefixFile;
    this.counter = new Map();
    this.confirmed = new Set();

    try {
      const data = JSON.parse(readFileSync(prefixFile, 'utf8') || '{}');
      for (const prefix of data.confirmed_prefixes || []) this.confirmed.add(String(prefix).toUpperCase());
      for (const [prefix, count] of Object.entries(data.prefix_counter || {})) {
        this.counter.set(String(prefix).toUpperCase(), Number(count) || 0);
      }
      if (this.confirmed.size > 0) log(`已加载已知前缀 ${this.confirmed.size} 个`);
    } catch {
      /* 没有历史记录就从零开始 */
    }
  }

  extract(stem) {
    const text = cleanStem(stem);

    // 1. 先用已知前缀（必须带连字符，否则 hhd800 会被当成 HHD）
    for (const prefix of this.confirmed) {
      const match = text.match(new RegExp(`\\b${prefix}-(\\d{2,5})(?![\\dA-Za-z])`, 'i'));
      if (match) return `${prefix.toUpperCase()}-${match[1]}`;
    }

    // 2. 通用模式
    const picked = pickCode(text);
    if (!picked) return null;

    if (picked.dashed) {
      const prefix = picked.code.split('-')[0];
      this.counter.set(prefix, (this.counter.get(prefix) || 0) + 1);
    }

    return picked.code;
  }

  save() {
    const learned = [...this.counter.entries()]
      .filter(([prefix, count]) => count >= 2 && !this.confirmed.has(prefix))
      .map(([prefix]) => prefix);

    for (const prefix of learned) this.confirmed.add(prefix);
    if (learned.length === 0) return;

    try {
      mkdirSync(dirname(this.prefixFile), { recursive: true });
      writeFileSync(
        this.prefixFile,
        JSON.stringify(
          { confirmed_prefixes: [...this.confirmed], prefix_counter: Object.fromEntries(this.counter) },
          null,
          2,
        ),
        'utf8',
      );
      log(`已记录番号前缀：${learned.join(', ')}`);
    } catch (err) {
      // 权限不足（例如被沙箱限制）不该影响本次结果，提示一次就够了
      log(`前缀文件写不进去，跳过：${String(err?.message || err).split('\n')[0]}`);
    }
  }
}

// ---------------- 扫描 ----------------

async function collectVideos(directory, { minSizeMb, outputDir, extractor }) {
  const found = [];
  const skipped = { small: 0, noCode: 0, inOutput: 0, errors: 0 };

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      skipped.errors += 1;
      return;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);

      if (entry.isDirectory()) {
        // 输出目录可能在扫描目录里面，别把自己的产物再扫一遍
        if (outputDir && resolve(full).toLowerCase() === resolve(outputDir).toLowerCase()) {
          skipped.inOutput += 1;
          continue;
        }
        await walk(full);
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) continue;

      let info;
      try {
        info = await stat(full);
      } catch {
        skipped.errors += 1;
        continue;
      }

      const sizeMb = info.size / (1024 * 1024);
      if (sizeMb < minSizeMb) {
        skipped.small += 1;
        continue;
      }

      const code = extractor.extract(entry.name.slice(0, -extension.length));
      if (!code) {
        skipped.noCode += 1;
        continue;
      }

      found.push({ path: full, name: entry.name, extension, sizeMb, code });
    }
  }

  await walk(directory);
  return { found, skipped };
}

/** 同一个番号可能有多个版本，留最大的那个；返回被放弃的份数，方便结束时提示。 */
function dedupe(items) {
  const byCode = new Map();
  const dropped = new Map();

  for (const item of items) {
    const exists = byCode.get(item.code);
    if (!exists || item.sizeMb > exists.sizeMb) {
      if (exists) dropped.set(item.code, (dropped.get(item.code) || 0) + 1);
      byCode.set(item.code, item);
    } else {
      dropped.set(item.code, (dropped.get(item.code) || 0) + 1);
    }
  }

  return { items: [...byCode.values()], dropped };
}

// ---------------- 文件整理 ----------------

async function safeMove(from, to) {
  try {
    await rename(from, to);
    return 'moved';
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;

    // 跨盘：不支持 rename，只能复制后删源
    await copyFile(from, to);
    await unlink(from);
    return 'copied';
  }
}

/** 目标目录里是否已经有这个番号的视频（扩展名可能和源文件不同） */
function findExistingVideo(dir, code) {
  try {
    const prefix = `${code.toLowerCase()}.`;
    return (
      readdirSync(dir).find(
        (name) => name.toLowerCase().startsWith(prefix) && VIDEO_EXTENSIONS.has(extname(name).toLowerCase()),
      ) || null
    );
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** 读当前进程的完整性级别：Low 基本只能写自己的工作区 */
function integrityLevel() {
  try {
    const out = execSync('whoami /groups', { encoding: 'latin1' });
    const match = out.match(/S-1-16-(\d+)/);
    if (!match) return null;
    return { 4096: 'LOW', 8192: 'MEDIUM', 12288: 'HIGH' }[match[1]] || match[1];
  } catch {
    return null;
  }
}

/**
 * 输出目录写不进去时，在动手之前就报错。
 * 否则会「搜刮完 3 部、每部都报一次 EPERM」，还白白拉了流量。
 */
async function assertWritableOutput(directory) {
  try {
    await mkdir(directory, { recursive: true });
    const probe = join(directory, `.jscan-write-${process.pid}.tmp`);
    await writeFile(probe, 'ok');
    await unlink(probe);
  } catch (err) {
    if (err?.code !== 'EPERM' && err?.code !== 'EACCES') throw err;

    const level = integrityLevel();

    if (level === 'LOW') {
      fail(
        `无法写入输出目录：${directory}\n` +
          `  (${err.code}) 当前进程跑在 Low 完整性级别 —— 浏览器被安全软件"防护/沙箱"限制时就是这样，\n` +
          `  这种进程只能写自己创建的工作区，写不了 F: 盘、也写不了用户目录。\n` +
          `  三个办法（任选其一）：\n` +
          `   1. 给输出目录降级（管理员 PowerShell 跑一次，括号要加引号）：\n` +
          `        icacls "${directory}" /setintegritylevel "(OI)(CI)L"\n` +
          `      还原：把 L 改成 M 再跑一次\n` +
          `   2. 在普通终端里直接运行（推荐，批量任务本来也适合）\n` +
          `        node "<脚本路径>" "${directory}" -o <输出目录> -m 1G -l 3\n` +
          `   3. 在安全软件里给下面两个程序加白，或关掉浏览器的防护/沙箱功能：\n` +
          `        ${process.execPath}\n` +
          `        MediaHouseScraperHost.exe（浏览器工具目录里的宿主）`,
        1,
      );
    }

    fail(
      `无法写入输出目录：${directory}\n` +
        `  (${err.code}) 目录可能被安全软件保护，或当前账户没有写权限。\n` +
        `  换个可写目录，或在安全软件里把这俩加入信任：\n` +
        `    ${process.execPath}\n` +
        `    （宿主程序 MediaHouseScraperHost.exe）`,
      1,
    );
  }
}

function randomDelay(min, max) {
  if (max <= 0) return 0;
  return Math.round((min + Math.random() * Math.max(0, max - min)) * 1000);
}

// ---------------- 主流程 ----------------

async function loadCookie(options) {
  if (options.cookie) return normalizeCookie(options.cookie);

  const fromEnv = process.env.JSCAN_COOKIE || process.env.JAVBUS_COOKIE;
  if (fromEnv) return normalizeCookie(fromEnv);

  try {
    return normalizeCookie((await readFile(options.cookieFile, 'utf8')).trim());
  } catch {
    return '';
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.directory) {
    printHelp();
    fail('缺少扫描目录', 1);
  }

  const inputDir = resolve(options.directory);
  if (!existsSync(inputDir)) fail(`扫描目录不存在: ${inputDir}`, 1);

  const outputDir = resolve(options.output || process.cwd());
  options.origin = options.origin.replace(/\/+$/, '');

  // 权限不够就别开始，省得每部都失败一次
  if (!options.dryRun) await assertWritableOutput(outputDir);

  log(`扫描 ${inputDir}`);
  log(`输出 ${outputDir}｜最小 ${options.minSizeMb} MB｜上限 ${options.limit || '不限'}`);

  const extractor = new CodeExtractor(options.prefixFile);
  const { found, skipped } = await collectVideos(inputDir, {
    minSizeMb: options.minSizeMb,
    outputDir,
    extractor,
  });

  log(
    `发现 ${found.length} 个候选（跳过：太小 ${skipped.small}、无番号 ${skipped.noCode}` +
      `${skipped.inOutput ? `、输出目录内 ${skipped.inOutput}` : ''}${skipped.errors ? `、读取失败 ${skipped.errors}` : ''}）`,
  );

  const deduped = dedupe(found);
  let candidates = deduped.items.sort((a, b) => b.sizeMb - a.sizeMb);

  if (deduped.dropped.size > 0) {
    const detail = [...deduped.dropped.entries()].map(([code, count]) => `${code}×${count}`).join('、');
    log(`同番号多版本，保留了最大的一份：${detail}`);
  }

  // 只有「元数据」和「视频」都已就位才算完成，否则还得跑一趟
  // （上一轮可能在写元数据之后才失败，比如移动被安全软件拒了）
  const alreadyDone = [];

  if (!options.force) {
    const before = candidates.length;
    candidates = candidates.filter((item) => {
      const dir = join(outputDir, item.code);
      const scraped = existsSync(join(dir, `${item.code}.nfo`));
      const moved = Boolean(findExistingVideo(dir, item.code));
      if (scraped && moved) {
        alreadyDone.push(item);
        return false;
      }
      return true;
    });

    if (alreadyDone.length > 0) {
      log(`跳过已完成（元数据 + 视频都已就位）${before - candidates.length} 部（--force 可重做）`);

      // 这些源文件还躺在输入目录里（多半是重复下载的副本），提醒一下免得占空间
      const leftovers = alreadyDone.slice(0, 5).map((item) => item.path);
      log(`  对应源文件仍在原地，确认后可手动删除：${leftovers.join('、')}${alreadyDone.length > 5 ? ' …' : ''}`);
    }
  }

  if (options.limit > 0) candidates = candidates.slice(0, options.limit);

  if (candidates.length === 0) {
    log('没有需要处理的视频');
    extractor.save();
    return 0;
  }

  log(`本次处理 ${candidates.length} 部`);
  for (const [index, item] of candidates.entries()) {
    log(`  ${index + 1}. ${item.code}  ${item.sizeMb.toFixed(0)} MB  ${item.name}`);
  }

  if (options.dryRun) {
    log('--dry-run：到这里就结束，没有改动任何文件');
    return 0;
  }

  const cookie = await loadCookie(options);
  const succeeded = [];
  const failed = [];

  let browser = null;
  let session = null;
  let ageGateBlocked = false;

  try {
    if (!options.skipScrape) {
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
    }

    for (const [index, item] of candidates.entries()) {
      const { code } = item;
      const targetDir = join(outputDir, code);
      const scraped = existsSync(join(targetDir, `${code}.nfo`));
      const existingVideo = findExistingVideo(targetDir, code);

      log(
        `[${index + 1}/${candidates.length}] ${code}  ${item.sizeMb.toFixed(0)} MB` +
          `${scraped ? '｜已有元数据' : ''}`,
      );

      try {
        await mkdir(targetDir, { recursive: true });

        // 「要不要搜刮」和「要不要移动」是两件事：
        // 上一轮可能在写元数据之后才失败（比如移动被拒），
        // 这时元数据已存在但视频还在原地，不能整条跳过。
        if (!options.skipScrape && (!scraped || options.force)) {
          const { html, url } = await session.open(code);
          if (isAgeGate(html)) {
            throw Object.assign(new Error('年龄验证页无法自动通过'), { code: 'AGE_GATE' });
          }

          const meta = parseDetailPage(html, options.origin);
          if (!meta.title) throw new Error('页面上解析不到标题（番号可能不存在或站点改版）');
          if (!meta.code) meta.code = code;
          meta.website = url;

          await writeMetadataFiles(meta, code, targetDir, { session, withImages: true, log });
          log(`  元数据完成：${meta.title.slice(0, 40)}`);
        } else if (scraped && !options.skipScrape) {
          log('  元数据已存在，跳过搜刮（--force 可重做）');
        }

        const targetVideo = join(targetDir, `${code}${item.extension}`);
        if (resolve(item.path).toLowerCase() === targetVideo.toLowerCase()) {
          log('  视频已在目标位置');
        } else if (existingVideo) {
          log(`  目标目录已有视频 ${existingVideo}，保留源文件`);
        } else {
          let how;
          if (options.move) {
            how = await safeMove(item.path, targetVideo);
          } else {
            await copyFile(item.path, targetVideo);
            how = 'copied';
          }
          log(`  视频已${how === 'moved' ? '移动' : '复制'}到 ${targetVideo}`);
        }

        succeeded.push(code);
      } catch (err) {
        const message = String(err?.message || err).split('\n')[0];
        failed.push({ code, path: item.path, error: message });
        log(`  失败：${message}`);

        if (err?.code === 'AGE_GATE') {
          ageGateBlocked = true;
          log('  年龄验证过不去，后面的就不再白跑了');
          break;
        }
      }

      const wait = index < candidates.length - 1 ? randomDelay(options.delayMin, options.delayMax) : 0;
      if (wait > 0) {
        log(`  等待 ${(wait / 1000).toFixed(1)} 秒…`);
        await sleep(wait);
      }
    }
  } finally {
    if (session) await session.close();
    if (browser) await browser.close().catch(() => {});
  }

  extractor.save();

  // 总结走 stdout，宿主/脚本可以直接解析
  const summary = {
    scanned: found.length,
    processed: succeeded.length + failed.length,
    succeeded: succeeded.length,
    failed: failed.length,
    output: outputDir,
    failures: failed,
  };
  console.log(JSON.stringify(summary, null, 2));

  log('=========== 结果 ===========');
  log(`成功 ${succeeded.length} 部${succeeded.length ? '：' + succeeded.join(', ') : ''}`);
  if (failed.length > 0) {
    log(`失败 ${failed.length} 部：`);
    for (const item of failed) log(`  ✗ ${item.code}  ${item.error}`);
  }

  if (ageGateBlocked) return 2;
  return failed.length > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => fail(String(err?.message || err), 1));
