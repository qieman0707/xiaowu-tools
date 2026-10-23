// 海报直接画在 canvas 上：手机微信里也稳，导出就是 canvas 本身，不靠截图库。
// 四种样式各对一组参考图（qieman0707/folk-poster-research 的 folk-posters/）：
//   远方 = style-ref 015「继续向前就是答案」、035「飘向北方」、山歌万里：满版风景 + 巨大白色飞白毛笔字
//   黑白 = 声动南山（张玮玮）、东图张浅潜：米白边框里一张黑白颗粒照片，朱红竖排毛笔字压在照片边上
//   江湖 = style-ref 017/018 水墨侠客、022–024 方寸间：宣纸 + 水墨山水，黑色竖排毛笔字、朱红印章
//   唱片 = style-ref 027/028「剑雨楼」、游声场：炭黑底、黑胶唱片、橘红毛笔大字

const BRUSH = 'XWBrush, XWSerif, "Songti SC", "STSong", serif';
const XING = 'XWXing, XWBrush, XWSerif, serif';
const SERIF = 'XWSerif, "Songti SC", "STSong", serif';
const RED = '#b8361f';

let fontsReady;
export function loadFonts() {
  fontsReady ??= Promise.all([
    new FontFace('XWBrush', 'url(fonts/brush.woff2)').load(),
    new FontFace('XWXing', 'url(fonts/xing.woff2)').load(),
    new FontFace('XWSerif', 'url(fonts/serif.woff2)', { weight: '600' }).load(),
  ]).then((fs) => fs.forEach((f) => document.fonts.add(f)));
  return fontsReady;
}

export const SIZES = { '3:4': [1080, 1440], '9:16': [1080, 1920] };
// 哪些样式要 AI 画面，用哪类画面（远景 far / 近景 near）
export const NEEDS_IMAGE = { yuanfang: 'far', heibai: 'near', jianghu: 'far' };

export async function drawPoster(canvas, p) {
  await loadFonts().catch(() => {});
  const [W, H] = SIZES[p.size] || SIZES['3:4'];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.reset?.();
  ctx.textBaseline = 'middle';
  ({ yuanfang, heibai, jianghu, changpian }[p.tpl] || yuanfang)(ctx, W, H, p);
}

