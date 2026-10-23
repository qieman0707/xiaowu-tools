import { drawPoster, loadFonts, NEEDS_IMAGE } from './poster.js?v=20261023t';
import { makeRoute } from './route.js?v=20261023t';

// ?api= 只在本机预览时认，线上一律走固定中转，免得别人拿链接把人导去假接口
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const API = (LOCAL && new URLSearchParams(location.search).get('api')) || 'https://xiaowu-api.xiaochens.com';
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 用模型的字拼 DOM 一律走 textContent，不拼 HTML
function el(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids.filter((k) => k != null && k !== ''));
  return e;
}

// 等太久就放弃：模型一两分钟能回，三分钟还没回就当这次卡住了
async function call(path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 180000);
  let r;
  try {
    r = await fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    throw new Error(ctl.signal.aborted ? '等了三分钟还没回话，这次卡住了' : '连不上服务，检查一下网络');
  } finally {
    clearTimeout(timer);
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 中转自己报的错是中文大白话，直接给人看；中转没开口（超时、网关出错）就按状态码说人话
    throw new Error(d.error || (
      r.status === 429 ? '用的人有点多，等一分钟再试'
      : [502, 503, 504, 524].includes(r.status) ? '这次没回话，多半是太忙'
      : `服务出错了（${r.status}）`));
  }
  return d;
}

// 该填的没填就点了出发：在第一站标题旁说一句，光标放回去
function remind(S, input, text) {
  S.stop('in', 'err', text);
  input.focus();
  input.addEventListener('input', () => unremind(S), { once: true });
}
function unremind(S) {
  if (S.state('in') === 'err') S.stop('in', '');
}
// 出发后把下一站滚进视野，等待提示不至于落在屏幕外
function reveal(li) {
  const r = li.getBoundingClientRect();
  if (r.top > innerHeight - 120 || r.bottom < 0) li.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- 切换两个 skill ---------- */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(t) {
  for (const x of tabs) {
    const on = x === t;
    x.setAttribute('aria-selected', on);
    x.tabIndex = on ? 0 : -1;
    document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
  }
}
if (location.hash === '#singer') selectTab(tabs[1]);
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    const n = tabs[(i + d + tabs.length) % tabs.length];
    selectTab(n);
    n.focus();
  });
});

/* ---------- 一条竖路：每站 = 印章状态 + 标题旁一句小字 + 卡片里的产出 ---------- */
const route = makeRoute($('#p-seed .map'));
const route2 = makeRoute($('#p-singer .map'));
const STOPS = ['in', 'read', 'write', 'title', 'draw', 'set', 'end'];
// 每个 skill 一套：某一站的状态（'' / run / done / wait / err）和标题旁那句小字；某一站卡片里的产出，再写就替换
function panel(sel) {
  return {
    stop(key, state, live = '') {
      const li = $(`${sel} [data-stop="${key}"]`);
      li.dataset.state = state;
      const e = li.querySelector('.live');
      if (e) e.textContent = live;
    },
    state: (key) => $(`${sel} [data-stop="${key}"]`).dataset.state || '',
    fill(key, ...kids) {
      $(`${sel} [data-body="${key}"]`).replaceChildren(...kids.filter(Boolean));
    },
  };
}
const seed = panel('#p-seed');
const { stop, fill } = seed;

/* ---------- 种子选手：一句话出文案和海报 ---------- */
// 字体到了再开场（大字落墨、画洇出来）；字体迟迟不到也不能让人干等，两秒后照样开
loadFonts().then(() => document.body.classList.add('fonts-ok')).catch(() => {}).finally(() => document.body.classList.add('ready'));
setTimeout(() => document.body.classList.add('ready'), 2000);

const ask = $('#ask');
document.querySelectorAll('[data-eg]').forEach((b) =>
  b.addEventListener('click', () => { ask.value = b.dataset.eg; ask.focus(); unremind(seed); }));

