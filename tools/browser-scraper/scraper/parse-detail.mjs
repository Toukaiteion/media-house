/**
 * 详情页解析与 NFO 生成 —— jfetch / jrender 共用。
 *
 * 规则来自 actor-feed 的 adapter：站点是服务端渲染的，HTML 里就有数据，
 * 所以用正则直接啃，不引 DOM 库，也不用浏览器。
 *
 * 只放纯函数：给一段 HTML 出元数据，不碰网络、不碰文件，方便用
 * `--html 保存的页面` 离线验证。
 */

export const DEFAULT_ORIGIN = 'https://www.javbus.com';
export const MIN_IMAGE_BYTES = 2048;
export const MAX_SAMPLES = 10;

/** 年龄验证页的特征串 */
export const AGE_GATE_MARKERS = ['Age Verification', '/doc/driver-verify'];

export function isAgeGate(html) {
  return AGE_GATE_MARKERS.some((marker) => String(html || '').includes(marker));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(input) {
  if (!input) return '';
  return String(input).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const value = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

export function stripTags(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

export function absolute(url, origin = DEFAULT_ORIGIN) {
  if (!url) return '';
  try {
    return new URL(url.trim(), origin).href;
  } catch {
    return '';
  }
}

/**
 * 详情页里每个字段是独立的 <p>：
 *   <p><span class="header">發行日期:</span> 2026-10-23</p>
 * 闭合的 </p> 可能在下一行，所以非贪婪跨行匹配。
 */
export function fieldByLabel(html, labels) {
  for (const label of labels) {
    const re = new RegExp(
      `<p[^>]*>\\s*<span class="header"[^>]*>\\s*${label}\\s*[：:]?\\s*</span>([\\s\\S]*?)</p>`,
      'i',
    );
    const match = html.match(re);
    if (match) return match[1];
  }
  return '';
}

/**
 * 纯函数：详情页 HTML → 元数据。
 */
export function parseDetailPage(html, origin = DEFAULT_ORIGIN) {
  let title = stripTags(html.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || '');
  if (!title) {
    title = stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s*-\s*JavBus\s*$/i, '');
  }

  const cover = absolute(
    html.match(/<a class="bigImage"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i)?.[1] || '',
    origin,
  );

  const samples = [];
  for (const match of html.matchAll(/<a class="sample-box"[^>]+href="([^"]+)"/gi)) {
    const url = absolute(match[1], origin);
    if (url && !samples.includes(url)) samples.push(url);
  }

  // 一个 <span class="genre"> 里可能塞多个 <label><a>，先圈 span 再逐个取
  const genres = [];
  for (const span of html.matchAll(/<span class="genre">([\s\S]*?)<\/span>/gi)) {
    for (const anchor of span[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = stripTags(anchor[1]);
      // 「多選提交」是按钮不是分类
      if (text && text !== '多選提交' && !genres.includes(text)) genres.push(text);
    }
  }

  const actors = [];
  for (const match of html.matchAll(/<div class="star-name">\s*<a([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const text = stripTags(match[2]);
    if (text && !actors.includes(text)) actors.push(text);
  }

  const code = stripTags(fieldByLabel(html, ['識別碼', '识别码', '番号', '品番']))
    .replace(/\s+/g, '')
    .toUpperCase();

  const releasedate = stripTags(fieldByLabel(html, ['發行日期', '发行日期', '配信開始日']));
  const runtimeText = stripTags(fieldByLabel(html, ['長度', '长度', '収録時間']));
  const runtimeMatch = runtimeText.match(/(\d+)/);

  return {
    code,
    title,
    releasedate: /^\d{4}-\d{2}-\d{2}$/.test(releasedate) ? releasedate : '',
    year: releasedate.slice(0, 4) || '',
    runtime: runtimeMatch ? Number(runtimeMatch[1]) : null,
    director: stripTags(fieldByLabel(html, ['導演', '导演', '監督'])),
    studio: stripTags(fieldByLabel(html, ['製作商', '制作商', 'メーカー'])),
    label: stripTags(fieldByLabel(html, ['發行商', '发行商', 'レーベル'])),
    series: stripTags(fieldByLabel(html, ['系列', 'シリーズ'])),
    genres,
    actors,
    cover,
    samples: samples.slice(0, MAX_SAMPLES),
  };
}

// ---------------- NFO ----------------

function cdata(value) {
  const text = String(value ?? '');
  if (!text) return '';
  return `<![CDATA[${text.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 字段顺序对齐 Emby / Jellyfin 的识别习惯。 */
export function buildNfo(meta) {
  const code = meta.code || '';
  const title = meta.title ? `${code} - ${meta.title}`.replace(/^ - /, '') : code;

  const genres = (meta.genres || []).map((g) => `  <genre>${xmlEscape(g)}</genre>`).join('\n');
  const tags = (meta.genres || []).map((g) => `  <tag>${xmlEscape(g)}</tag>`).join('\n');
  const actors = (meta.actors || [])
    .map((name) => `  <actor>\n    <name>${xmlEscape(name)}</name>\n  </actor>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${cdata(title)}</title>
  <originaltitle>${cdata(title)}</originaltitle>
  <sorttitle>${cdata(code)}</sorttitle>
  <customrating>JP-18+</customrating>
  <mpaa>JP-18+</mpaa>
  <studio>${xmlEscape(meta.studio || '')}</studio>
  <maker>${xmlEscape(meta.studio || '')}</maker>
  <label>${xmlEscape(meta.label || '')}</label>
  <year>${xmlEscape(meta.year || '')}</year>
  <premiered>${xmlEscape(meta.releasedate || '')}</premiered>
  <releasedate>${xmlEscape(meta.releasedate || '')}</releasedate>
  <runtime>${meta.runtime || 0}</runtime>
  <director>${xmlEscape(meta.director || '')}</director>
  <plot>${cdata(meta.title)}</plot>
  <outline>${cdata(meta.title)}</outline>
  <poster>${xmlEscape(code)}-poster.jpg</poster>
  <thumb>${xmlEscape(code)}-thumb.jpg</thumb>
  <fanart>${xmlEscape(code)}-fanart.jpg</fanart>
  <cover>${xmlEscape(meta.cover || '')}</cover>
  <num>${xmlEscape(code)}</num>
  <website>${xmlEscape(meta.website || '')}</website>
${actors}
${genres}
${tags}
</movie>
`;
}

/** 补 existmag=all —— 它决定列表范围，从浏览器复制 Cookie 时最常漏这个。 */
export function normalizeCookie(raw) {
  const parts = String(raw || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return '';
  if (!parts.some((p) => p.toLowerCase().startsWith('existmag='))) {
    parts.push('existmag=all');
  }
  return parts.join('; ');
}