/* ---------- 远方：满版风景，两行错落的白色飞白大字，黄色行书副标斜压 ---------- */
function yuanfang(ctx, W, H, p) {
  if (p.bgImg) cover(ctx, p.bgImg, 0, 0, W, H, 1.06);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#c98a5e');
    g.addColorStop(0.45, '#8a4a2c');
    g.addColorStop(1, '#1d120d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  shade(ctx, 0, H * 0.4, H, 'rgba(10,8,6,0)', 'rgba(10,8,6,.86)');
  shade(ctx, 0, 0, H * 0.16, 'rgba(10,8,6,.4)', 'rgba(10,8,6,0)');
  grain(ctx, W, H, 0.14);

  const cream = '#f6eedf';
  ctx.fillStyle = cream;
  spaced(ctx, ['大冰的小屋', p.branch].filter(Boolean).join(' · '), 72, 92, `600 34px ${SERIF}`, 8);

  // 信息从底往上排，标题压在信息上面
  const lines = info(p);
  const lh = 62;
  let y = H - 100 - (lines.length - 1) * lh;
  const infoTop = Math.min(y - 50, H - 92 - 112 - 30); // 拼音不能压到右下角印章
  ctx.font = `600 40px ${SERIF}`;
  ctx.textAlign = 'left';
  for (const l of lines) {
    ctx.fillText(fit(ctx, l, W - 144 - 170), 72, y);
    y += lh;
  }
  if (p.seal) seal(ctx, p.seal, W - 72 - 112, H - 92 - 112, 112);

  const rows = splitTitle(p.headline);
  const longest = Math.max(...rows.map((r) => [...r].length), 1);
  const hs = Math.min(W * 0.26, (W * 0.84) / longest, (infoTop - H * 0.25) / rows.length / 1.02);
  const pinH = p.pinyin ? 64 : 0;
  const bottom = infoTop - pinH;
  const ink = inkLayer(W, H, (g) => {
    g.fillStyle = cream;
    g.font = `${hs}px ${BRUSH}`;
    rows.forEach((r, i) => {
      const ry = bottom - (rows.length - 1 - i) * hs * 1.02 - hs / 2;
      g.textAlign = i === 0 ? 'left' : 'right';
      g.fillText(r, i === 0 ? W * 0.06 : W * 0.95, ry);
    });
  }, 0.4);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 30;
  ctx.drawImage(ink, 0, 0);
  ctx.restore();

  if (p.pinyin) {
    ctx.fillStyle = 'rgba(246,238,223,.85)';
    ctx.textAlign = 'right';
    spacedRight(ctx, p.pinyin.toLowerCase(), W * 0.95, bottom + 34, `italic 600 30px ${SERIF}`, 3);
  }
  if (p.subline) {
    const top = bottom - rows.length * hs * 1.02;
    // 副标常落在天边，天色一亮黄字就看不清：有画面时字后面先垫一层扁扁的淡暗晕（纯色底不用，垫了反而像一道黑带）
    if (p.bgImg) {
      ctx.save();
      ctx.translate(W * 0.5, top - hs * 0.08);
      ctx.scale(1, 0.2);
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.55);
      halo.addColorStop(0, 'rgba(10,8,6,.55)');
      halo.addColorStop(0.6, 'rgba(10,8,6,.3)');
      halo.addColorStop(1, 'rgba(10,8,6,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(-W * 0.55, -W * 0.55, W * 1.1, W * 1.1);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(W * 0.5, top - hs * 0.08);
    ctx.rotate(-0.07);
    ctx.fillStyle = '#f2c35b';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 16;
    ctx.font = `${fitSize(ctx, p.subline, W * 0.8, 64, XING)}px ${XING}`;
    ctx.fillText(p.subline, 0, 0);
    ctx.restore();
  }
}

/* ---------- 黑白：米白纸边框，黑白颗粒照片，朱红竖排毛笔字压边，手写大日期 ---------- */
function heibai(ctx, W, H, p) {
  ctx.fillStyle = '#ece8e0';
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.12);

  const m = Math.round(W * 0.06);
  const ph = Math.round(H * 0.7);
  ctx.save();
  ctx.beginPath();
  ctx.rect(m, m, W - 2 * m, ph);
  ctx.clip();
  if (p.bgImg) {
    cover(ctx, p.bgImg, m, m, W - 2 * m, ph, 1.06);
    mono(ctx, m, m, W - 2 * m, ph);
  } else {
    const g = ctx.createRadialGradient(W * 0.55, m + ph * 0.45, 0, W * 0.55, m + ph * 0.45, ph * 0.8);
    g.addColorStop(0, '#6b6863');
    g.addColorStop(1, '#151413');
    ctx.fillStyle = g;
    ctx.fillRect(m, m, W - 2 * m, ph);
  }
  grain(ctx, W, H, 0.22);
  ctx.restore();

  // 竖排标题：一行一列，从右往左读
  const rows = splitTitle(p.headline);
  const longest = Math.max(...rows.map((r) => [...r].length), 1);
  const hs = Math.min(W * 0.2, (ph * 0.86) / longest);
  const ink = inkLayer(W, H, (g) => {
    g.fillStyle = '#c4301c';
    rows.forEach((r, i) => vtext(g, r, m + hs * (0.62 + (rows.length - 1 - i) * 1.02), m + 36, hs, 0.98, BRUSH, ''));
  }, 0.4);
  ctx.drawImage(ink, 0, 0);

  if (p.subline) {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    vtext(ctx, p.subline, W - m - 48, m + 56, 34, 1.12, SERIF, '600');
  }

  const day = shortDate(p.lines);
  if (day) {
    ctx.fillStyle = '#c4301c';
    ctx.textAlign = 'right';
    ctx.font = `150px ${XING}`;
    ctx.fillText(day, W - m - 10, m + ph + 6);
  }

  ctx.textAlign = 'left';
  let y = m + ph + (day ? 120 : 80);
  ctx.fillStyle = '#1f1b16';
  spaced(ctx, ['大冰的小屋', p.branch].filter(Boolean).join(' · '), m, y, `600 38px ${SERIF}`, 6);
  y += 64;
  ctx.fillStyle = RED;
  ctx.font = `600 32px ${SERIF}`;
  for (const l of info(p)) {
    if (y > H - 60) break;
    ctx.fillText(fit(ctx, l, W - 2 * m - 130), m, y);
    y += 50;
  }
  if (p.seal) seal(ctx, p.seal, W - m - 96, H - m - 96, 96);
}

/* ---------- 江湖：宣纸 + 水墨山水，黑色竖排毛笔字在右，朱红印章 ---------- */
function jianghu(ctx, W, H, p) {
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(0, 0, W, H);
  const lines = info(p);
  const infoTop = H - 150 - (lines.length - 1) * 52;
  if (p.bgImg) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    cover(ctx, p.bgImg, 0, 0, W, H);
    ctx.restore();
    // 画在左边，右边写字、底下写信息的地方铺一层纸色，盖住画面边缘
    let f = ctx.createLinearGradient(W * 0.3, 0, W * 0.6, 0);
    f.addColorStop(0, 'rgba(239,230,210,0)');
    f.addColorStop(1, 'rgba(239,230,210,.95)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, W, H);
    f = ctx.createLinearGradient(0, infoTop - 140, 0, infoTop - 30);
    f.addColorStop(0, 'rgba(239,230,210,0)');
    f.addColorStop(1, 'rgba(239,230,210,.95)');
    ctx.fillStyle = f;
    ctx.fillRect(0, infoTop - 140, W, H);
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, 'rgba(110,80,40,0)');
  g.addColorStop(1, 'rgba(110,80,40,.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.1);

  const rows = splitTitle(p.headline);
  const longest = Math.max(...rows.map((r) => [...r].length), 1);
  const top = H * 0.07;
  const hs = Math.min(W * 0.19, (infoTop - 60 - top) / (longest + 0.5));
  const x0 = W - 96 - hs / 2;
  let end = top;
  const ink = inkLayer(W, H, (c) => {
    c.fillStyle = '#16130f';
    c.shadowColor = 'rgba(22,19,15,.5)';
    c.shadowBlur = 4;
    rows.forEach((r, i) => { end = Math.max(end, vtext(c, r, x0 - i * hs * 1.05, top + i * hs * 0.5, hs, 1, BRUSH, '')); });
  }, 0.35);
  ctx.drawImage(ink, 0, 0);
  const lastX = x0 - (rows.length - 1) * hs * 1.05;
  if (p.seal) seal(ctx, p.seal, x0 + hs / 2 - 96, Math.min(end + 24, infoTop - 150), 96);
  if (p.subline) {
    ctx.fillStyle = '#2e2821';
    vtext(ctx, p.subline, lastX - hs / 2 - 50, top + 24, 38, 1.12, SERIF, '600');
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#2e2821';
  ctx.font = `600 34px ${SERIF}`;
  let y = infoTop;
  for (const l of lines) {
    ctx.fillText(fit(ctx, l, W - 160), 80, y);
    y += 52;
  }
  ctx.fillStyle = '#6a5d4e';
  spaced(ctx, ['大冰的小屋', p.branch].filter(Boolean).join(' · '), 80, H - 70, `600 26px ${SERIF}`, 6);
}

/* ---------- 唱片：炭黑底，黑胶唱片，橘红毛笔大字压在唱片上 ---------- */
function changpian(ctx, W, H, p) {
  ctx.fillStyle = '#1b1a17';
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.64, cy = H * 0.44, r = W * 0.44;
  ctx.fillStyle = '#0c0c0b';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.05)';
  ctx.lineWidth = 2;
  for (let k = r * 0.38; k < r * 0.97; k += 9) {
    ctx.beginPath();
    ctx.arc(cx, cy, k, 0, Math.PI * 2);
    ctx.stroke();
  }
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  sheen.addColorStop(0.3, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,.07)');
  sheen.addColorStop(0.7, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9fd0b6';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1a17';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1a17';
  ctx.textAlign = 'center';
  ctx.font = `600 30px ${SERIF}`;
  ctx.fillText('大冰的小屋', cx, cy - r * 0.15);
  if (p.branch) {
    ctx.font = `600 24px ${SERIF}`;
    ctx.fillText(p.branch, cx, cy + r * 0.16);
  }
  grain(ctx, W, H, 0.18);

  const rows = splitTitle(p.headline);
  const longest = Math.max(...rows.map((t) => [...t].length), 1);
  const hs = Math.min(W * 0.27, (H * 0.66) / longest);
  const ink = inkLayer(W, H, (g) => {
    g.fillStyle = '#e2582c';
    rows.forEach((t, i) => vtext(g, t, 70 + hs * (0.5 + (rows.length - 1 - i) * 0.98), 70 + i * hs * 0.55, hs, 0.96, BRUSH, ''));
  }, 0.5);
  ctx.drawImage(ink, 0, 0);

  ctx.fillStyle = '#9fd0b6';
  ctx.textAlign = 'left';
  if (p.pinyin) {
    ctx.save();
    ctx.translate(W - 56, 70);
    ctx.rotate(Math.PI / 2);
    ctx.font = `600 26px ${SERIF}`;
    ctx.fillText(`${p.pinyin.toUpperCase()}  ·  LIVE`, 0, 0);
    ctx.restore();
  }

  const lines = info(p);
  let y = H - 90 - (lines.length - 1) * 54;
  if (p.subline) {
    ctx.fillStyle = '#9fd0b6';
    ctx.font = `${fitSize(ctx, p.subline, W - 300, 54, XING)}px ${XING}`;
    ctx.fillText(p.subline, 70, y - 96);
  }
  ctx.fillStyle = '#efe7d6';
  ctx.font = `600 36px ${SERIF}`;
  for (const l of lines) {
    ctx.fillText(fit(ctx, l, W - 140 - 150), 70, y);
    y += 54;
  }
  if (p.seal) seal(ctx, p.seal, W - 70 - 104, H - 76 - 104, 104);
}

/* ---------- 工具 ---------- */
const info = (p) => (p.lines || []).filter((l) => l && !/大冰的小屋/.test(l));
const clean = (s) => String(s || '').replace(/[\s，。！？、,.!?：:；;"“”'‘’（）()《》·]/g, '').slice(0, 8);

// 标题拆两行错落：4 字 2/2，5 字 2/3，6 字 3/3，3 字以内一行
function splitTitle(s) {
  const c = [...clean(s)];
  if (c.length <= 3) return [c.join('')];
  const k = c.length === 5 ? 2 : Math.ceil(c.length / 2);
  return [c.slice(0, k).join(''), c.slice(k).join('')];
}

// 从信息行里找「11月1日」，写成手写体的「11.1」
function shortDate(lines) {
  for (const l of lines || []) {
    const m = String(l).match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (m) return `${m[1]}.${m[2]}`;
  }
  return '';
}

// 铺满一块区域；zoom 稍大于 1 是把四边裁掉一点——生图模型偶尔自带一圈细边框，满版海报上会露出来
function cover(ctx, img, x, y, w, h, zoom = 1) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}

// 转黑白、提一点反差（不用 ctx.filter，老 iOS 微信不认）
function mono(ctx, x, y, w, h) {
  const d = ctx.getImageData(x, y, w, h);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const v = Math.min(255, Math.max(0, ((0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]) - 128) * 1.18 + 128));
    a[i] = a[i + 1] = a[i + 2] = v;
  }
  ctx.putImageData(d, x, y);
}

function shade(ctx, x, y0, y1, c0, c1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(x, y0, ctx.canvas.width, y1 - y0);
}

let noise;
function grain(ctx, W, H, alpha) {
  if (!noise) {
    noise = document.createElement('canvas');
    noise.width = noise.height = 256;
    const n = noise.getContext('2d');
    const d = n.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    n.putImageData(d, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(noise, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// 飞白：先在单独一层写字，再用一张斜向的细丝纹理把笔画「擦」掉一些
let streaks;
function dryTexture() {
  if (streaks) return streaks;
  streaks = document.createElement('canvas');
  streaks.width = streaks.height = 512;
  const g = streaks.getContext('2d');
  g.fillStyle = '#000';
  for (let i = 0; i < 520; i++) {
    g.globalAlpha = 0.3 + Math.random() * 0.7;
    g.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 260, 0.5 + Math.random() * 1.6);
  }
  return streaks;
}
function inkLayer(W, H, draw, dry = 0.55) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.textBaseline = 'middle';
  draw(g);
  const t = document.createElement('canvas');
  t.width = W;
  t.height = H;
  const tg = t.getContext('2d');
  tg.rotate(-0.14);
  tg.fillStyle = tg.createPattern(dryTexture(), 'repeat');
  tg.fillRect(-W, -H, W * 3, H * 3);
  tg.setTransform(1, 0, 0, 1, 0, 0);
  tg.globalCompositeOperation = 'destination-in';
  const fade = tg.createLinearGradient(0, 0, W, H);
  fade.addColorStop(0, 'rgba(0,0,0,.25)');
  fade.addColorStop(0.5, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,.4)');
  tg.fillStyle = fade;
  tg.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = dry;
  g.drawImage(t, 0, 0);
  return c;
}

// 一个字一个字画，手动字距（Safari 老版本没有 ctx.letterSpacing）
function spaced(ctx, text, x, y, font, gap) {
  ctx.font = font;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + gap;
  }
}
function spacedRight(ctx, text, right, y, font, gap) {
  ctx.font = font;
  const w = [...text].reduce((s, ch) => s + ctx.measureText(ch).width + gap, -gap);
  spaced(ctx, text, right - w, y, font, gap);
}

// 竖排：汉字一个一列往下；连续的字母数字当一块，两位以内直立，更长的转 90°。返回结束的 y。
function vtext(ctx, text, x, y, size, lead, family, weight) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = 'center';
  const tokens = String(text).match(/[A-Za-z0-9:.\-/~]+|./gu) || [];
  for (const t of tokens) {
    if (t.length > 2 && /^[A-Za-z0-9:.\-/~]+$/.test(t)) {
      const w = ctx.measureText(t).width;
      ctx.save();
      ctx.translate(x, y + w / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(t, 0, 0);
      ctx.restore();
      y += w + size * (lead - 1) + size * 0.2;
    } else if (t === ' ') {
      y += size * 0.4;
    } else if (/[，。、]/.test(t)) {
      ctx.fillText(t, x + size * 0.32, y - size * 0.25);
      y += size * lead * 0.6;
    } else {
      ctx.fillText(t, x, y + size / 2);
      y += size * lead;
    }
  }
  return y;
}

function fit(ctx, text, maxW, font) {
  if (font) ctx.font = font;
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
function fitSize(ctx, text, maxW, size, family) {
  ctx.font = `${size}px ${family}`;
  const w = ctx.measureText(text).width;
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}

// 印章：朱红方块，字从右列往左列读
function seal(ctx, text, x, y, s) {
  const chars = [...clean(text)].slice(0, 4);
  if (!chars.length) return;
  ctx.save();
  ctx.fillStyle = RED;
  ctx.globalAlpha = 0.92;
  roundRect(ctx, x, y, s, s, s * 0.08);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = s * 0.03;
  roundRect(ctx, x + s * 0.07, y + s * 0.07, s * 0.86, s * 0.86, s * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cols = chars.length <= 2 ? [chars] : [chars.slice(0, 2), chars.slice(2)];
  const fs = chars.length <= 2 ? s * (chars.length === 1 ? 0.62 : 0.36) : s * 0.34;
  ctx.font = `600 ${fs}px ${SERIF}`;
  cols.forEach((col, ci) => {
    const cx = cols.length === 1 ? x + s / 2 : x + s * (ci === 0 ? 0.71 : 0.29);
    col.forEach((ch, ri) => {
      const cy = col.length === 1 ? y + s / 2 : y + s * (ri === 0 ? 0.31 : 0.69);
      ctx.fillText(ch, cx, cy);
    });
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