// 没出发之前，最后一站先放一张示意海报，样式可以先点着看
const poster = {
  tpl: 'changpian', size: '3:4',
  headline: '一句话出海报', pinyin: 'yi ju hua chu hai bao', subline: '写下哪天几点，剩下的交给它',
  lines: ['日期 时间', '哪家分舵'], branch: '', seal: '小屋', scene: {}, imgs: {},
};
const canvas = $('#poster');
const redraw = () => drawPoster(canvas, { ...poster, bgImg: poster.imgs[poster.tpl] });
redraw();
setSeg('#tpl', poster.tpl);

let busy = false;
$('#ask-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = ask.value.trim();
  if (busy) return;
  if (!text) return remind(seed, ask, '先写一句：哪店、哪天、几点');
  busy = true;
  $('#go').disabled = true;
  // 上一轮还没画完的画面作废，回来也不往这一轮上贴
  gen++;
  pending = {};
  finished = false;
  STOPS.forEach((k) => stop(k, ''));
  ['read', 'write', 'title', 'draw'].forEach((k) => fill(k));
  $('#copy').hidden = true;
  $('#edit').hidden = true;
  $('#bg').hidden = true;
  route.reset();

  stop('in', 'done', [...text].length > 14 ? `${[...text].slice(0, 14).join('')}…` : text);
  route.reach(0);
  ['read', 'write', 'title'].forEach((k) => stop(k, 'run'));
  route.go(1);
  const t0 = Date.now();
  const tick = () => {
    const s = Math.round((Date.now() - t0) / 1000);
    stop('read', 'run', `已用 ${s} 秒`);
    fill('read', el('p', 'wait', '正在读这句话，顺手把文案和标题一起写了。一般要一两分钟，读完下面几站会一个个盖章。'));
  };
  tick();
  reveal($('#p-seed [data-stop="read"]'));
  const timer = setInterval(tick, 1000);
  try {
    const r = await call('/api/copy', { text });
    clearInterval(timer);
    await arrive(r);
  } catch (err) {
    clearInterval(timer);
    route.idle();
    ['read', 'write', 'title'].forEach((k) => stop(k, 'err'));
    stop('read', 'err', '没走通');
    fill('read', el('p', 'err', `${err.message}。再点一次出发。`));
  } finally {
    busy = false;
    $('#go').disabled = false;
  }
});

// 结果一次回来，读、写、题三站按顺序一个一个盖章
async function arrive(r) {
  const ev = r.event || {};
  const miss = (r.missing || []).filter(Boolean);
  const facts = el('div', 'facts');
  for (const [k, v] of [['分舵', ev.branch], ['活动', ev.kind], ['日期', ev.date], ['时间', ev.time], ['地点', ev.place], ['歌手', (ev.singers || []).join('、')], ['其他', ev.note]]) {
    if (v) facts.append(el('span', 'fact', el('b', null, k), v));
  }
  for (const m of miss) facts.append(el('span', 'fact miss', `缺 ${m}`));
  stop('read', 'done', miss.length ? `缺 ${miss.join('、')}` : '事实齐了');
  fill('read', facts, miss.length ? el('p', 'note', '缺的不编。补进那句话再出发；不补也行，海报和文案里就不写这些。') : null);
  route.reach(1);
  await sleep(450);

  const n = (s) => [...String(s || '')].length;
  $('#teaser').textContent = r.teaser || '';
  $('#xhs-title').textContent = r.xhs?.title || '';
  $('#xhs-body').textContent = r.xhs?.body || '';
  $('#xhs-tags').textContent = (r.xhs?.tags || []).join(' ');
  $('#short').textContent = r.short_title || '';
  $('#copy').hidden = false;
  stop('write', 'done', '三份都好了，各有复制');
  route.reach(2);
  await sleep(450);

  const p = r.poster || {};
  stop('title', 'done', p.headline || '');
  fill('title', el('p', 'big', p.headline || ''), el('p', 'pinyin', p.pinyin || ''), el('p', null, p.subline || ''));
  route.reach(3);

  Object.assign(poster, {
    tpl: 'yuanfang',
    headline: p.headline || '',
    pinyin: p.pinyin || '',
    subline: p.subline || '',
    lines: p.lines || [],
    branch: ev.branch || '',
    seal: p.seal || '小屋',
    scene: r.image_scene || {},
    imgs: {},
  });
  gen++;
  pending = {};
  finished = false;
  setSeg('#tpl', poster.tpl);
  for (const [id, key] of FIELDS) $(id).value = poster[key];
  $('#f-lines').value = poster.lines.join('\n');
  $('#edit').hidden = false;
  $('#save').disabled = false;
  redraw();
  ensureImage();
}

