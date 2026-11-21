/**
 * 图片处理：海报右半裁切。
 *
 * JavBus 的封面是横向拼图：左半是封底截图拼贴，右半才是真正的正面封面。
 * 整张塞给 Emby / Jellyfin 当 poster 会显示成一条扁横图，所以 poster 要裁右半，
 * fanart / thumb 保留整张（当背景正好）。
 *
 * 为什么不引 sharp：整个工具是零依赖的，为一个 JPEG 裁切引入几十 MB 的
 * 原生模块不划算。Windows 自带 System.Drawing，一次调用几百毫秒，
 * 而搜刮本身就要好几秒，这点开销可以忽略。
 *
 * 非 Windows 平台直接返回 null，调用方退回整张图 —— 宁可海报难看，
 * 也不能因为裁图失败让整条搜刮记录失败。
 */

import { spawn } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PS = 'powershell.exe';

/** PowerShell 单引号字符串里，单引号本身要写两遍 */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(script, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(PS, ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('裁剪超时'));
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      err += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim().split('\n')[0] || `PowerShell 退出码 ${code}`));
    });
  });
}

const SCRIPT = (src, dst) => `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile(${psQuote(src)})
try {
  # 单张竖版封面（宽高比 < 1.2）本来就对，不要乱裁
  if ($src.Width -lt ($src.Height * 1.2)) {
    Copy-Item -LiteralPath ${psQuote(src)} -Destination ${psQuote(dst)} -Force
    exit 0
  }

  # 接缝不在正中间：正好切一半时左边还会留一条封底的边，
  # 所以从正中再往右让 2.5%，再多让 2px 把残留边缘削干净。
  $trim = [int][Math]::Round($src.Width * 0.025) + 2
  $left = [int][Math]::Floor($src.Width / 2) + $trim
  $w = $src.Width - $left
  $h = $src.Height
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $destRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $srcRect = New-Object System.Drawing.Rectangle($left, 0, $w, $h)
  $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]92)
  $bmp.Save(${psQuote(dst)}, $codec, $params)
  $bmp.Dispose()
} finally {
  $src.Dispose()
}
`;

/**
 * 取封面右半部分作为 poster。失败返回 null，调用方用整张图。
 */
export async function cropRightHalf(buffer, { name = 'poster' } = {}) {
  if (process.platform !== 'win32') return null;
  if (!buffer || buffer.length === 0) return null;

  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const src = join(tmpdir(), `mh-${name}-${token}.jpg`);
  const dst = join(tmpdir(), `mh-${name}-${token}-crop.jpg`);

  try {
    await writeFile(src, buffer);
    await runPowerShell(SCRIPT(src, dst));
    const out = await readFile(dst);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  } finally {
    unlink(src).catch(() => {});
    unlink(dst).catch(() => {});
  }
}
