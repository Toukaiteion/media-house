/**
 * 批量菜单 —— 给 jscan-batch.bat 用的交互入口。
 *
 * 为什么不用 .bat 直接写命令：批处理文件是 GBK 解析的，里面写中文路径
 * （G:\迅雷下载）会乱码。所以 .bat 只留 ASCII，路径和菜单都放在这个 Node 脚本里。
 */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCANNER = join(HERE, 'scan-scraper.mjs');

const INPUT = 'G:\\迅雷下载';
const OUTPUT = 'F:\\迅雷下载\\emby_out';

const MODES = {
  1: {
    label: '只看计划（最多 10 部，不动任何文件）',
    args: ['-l', '10', '--headless', '--dry-run'],
  },
  2: {
    label: '正式跑（最多 10 部：搜刮 + 移动）',
    args: ['-l', '10', '--headless'],
  },
  3: {
    label: '只整理不搜刮（最多 10 部，不联网）',
    args: ['-l', '10', '--skip-scrape'],
  },
  4: {
    label: '大批量（不限数量，适合挂一晚上）',
    args: ['-l', '0', '--headless'],
  },
};

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  if (!existsSync(SCANNER)) {
    console.error(`找不到 ${SCANNER}`);
    console.error('请确认这个脚本和 scan-scraper.mjs 在同一个目录。');
    return 1;
  }

  console.log('============================================');
  console.log(`  输入目录: ${INPUT}`);
  console.log(`  输出目录: ${OUTPUT}`);
  console.log('============================================');
  for (const [key, mode] of Object.entries(MODES)) {
    console.log(`  ${key}. ${mode.label}`);
  }
  console.log('--------------------------------------------');

  const choice = (await ask('请选择 [1/2/3/4，直接回车 = 1]: ')) || '1';
  const mode = MODES[choice];

  if (!mode) {
    console.error(`无效选择: ${choice}`);
    return 1;
  }

  console.log(`\n>>> ${mode.label}\n`);

  const result = spawnSync(
    process.execPath,
    [SCANNER, INPUT, '-o', OUTPUT, '-m', '1G', ...mode.args],
    { stdio: 'inherit', cwd: HERE },
  );

  if (result.error) {
    console.error(`启动失败: ${result.error.message}`);
    return 1;
  }

  console.log('\n============================================');
  console.log(`  结束（退出码 ${result.status}）`);
  console.log('============================================');
  return result.status ?? 0;
}

main()
  .then(async (code) => {
    // 窗口是 pause 住的，别让它直接关掉
    await ask('\n按回车退出…');
    process.exit(code);
  })
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