// 改字即时重画
const FIELDS = [['#f-headline', 'headline'], ['#f-pinyin', 'pinyin'], ['#f-subline', 'subline'], ['#f-branch', 'branch'], ['#f-seal', 'seal']];
for (const [id, key] of FIELDS) $(id).addEventListener('input', (e) => { poster[key] = e.target.value; redraw(); });
$('#f-lines').addEventListener('input', (e) => { poster.lines = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); redraw(); });

// 样式、尺寸切换
function setSeg(id, v) {
  document.querySelectorAll(`${id} [role="radio"]`).forEach((x) => x.setAttribute('aria-checked', x.dataset.v === v));
}
for (const [id, key] of [['#tpl', 'tpl'], ['#size', 'size']]) {
  document.querySelectorAll(`${id} [role="radio"]`).forEach((b) => b.addEventListener('click', () => {
    setSeg(id, b.dataset.v);
    poster[key] = b.dataset.v;
    redraw();
    // 已经出过成品的，「排」站旁边的小字跟着换，不然还写着上一个样式
    if (finished) stop('set', 'done', `${STYLE_NAME[poster.tpl]}，${poster.size}`);
    ensureImage();
  }));
}

/* ---------- 画、排、成三站：远方 / 黑白 / 江湖要一张 AI 画面，切到哪个样式画哪张，画过的留着；唱片不用画 ---------- */
const STYLE_NAME = { yuanfang: '远方', heibai: '黑白', jianghu: '江湖', changpian: '唱片' };
let gen = 0;
let pending = {};
let finished = false;

function finish() {
  finished = true;
  stop('set', 'done', `${STYLE_NAME[poster.tpl]}，${poster.size}`);
  stop('end', 'done', '可以发了');
  route.reach(6);
}

function showImage() {
  const tpl = poster.tpl;
  const kind = NEEDS_IMAGE[tpl];
  const b = $('#bg');
  b.hidden = !kind || !poster.scene[kind];
  b.disabled = !!pending[tpl];
  b.textContent = pending[tpl] ? '正在画…' : '换一张画面';
  if (!poster.scene.far && !poster.scene.near) return;
  if (!kind) {
    stop('draw', 'done', '唱片不用画面');
    fill('draw', el('p', 'dim', '「唱片」样式是纯排版，不用画面。'));
    return finish();
  }
  const scene = null; // 画面的英文描述是给生图用的，不给用户看
  if (pending[tpl]) {
    stop('draw', 'run', `在画${STYLE_NAME[tpl]}`);
    fill('draw', scene, el('p', 'wait', '正在画，十几二十秒。画里不放一个字，字全由排版来。'));
    if (!finished) route.go(4);
    else stop('end', 'done', '画面画好会自动换上');
  } else if (poster.imgs[tpl]) {
    const img = el('img', 'thumb');
    img.src = poster.imgs[tpl].src;
    img.alt = `${STYLE_NAME[tpl]}样式的 AI 画面`;
    stop('draw', 'done', `${STYLE_NAME[tpl]}画好了`);
    fill('draw', scene, img);
    finish();
  }
}

