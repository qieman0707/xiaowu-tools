// 分镜动画：三张分镜 + 歌词，在 canvas 上推拉摇移地放一遍，录成一段竖屏视频。
// 现在没有小样，先出无声的；Suno 接上后把小样当音轨合进来，这里的画面和字幕不用动。

const BRUSH = 'XWBrush, XWSerif, "Songti SC", "STSong", serif';
const SERIF = 'XWSerif, "Songti SC", "STSong", serif';
const CREAM = '#f6eedf';

// 把歌词段落分给分镜：第 i 张配第 i 段，段多出来的并进最后一张；每张的时长按行数算
export function planShots(frames, parts) {
  const groups = (parts || []).map((p) => (p.lines || []).filter(Boolean)).filter((l) => l.length);
  const imgs = frames.filter(Boolean);
  if (!imgs.length) return [];
  const shots = imgs.map((img, i) => ({ img, lines: [...(groups[i] || [])] }));
  if (groups.length > imgs.length) shots[shots.length - 1].lines.push(...groups.slice(imgs.length).flat());
  for (const s of shots) s.dur = Math.max(3.2, Math.min(9, 1 + s.lines.length * 1.6));
  return shots;
}

export function totalTime(shots) {
  return 2.4 + shots.reduce((a, s) => a + s.dur, 0) + 1.6;
}

// 画第 t 秒的那一帧
export function drawFrame(ctx, W, H, shots, t, title) {
  ctx.save();
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(0, 0, W, H);
  const TITLE = 2.4;
  const TAIL = 1.6;
  let at = TITLE;
  let shot = null;
  let u = 0;
  for (const s of shots) {
    if (t < at + s.dur) { shot = s; u = (t - at) / s.dur; break; }
    at += s.dur;
  }
  if (!shot) { shot = shots[shots.length - 1]; u = 1; }

  // 画面：慢推 + 轻微横移
  const k = 1.04 + 0.1 * ease(u);
  const img = shot.img;
  const r = Math.max(W / img.naturalWidth, H / img.naturalHeight) * k;
  const w = img.naturalWidth * r;
  const h = img.naturalHeight * r;
  const dx = (W - w) / 2 + (0.5 - u) * W * 0.04;
  const dy = (H - h) / 2 + (u - 0.5) * H * 0.02;
  ctx.drawImage(img, dx, dy, w, h);
  // 底部压暗，字看得清
  const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, 'rgba(10,8,6,0)');
  g.addColorStop(1, 'rgba(10,8,6,.78)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 片头：歌名
  if (t < TITLE) {
    const a = t < 0.5 ? t / 0.5 : t > TITLE - 0.5 ? (TITLE - t) / 0.5 : 1;
    ctx.fillStyle = `rgba(10,8,6,${0.45 * a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${Math.round(W * 0.22)}px ${BRUSH}`;
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 24;
    ctx.fillText(title || '', W / 2, H * 0.46);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${Math.round(W * 0.034)}px ${SERIF}`;
    spaced(ctx, '大冰的小屋', W / 2, H * 0.46 + W * 0.17, W * 0.012);
    ctx.globalAlpha = 1;
  } else if (t > at + (shots.length ? 0 : 0) && t >= TITLE + shots.reduce((a, s) => a + s.dur, 0)) {
    // 片尾：淡出
    const left = TITLE + shots.reduce((a, s) => a + s.dur, 0) + TAIL - t;
    ctx.fillStyle = `rgba(10,8,6,${1 - Math.max(0, Math.min(1, left / TAIL))})`;
    ctx.fillRect(0, 0, W, H);
  } else if (shot.lines.length) {
    // 歌词：一句一句来，每句淡入淡出
    const per = shot.dur / shot.lines.length;
    const local = (t - (at)) ;
    const i = Math.min(shot.lines.length - 1, Math.floor(local / per));
    const lu = (local - i * per) / per;
    const a = lu < 0.18 ? lu / 0.18 : lu > 0.85 ? (1 - lu) / 0.15 : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = CREAM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(W * 0.072);
    ctx.font = `400 ${size}px ${BRUSH}`;
    const line = shot.lines[i];
    while (ctx.measureText(line).width > W * 0.86 && size > 28) {
      size -= 2;
      ctx.font = `400 ${size}px ${BRUSH}`;
    }
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 18;
    ctx.fillText(line, W / 2, H * 0.8 - (1 - Math.min(1, lu * 4)) * 10);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  // 角上落款
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.round(W * 0.026)}px ${SERIF}`;
  spaced(ctx, '大冰的小屋', W * 0.07 + W * 0.09, H * 0.045, W * 0.008, 'left');
  ctx.restore();
}

function spaced(ctx, text, x, y, gap, align = 'center') {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : x - total / 2;
  const old = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + gap; });
  ctx.textAlign = old;
}

function ease(u) { return u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u); }

// 实时放一遍并录下来。录多久就等多久（十几秒），录的时候画面同时在 canvas 上播
export async function recordMv(canvas, shots, title, onTick) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  const total = totalTime(shots);
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  const stream = canvas.captureStream?.(30);
  let rec = null;
  const chunks = [];
  if (mime && stream) {
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3.5e6 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  }
  const stopped = new Promise((r) => { if (rec) rec.onstop = r; else r(); });
  rec?.start(250);
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawFrame(ctx, W, H, shots, Math.min(t, total), title);
      onTick?.(Math.min(t, total), total);
      if (t < total) requestAnimationFrame(tick);
      else res();
    };
    tick();
  });
  rec?.stop();
  await stopped;
  if (!rec || !chunks.length) return null;
  return { blob: new Blob(chunks, { type: mime }), ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}
