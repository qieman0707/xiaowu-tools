// 小屋工具台的中转：网页在 GitHub 上是公开的，密钥只能放这里，中转替网页去调 Gemini / Suno。
// 这是 demo，不设邀请码（小陈 10-22 定）；花费靠 AI Studio 的月度上限兜底。
import { VOICE } from './voice.js';
import { SONG } from './song.js';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const ALLOWED = [/^https:\/\/qieman0707\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin') || '';
    const cors = ALLOWED.some((r) => r.test(origin))
      ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS', vary: 'origin' }
      : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });

    const { pathname } = new URL(req.url);
    try {
      if (pathname === '/api/ping') return reply({ ok: true });
      if (req.method !== 'POST') return reply({ error: 'not found' }, 404);
      const body = await req.json();
      if (pathname === '/api/copy') return reply(await copy(env, body));
      if (pathname === '/api/image') return reply(await image(env, body));
      if (pathname === '/api/song') return reply(await song(env, body));
      return reply({ error: 'not found' }, 404);
    } catch (e) {
      return reply({ error: e.message || String(e) }, e.status || 500);
    }
  },
};

async function gemini(env, model, payload) {
  const r = await fetch(`${GEMINI}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.error?.message || '';
    // 页面是给大冰看的，英文原样甩出去他看不懂：常见几种翻成人话，其余只报状态码
    const err = new Error(
      /spending cap/i.test(msg) ? 'Gemini 本月额度用完了，请小陈去 AI Studio 调高上限'
      : /location is not supported/i.test(msg) ? 'Gemini 不支持当前出口地区（中转节点问题）'
      : r.status === 429 ? '用的人有点多，等一分钟再试'
      : r.status === 503 || /overloaded|unavailable/i.test(msg) ? 'Gemini 这会儿太忙，过一会儿再点'
      : /safety|blocked/i.test(msg) ? '这次的内容被模型拦下了，换个说法试试'
      : `Gemini 出错了（${r.status}），再点一次试试`,
    );
    err.status = r.status === 429 ? 429 : 502;
    throw err;
  }
  return d;
}

// 让文字模型按 JSON 回，回得不对就当没回
async function askJson(env, system, text, temperature) {
  const d = await gemini(env, env.TEXT_MODEL, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseMimeType: 'application/json', temperature },
  });
  const raw = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw Object.assign(new Error('模型没按格式回，再点一次试试'), { status: 502 });
  }
}

async function copy(env, { text }) {
  text = String(text || '').trim();
  if (!text) throw Object.assign(new Error('先说一句要宣传什么'), { status: 400 });
  if (text.length > 800) throw Object.assign(new Error('一句话就够，800 字以内'), { status: 400 });
  return askJson(env, VOICE, text, 0.9);
}

// 歌手：歌词 + 歌名 + 想要的感觉 → 分段、风格词、Suno 包、海报字、分镜
async function song(env, { name, lyrics, feel }) {
  lyrics = String(lyrics || '').trim();
  name = String(name || '').trim().slice(0, 30);
  feel = String(feel || '').trim().slice(0, 60);
  if (!lyrics) throw Object.assign(new Error('先把歌词贴进来'), { status: 400 });
  if (lyrics.length > 3000) throw Object.assign(new Error('歌词太长了，3000 字以内'), { status: 400 });
  const text = [name && `歌名：${name}`, feel && `想要的感觉：${feel}`, `歌词：\n${lyrics}`].filter(Boolean).join('\n\n');
  const r = await askJson(env, SONG, text, 0.7);
  // 歌词一个字不改：去掉段落标签后，Suno 包里的歌词必须和原文逐行一模一样（不改、不加、不删、不换顺序），否则退回原文分段
  const orig = lyrics.split('\n').map((s) => s.trim()).filter(Boolean);
  const got = String(r.suno_lyrics || '').split('\n').map((s) => s.trim()).filter((s) => s && !/^\[.+\]$/.test(s));
  const ok = got.length === orig.length && got.every((s, i) => s === orig[i]);
  if (!ok) {
    // 退回时段落标签尽量沿用模型读出来的段名（主歌/副歌…），对不上段数就都标主歌
    const paras = lyrics.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const TAG = { 主歌: 'Verse', 副歌: 'Chorus', 桥段: 'Bridge', 结尾: 'Outro', 前奏: 'Intro' };
    const names = (r.parts || []).length === paras.length ? r.parts.map((p) => TAG[p.name] || 'Verse') : [];
    r.suno_lyrics = paras.map((p, i) => `[${names[i] || 'Verse'}]\n${p}`).join('\n\n');
  }
  return r;
}

// 每种海报样式要的画面，对应的参考图写在 docs/poster.js 开头
const LOOK = {
  yuanfang: (s) => `Cinematic 35mm film still for a vertical folk-music poster background. ${s}. Vast open landscape, a feeling of wandering and freedom on the road, dusk or golden-hour light, muted film colors, visible film grain. Keep the upper part mostly open sky and the lower third darker and calm. If any person appears, only a tiny distant figure seen from behind.`,
  heibai: (s) => `Black-and-white documentary film photograph, grainy high-ISO look, high contrast, quiet and intimate. ${s}. Shallow depth of field. No faces visible.`,
  jianghu: (s) => `Traditional Chinese ink wash painting (shuimo) on rice paper, wuxia jianghu mood. ${s}. Ink black and cloud white with only one small touch of vermilion red. Misty mountains, a tiny lone figure. Put the scene in the left two-thirds and let it fade softly into blank rice paper toward the right edge; no hard edges, no borders, no panels, no frames.`,
};

async function image(env, { style, scene, aspect }) {
  const look = LOOK[style];
  scene = String(scene || '').trim().slice(0, 300);
  if (!look || !scene) throw Object.assign(new Error('缺画面描述'), { status: 400 });
  const d = await gemini(env, env.IMAGE_MODEL, {
    contents: [{ role: 'user', parts: [{ text: `${look(scene)}\nAbsolutely no text, letters, numbers, logos or watermarks anywhere in the image.` }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect === '9:16' ? '9:16' : '3:4' } },
  });
  const part = (d.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) throw Object.assign(new Error('这次没出图，再点一次'), { status: 502 });
  return { mime: part.inlineData.mimeType, data: part.inlineData.data };
}