async function ensureImage(force = false) {
  const tpl = poster.tpl;
  const scene = poster.scene[NEEDS_IMAGE[tpl]];
  if (!scene || pending[tpl] || (poster.imgs[tpl] && !force)) return showImage();
  const g = gen;
  pending[tpl] = true;
  showImage();
  try {
    const r = await call('/api/image', { style: tpl, scene, aspect: poster.size });
    const img = new Image();
    img.src = `data:${r.mime};base64,${r.data}`;
    await img.decode();
    if (g !== gen) return;
    poster.imgs[tpl] = img;
    if (poster.tpl === tpl) redraw();
  } catch (err) {
    if (g === gen && poster.tpl === tpl) {
      pending[tpl] = false;
      route.idle();
      stop('draw', 'err', '没画出来');
      fill('draw', el('p', 'err', `${err.message}。点「换一张画面」再试。`));
      // 没画面海报也排好了（用底色），照样能存；不想等就换「唱片」，那个不用画
      stop('set', 'done', `${STYLE_NAME[tpl]}，${poster.size}`);
      stop('end', 'done', '先用底色排好了，也能存；换「唱片」不用画面');
      $('#bg').disabled = false;
      $('#bg').textContent = '换一张画面';
      return;
    }
  } finally {
    if (g === gen) pending[tpl] = false;
  }
  if (g === gen && poster.tpl === tpl) showImage();
}
$('#bg').addEventListener('click', () => ensureImage(true));

// 保存：弹出图片，手机长按存，电脑点下载。存成高质量 JPG：同一张图 PNG 有四五兆，发微信、手机存都慢
let viewerUrl = '';
function openViewer(cv, name) {
  cv.toBlob((blob) => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    viewerUrl = URL.createObjectURL(blob);
    $('#viewer-img').src = viewerUrl;
    $('#viewer-dl').href = viewerUrl;
    $('#viewer-dl').download = name;
    $('#viewer').showModal();
  }, 'image/jpeg', 0.92);
}
$('#save').addEventListener('click', () => openViewer(canvas, `小屋海报-${poster.headline || '未命名'}-${poster.size.replace(':', 'x')}.jpg`));
$('#viewer-close').addEventListener('click', () => $('#viewer').close());
// 点弹窗外面的暗处也能关
$('#viewer').addEventListener('click', (e) => {
  const d = e.currentTarget;
  const r = d.getBoundingClientRect();
  const out = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  if (e.target === d && out) d.close();
});

// 复制：先用老办法（在点击当下同步完成，微信内置浏览器也认），不行再用剪贴板接口
async function copyToClipboard(t) {
  const ta = Object.assign(document.createElement('textarea'), { value: t, readOnly: true });
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, t.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* 有的浏览器直接抛错 */ }
  ta.remove();
  if (ok) return true;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}
// 按钮上闪一下结果再变回原字；连点也不会把「已复制」当成原字记下来
function flash(b, ok) {
  b.dataset.label ??= b.textContent;
  b.textContent = ok ? '已复制' : '没复制上，长按文字自己复制';
  clearTimeout(b._t);
  b._t = setTimeout(() => (b.textContent = b.dataset.label), ok ? 1500 : 3000);
}
const copyText = {
  teaser: () => $('#teaser').textContent,
  xhs: () => [$('#xhs-title').textContent, $('#xhs-body').textContent, $('#xhs-tags').textContent].filter(Boolean).join('\n\n'),
  short: () => $('#short').textContent,
};
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  flash(b, await copyToClipboard(copyText[b.dataset.copy]()));
}));

/* ---------- 歌手：歌词 → 读懂、Suno 包、三张分镜、一张歌词海报（编曲小样等 Suno 接口） ---------- */
const S = panel('#p-singer');
const song = {
  tpl: 'yuanfang', size: '9:16',
  headline: '歌词海报', pinyin: 'ge ci hai bao', subline: '歌名作大字，你的歌词作信息行',
  lines: ['主歌里最打动人的一句', '副歌里最打动人的一句'], branch: '', seal: '原创',
  frames: [], imgs: [], pick: 0,
};
const songCanvas = $('#song-poster');
const songRedraw = () => drawPoster(songCanvas, { ...song, bgImg: song.imgs[song.pick] });
songRedraw();

$('#song-eg').addEventListener('click', () => {
  $('#song-name').value = '长路';
  $('#song-lyrics').value = '走了很多路 看过很多灯\n没有一盏 是为我亮的\n背着吉他 走过陌生的城\n风把名字吹散 也没人问\n\n别问我去哪儿\n风吹到哪儿 就是哪儿\n别问我回不回\n路还长 我还没走累\n\n火塘边的人 换了一茬又一茬\n歌还是那首 唱给谁听都一样';
  $('#song-feel').value = '木吉他、口琴、慢，像深夜在路上';
  const ly = $('#song-lyrics');
  ly.focus();
  // 光标放回开头，歌词框从第一行显示，不要一进来就滚到最后一行
  ly.setSelectionRange(0, 0);
  ly.scrollTop = 0;
  unremind(S);
});

let songBusy = false;
let songGen = 0;
$('#song-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const lyrics = $('#song-lyrics').value.trim();
  if (songBusy) return;
  if (!lyrics) return remind(S, $('#song-lyrics'), $('#song-name').value.trim() ? '还差歌词：歌名可以不填，歌词得有' : '先把歌词贴进来');
  songBusy = true;
  $('#song-go').disabled = true;
  const g = ++songGen;
  ['in', 'read', 'draw', 'end'].forEach((k) => S.stop(k, ''));
  ['arr', 'sync', 'mix'].forEach((k) => S.stop(k, 'wait'));
  ['read', 'arr', 'draw'].forEach((k) => S.fill(k));
  $('#song-save').disabled = true;
  route2.reset();

  const name = $('#song-name').value.trim();
  S.stop('in', 'done', name || `${lyrics.split('\n').filter(Boolean).length} 行`);
  route2.reach(0);
  S.stop('read', 'run');
  route2.go(1);
  const t0 = Date.now();
  const tick = () => {
    S.stop('read', 'run', `已用 ${Math.round((Date.now() - t0) / 1000)} 秒`);
    S.fill('read', el('p', 'wait', '正在读这首歌：分段、听情绪、写风格词，顺手把海报字和分镜也想好。一般要一两分钟。'));
  };
  tick();
  reveal($('#p-singer [data-stop="read"]'));
  const timer = setInterval(tick, 1000);
  try {
    const r = await call('/api/song', { name, lyrics, feel: $('#song-feel').value.trim() });
    clearInterval(timer);
    if (g !== songGen) return;
    await songArrive(r, g);
  } catch (err) {
    clearInterval(timer);
    if (g !== songGen) return;
    route2.idle();
    S.stop('read', 'err', '没走通');
    S.fill('read', el('p', 'err', `${err.message}。再点一次出发。`));
  } finally {
    if (g === songGen) {
      songBusy = false;
      $('#song-go').disabled = false;
    }
  }
});

async function songArrive(r, g) {
  // 读：分段、情绪、风格词、最有记忆点的一句
  const parts = el('div', 'parts');
  for (const p of r.parts || []) {
    const ls = p.lines || [];
    parts.append(el('p', 'part', el('b', null, p.name || '段'), `${ls.length} 行`, ls[0] ? ` · ${ls[0]}` : ''));
  }
  const tags = el('div', 'facts');
  for (const t of r.tags || []) tags.append(el('span', 'fact', t));
  S.stop('read', 'done', r.mood || '读完了');
  S.fill('read', tags, parts, r.hook ? el('p', 'hook', r.hook) : null);
  route2.reach(1);
  await sleep(450);

  // 编：Suno 接口没接上，先把要粘的东西备好
  const pack = el('div', 'pack');
  const cp = (text, label) => {
    const b = el('button', 'quiet', label);
    b.type = 'button';
    b.addEventListener('click', async () => flash(b, await copyToClipboard(text)));
    return b;
  };
  pack.append(
    el('h3', null, '给 Suno 的风格词'), el('pre', null, r.suno_prompt || ''), cp(r.suno_prompt || '', '复制风格词'),
    el('h3', null, '分好段的歌词'), el('pre', null, r.suno_lyrics || ''), cp(r.suno_lyrics || '', '复制歌词'),
  );
  S.stop('arr', 'wait', '去 Suno 粘这两样');
  S.fill('arr', pack);
  await sleep(300);

  // 成：先把字排上，分镜画好一张就当底图
  const p = r.poster || {};
  Object.assign(song, {
    headline: p.headline || r.title || '',
    pinyin: p.pinyin || '',
    subline: p.subline || '',
    lines: p.lines || [],
    seal: p.seal || '原创',
    frames: (r.frames || []).slice(0, 3),
    imgs: [],
    pick: 0,
  });
  songRedraw();
  $('#song-save').disabled = false;
  S.stop('end', 'run', '等分镜当底图');

  // 画：三张分镜一起画，谁先好谁先亮；点哪张，海报就用哪张当底图。
  // 没画出来的可以单独重画，不用重新出发再读一两分钟歌词
  const row = el('div', 'frames');
  const slots = song.frames.map((_, i) => { const s = el('div', 'slot', `第 ${i + 1} 张`); row.append(s); return s; });
  const note = el('p', 'dim', '主歌、副歌、结尾各一张，同一种画风。画里不放字。');
  const retry = el('button', 'quiet', '重画没出来的分镜');
  retry.type = 'button';
  retry.hidden = true;
  S.fill('draw', note, row, el('div', 'poster-act', retry));
  const mark = () => row.querySelectorAll('.frame').forEach((m) => m.classList.toggle('on', m.dataset.i == song.pick));
  const paint = async () => {
    const todo = song.frames.map((_, i) => i).filter((i) => !song.imgs[i]);
    retry.hidden = true;
    todo.forEach((i) => (slots[i].textContent = `第 ${i + 1} 张`));
    S.stop('draw', 'run', `在画 ${todo.length} 张分镜`);
    if (!song.imgs.some(Boolean)) route2.go(4);
    await Promise.all(todo.map(async (i) => {
      try {
        const x = await call('/api/image', { style: 'yuanfang', scene: song.frames[i], aspect: '9:16' });
        if (g !== songGen) return;
        const img = new Image();
        img.src = `data:${x.mime};base64,${x.data}`;
        await img.decode();
        if (g !== songGen) return;
        const first = !song.imgs.some(Boolean);
        song.imgs[i] = img;
        const pic = el('img');
        pic.src = img.src;
        pic.alt = `分镜 ${i + 1}`;
        const t = el('button', 'frame', pic);
        t.type = 'button';
        t.dataset.i = i;
        t.title = '用这张当底图';
        t.addEventListener('click', () => { song.pick = i; mark(); songRedraw(); });
        slots[i].replaceWith(t);
        // 第一张画好的先当底图
        if (first) {
          song.pick = i;
          songRedraw();
          S.stop('end', 'done', '歌词海报，可以发了');
          route2.reach(6);
        }
        mark();
      } catch {
        if (g === songGen) slots[i].textContent = '没画出来';
      }
    }));
    if (g !== songGen) return;
    const ok = song.imgs.filter(Boolean).length;
    const bad = song.frames.length - ok;
    retry.hidden = !bad;
    if (ok) {
      note.className = 'dim';
      note.textContent = '主歌、副歌、结尾各一张，同一种画风。画里不放字。点哪张，海报就换哪张当底图。';
      S.stop('draw', 'done', bad ? `画好 ${ok} 张，${bad} 张没画出来` : `${ok} 张分镜画好了`);
    } else {
      route2.idle();
      note.className = 'err';
      note.textContent = '这次一张都没画出来，多半是太忙。点下面重画，不用重新出发。';
      S.stop('draw', 'err', '没画出来');
      S.stop('end', 'done', '没底图也排好了，也能存');
    }
  };
  retry.addEventListener('click', paint);
  await paint();
}
$('#song-save').addEventListener('click', () => openViewer(songCanvas, `歌词海报-${song.headline || '未命名'}-9x16.jpg`));
