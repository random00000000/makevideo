// Scene drawing on a 2D canvas (@napi-rs/canvas, Skia, no browser needed).
// Every drawer is a pure function of (ctx, scene, t, L): same inputs, same pixels.
import { GlobalFonts } from '@napi-rs/canvas';
import path from 'node:path';
import { THEMES } from './themes.js';

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
/** 0→1 progress of an entrance animation that starts at `start` and lasts `d` seconds. */
export const enter = (t, start, d = 0.55) => easeOut((t - start) / d);

export function setFont(ctx, L, size, weight = 600, mono = false) {
  ctx.font = `${weight} ${Math.round(size)}px ${mono ? L.theme.mono : L.theme.font}`;
}

export function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** Shrink text until it fits in `maxLines` lines of width `maxW`. */
export function fit(ctx, L, text, { maxW, maxLines, size, min = size * 0.45, weight = 600, mono = false }) {
  let s = size;
  for (;;) {
    setFont(ctx, L, s, weight, mono);
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines || s <= min) return { size: s, lines: lines.slice(0, Math.max(maxLines, 1)), lh: s * 1.18 };
    s = Math.max(min, s * 0.92);
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lines(ctx, ls, x, y, lh, align = 'left') {
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}

// ---------------------------------------------------------------- background

export function drawBackground(ctx, L) {
  const { W, H, theme } = L;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // static glow: constant motion would defeat frame holding (see planFrames)
  const gx = W * (0.72 + 0.06 * ((L.index * 37) % 5) / 4), gy = H * (0.22 + 0.1 * ((L.index * 53) % 3) / 2);
  const r = Math.max(W, H) * 0.7;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
  glow.addColorStop(0, theme.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawImageCover(ctx, img, x, y, w, h, zoom = 1, fit = 'cover') {
  const s = (fit === 'contain' ? Math.min : Math.max)(w / img.width, h / img.height) * zoom;
  const iw = img.width * s, ih = img.height * s;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

// ---------------------------------------------------------------- pieces

function kicker(ctx, L, text, x, y, a) {
  if (!text) return 0;
  ctx.globalAlpha = a;
  setFont(ctx, L, 30 * L.u, 700);
  ctx.fillStyle = L.theme.accent;
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillText(String(text).toUpperCase().split('').join(' '), x, y);
  ctx.globalAlpha = 1;
  return 56 * L.u;
}

function heading(ctx, L, text, t, y = L.m, maxLines = 2) {
  if (!text) return y;
  const a = enter(t, 0.05);
  const f = fit(ctx, L, text, { maxW: L.W - 2 * L.m, maxLines, size: 84 * L.u, weight: 800 });
  ctx.globalAlpha = a;
  ctx.fillStyle = L.theme.text;
  lines(ctx, f.lines, L.m, y + (1 - a) * 24 * L.u, f.lh);
  const by = y + f.lines.length * f.lh + 18 * L.u;
  ctx.fillStyle = L.theme.accent;
  ctx.fillRect(L.m, by, 120 * L.u * a, 8 * L.u);
  ctx.globalAlpha = 1;
  return by + 50 * L.u;
}

function lowerThird(ctx, L, title, subtitle, t) {
  if (!title && !subtitle) return;
  const a = enter(t, 0.25);
  const x = L.m, maxW = Math.min(L.W - 2 * L.m, 1200 * L.u);
  const tf = title ? fit(ctx, L, title, { maxW: maxW - 60 * L.u, maxLines: 2, size: 54 * L.u, weight: 800 }) : null;
  setFont(ctx, L, 32 * L.u, 500);
  const sl = subtitle ? wrap(ctx, subtitle, maxW - 60 * L.u).slice(0, 2) : [];
  const h = 50 * L.u + (tf ? tf.lines.length * tf.lh : 0) + sl.length * 40 * L.u;
  const y = L.m * 0.6;
  ctx.globalAlpha = a;
  ctx.fillStyle = L.theme.panelStrong;
  roundRect(ctx, x - 30 * L.u * (1 - a), y, maxW, h, 18 * L.u); ctx.fill();
  ctx.fillStyle = L.theme.accent;
  ctx.fillRect(x - 30 * L.u * (1 - a), y, 10 * L.u, h);
  let yy = y + 25 * L.u;
  if (tf) { setFont(ctx, L, tf.size, 800); ctx.fillStyle = L.theme.text; lines(ctx, tf.lines, x + 36 * L.u, yy, tf.lh); yy += tf.lines.length * tf.lh; }
  if (sl.length) { setFont(ctx, L, 32 * L.u, 500); ctx.fillStyle = L.theme.muted; lines(ctx, sl, x + 36 * L.u, yy, 40 * L.u); }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- scene drawers

const drawers = {
  title(ctx, s, t, L) {
    const a = enter(t, 0.1, 0.8);
    const maxW = L.W - 2 * L.m;
    const f = fit(ctx, L, s.title, { maxW, maxLines: 3, size: (L.portrait ? 110 : 128) * L.u, weight: 800 });
    setFont(ctx, L, 46 * L.u, 500);
    const sub = s.subtitle ? wrap(ctx, s.subtitle, maxW).slice(0, 3) : [];
    const total = (s.kicker ? 56 * L.u : 0) + f.lines.length * f.lh + 50 * L.u + sub.length * 60 * L.u;
    let y = (L.H - L.captionH - total) / 2;
    y += kicker(ctx, L, s.kicker, L.m, y, enter(t, 0));
    ctx.globalAlpha = a; ctx.fillStyle = L.theme.text; setFont(ctx, L, f.size, 800);
    lines(ctx, f.lines, L.m, y + (1 - a) * 40 * L.u, f.lh);
    y += f.lines.length * f.lh + 14 * L.u;
    ctx.fillStyle = L.theme.accent; ctx.fillRect(L.m, y, 160 * L.u * enter(t, 0.35, 0.9), 10 * L.u);
    y += 36 * L.u;
    const b = enter(t, 0.45, 0.8);
    ctx.globalAlpha = b; ctx.fillStyle = L.theme.muted; setFont(ctx, L, 46 * L.u, 500);
    lines(ctx, sub, L.m, y + (1 - b) * 20 * L.u, 60 * L.u);
    ctx.globalAlpha = 1;
  },

  bullets(ctx, s, t, L, numbered = false) {
    let y = heading(ctx, L, s.title, t);
    const items = s.items;
    const maxW = L.W - 2 * L.m - 90 * L.u;
    let size = (items.length > 6 ? 46 : items.length > 4 ? 54 : 62) * L.u;
    let blocks;
    for (;;) { // shrink until all items fit above the captions
      setFont(ctx, L, size, 600);
      blocks = items.map((it) => wrap(ctx, it, maxW));
      const h = blocks.reduce((n, b) => n + b.length * size * 1.22 + size * 0.75, 0);
      if (y + h < L.H - L.captionH - 20 * L.u || size < 26 * L.u) break;
      size *= 0.92;
    }
    const current = L.reveals.reduce((c, r, i) => (t >= r ? i : c), -1);
    blocks.forEach((b, i) => {
      const a = enter(t, L.reveals[i]);
      if (a <= 0) { y += b.length * size * 1.22 + size * 0.75; return; }
      const dim = s.highlight === false || i === current ? 1 : 0.62;
      ctx.globalAlpha = a * dim;
      const dx = (1 - a) * 40 * L.u;
      if (numbered) {
        const bx = L.m + dx, bs = size * 1.25;
        ctx.fillStyle = L.theme.accent; roundRect(ctx, bx, y - size * 0.08, bs, bs, 12 * L.u); ctx.fill();
        setFont(ctx, L, size * 0.72, 800); ctx.fillStyle = L.theme.onAccent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), bx + bs / 2, y - size * 0.08 + bs / 2);
      } else {
        ctx.fillStyle = L.theme.accent;
        ctx.beginPath(); ctx.arc(L.m + 16 * L.u + dx, y + size * 0.6, 10 * L.u, 0, Math.PI * 2); ctx.fill();
      }
      setFont(ctx, L, size, 600); ctx.fillStyle = L.theme.text;
      lines(ctx, b, L.m + 90 * L.u + dx, y, size * 1.22);
      y += b.length * size * 1.22 + size * 0.75;
    });
    ctx.globalAlpha = 1;
  },

  decisions(ctx, s, t, L) { drawers.bullets(ctx, s, t, L, true); },
  steps(ctx, s, t, L) { drawers.bullets(ctx, s, t, L, true); },

  image(ctx, s, t, L) {
    const img = L.assets.image;
    const z = s.zoom === false ? 1 : 1 + 0.07 * (t / L.dur);
    if (s.fit === 'contain') {
      ctx.save(); ctx.filter = 'blur(40px)'; drawImageCover(ctx, img, 0, 0, L.W, L.H, 1.2); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, L.W, L.H);
    }
    drawImageCover(ctx, img, 0, 0, L.W, L.H, z, s.fit);
    drawers.clip(ctx, s, t, L);
  },

  clip(ctx, s, t, L) {
    // the video itself is composited underneath by ffmpeg; we only draw the overlay
    if (s.title || s.subtitle) lowerThird(ctx, L, s.title, s.subtitle, t);
  },

  code(ctx, s, t, L) {
    let y = heading(ctx, L, s.title, t);
    const src = String(s.code).replace(/\t/g, '  ').replace(/\s+$/, '').split('\n');
    const avail = L.H - L.captionH - y - 40 * L.u;
    const longest = Math.max(...src.map((l) => l.length), 20);
    const size = Math.min(44 * L.u, avail / (src.length * 1.45 + 1.2), (L.W - 2 * L.m - 160 * L.u) / (longest * 0.61));
    const lh = size * 1.45, h = src.length * lh + size * 1.4;
    const a = enter(t, 0.15);
    ctx.globalAlpha = a;
    ctx.fillStyle = L.theme.codeBg; roundRect(ctx, L.m, y, L.W - 2 * L.m, h, 16 * L.u); ctx.fill();
    const hl = new Set((s.highlight || []).flatMap((r) => (Array.isArray(r) ? range(r[0], r[1]) : [r])));
    src.forEach((line, i) => {
      const ly = y + size * 0.7 + i * lh;
      if (hl.has(i + 1)) { ctx.fillStyle = L.theme.codeHl; ctx.fillRect(L.m, ly - size * 0.2, L.W - 2 * L.m, lh); }
      setFont(ctx, L, size, 400, true);
      ctx.fillStyle = L.theme.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1), L.m + 80 * L.u, ly);
      let x = L.m + 110 * L.u;
      ctx.textAlign = 'left';
      for (const [kind, text] of tokenize(line)) {
        ctx.fillStyle = L.theme.syntax[kind] || L.theme.text;
        ctx.fillText(text, x, ly);
        x += ctx.measureText(text).width;
      }
    });
    ctx.globalAlpha = 1;
  },

  stat(ctx, s, t, L) {
    const a = enter(t, 0.1, 0.8);
    const m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(String(s.value));
    let shown = String(s.value);
    if (m && s.countUp !== false) {
      const target = parseFloat(m[2].replace(/,/g, ''));
      const dec = (m[2].split('.')[1] || '').length;
      const v = target * easeOut(clamp((t - 0.1) / 1.4));
      shown = m[1] + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
    }
    const f = fit(ctx, L, String(s.value), { maxW: L.W - 2 * L.m, maxLines: 1, size: 300 * L.u, weight: 900 });
    setFont(ctx, L, 46 * L.u, 600);
    const lab = s.label ? wrap(ctx, s.label, L.W - 2 * L.m).slice(0, 3) : [];
    const total = f.size * 1.05 + lab.length * 60 * L.u + 30 * L.u;
    let y = (L.H - L.captionH - total) / 2;
    ctx.globalAlpha = a; setFont(ctx, L, f.size, 900); ctx.fillStyle = L.theme.accent;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(shown, L.W / 2, y);
    y += f.size * 1.05 + 30 * L.u;
    const b = enter(t, 0.5);
    ctx.globalAlpha = b; setFont(ctx, L, 46 * L.u, 600); ctx.fillStyle = L.theme.text;
    lines(ctx, lab, L.W / 2, y, 60 * L.u, 'center');
    ctx.globalAlpha = 1;
  },

  quote(ctx, s, t, L) {
    const a = enter(t, 0.1, 0.9);
    const f = fit(ctx, L, s.text, { maxW: L.W - 2 * L.m - 80 * L.u, maxLines: 6, size: 66 * L.u, weight: 600 });
    const total = f.lines.length * f.lh + 100 * L.u;
    let y = (L.H - L.captionH - total) / 2;
    ctx.globalAlpha = a * 0.9; ctx.fillStyle = L.theme.accent; setFont(ctx, L, 220 * L.u, 900);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('“', L.m - 20 * L.u, y - 120 * L.u);
    ctx.globalAlpha = a; ctx.fillStyle = L.theme.text; setFont(ctx, L, f.size, 600);
    lines(ctx, f.lines, L.m + 60 * L.u, y + (1 - a) * 30 * L.u, f.lh);
    y += f.lines.length * f.lh + 40 * L.u;
    if (s.by) { ctx.globalAlpha = enter(t, 0.6); ctx.fillStyle = L.theme.muted; setFont(ctx, L, 40 * L.u, 500); ctx.fillText('— ' + s.by, L.m + 60 * L.u, y); }
    ctx.globalAlpha = 1;
  },

  compare(ctx, s, t, L) {
    const y0 = heading(ctx, L, s.title, t);
    const gap = 40 * L.u;
    const cols = [s.left, s.right];
    const vertical = L.portrait;
    const cw = vertical ? L.W - 2 * L.m : (L.W - 2 * L.m - gap) / 2;
    const chAvail = L.H - L.captionH - y0 - 20 * L.u;
    const ch = vertical ? (chAvail - gap) / 2 : chAvail;
    cols.forEach((c, i) => {
      const a = enter(t, L.reveals[i] ?? 0.2 + i * 0.4);
      const x = vertical ? L.m : L.m + i * (cw + gap);
      const y = vertical ? y0 + i * (ch + gap) : y0;
      ctx.globalAlpha = a;
      ctx.fillStyle = L.theme.panel; roundRect(ctx, x, y + (1 - a) * 30 * L.u, cw, ch, 20 * L.u); ctx.fill();
      ctx.fillStyle = i ? L.theme.accent2 : L.theme.accent; ctx.fillRect(x, y + (1 - a) * 30 * L.u, cw, 8 * L.u);
      let yy = y + 40 * L.u + (1 - a) * 30 * L.u;
      const hf = fit(ctx, L, c.title || (i ? 'After' : 'Before'), { maxW: cw - 60 * L.u, maxLines: 2, size: 50 * L.u, weight: 800 });
      ctx.fillStyle = L.theme.text; lines(ctx, hf.lines, x + 30 * L.u, yy, hf.lh); yy += hf.lines.length * hf.lh + 24 * L.u;
      let size = 46 * L.u, bl;
      for (;;) {
        setFont(ctx, L, size, 500);
        bl = (c.items || []).map((it) => wrap(ctx, it, cw - 100 * L.u));
        const h = bl.reduce((n, b) => n + b.length * size * 1.25 + size * 0.5, 0);
        if (yy + h < y + ch - 20 * L.u || size < 22 * L.u) break;
        size *= 0.92;
      }
      bl.forEach((b) => {
        ctx.fillStyle = i ? L.theme.accent2 : L.theme.accent;
        ctx.beginPath(); ctx.arc(x + 46 * L.u, yy + size * 0.6, 7 * L.u, 0, Math.PI * 2); ctx.fill();
        setFont(ctx, L, size, 500); ctx.fillStyle = L.theme.text;
        lines(ctx, b, x + 72 * L.u, yy, size * 1.25); yy += b.length * size * 1.25 + size * 0.5;
      });
    });
    ctx.globalAlpha = 1;
  },
};
drawers.outro = drawers.title;

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

const KW = /^(const|let|var|function|return|if|else|for|while|import|export|from|async|await|new|class|extends|def|fn|pub|struct|impl|use|mut|match|true|false|null|undefined|None|True|False|self|this|type|interface|in|of|try|catch|throw)$/;
function tokenize(line) {
  const out = [];
  const re = /(\/\/.*$|#.*$|--.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1]) out.push(['comment', m[1]]);
    else if (m[2]) out.push(['string', m[2]]);
    else if (m[3]) out.push(['number', m[3]]);
    else if (m[4]) out.push([KW.test(m[4]) ? 'keyword' : line[re.lastIndex] === '(' ? 'fn' : 'text', m[4]]);
    else out.push(['punct', m[5] || m[6]]);
  }
  return out;
}

// ---------------------------------------------------------------- chrome (captions, progress, brand, fades)

/** Start time of each word in a cue (character-weighted). */
export function wordTimes(cue) {
  const words = cue.text.split(' ');
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return words.map((w) => { const at = cue.start + ((cue.end - cue.start) * acc) / total; acc += w.length + 1; return at; });
}

/** TikTok/Reels style: a few huge words, heavy outline, the spoken word lit in accent, pop-in. */
function drawBoldCaption(ctx, L, t, cue) {
  const upper = cue.text.split(' ').map((w) => w.toUpperCase());
  const times = wordTimes(cue);
  const cur = times.reduce((c, at, i) => (t >= at ? i : c), 0);
  const pop = 0.85 + 0.15 * easeOut((t - cue.start) / 0.2);
  const maxW = L.W * 0.86;
  let size = (L.portrait ? 96 : 76) * L.u;
  let rows;
  for (;;) {
    setFont(ctx, L, size, 900);
    rows = [];
    let line = [];
    for (let i = 0; i < upper.length; i++) {
      const test = [...line.map((j) => upper[j]), upper[i]].join(' ');
      if (line.length && ctx.measureText(test).width > maxW) { rows.push(line); line = [i]; } else line.push(i);
    }
    rows.push(line);
    if (rows.length <= 2 || size < 40 * L.u) break;
    size *= 0.9;
  }
  const lh = size * 1.12;
  const cy = L.portrait ? L.H * 0.66 : L.H - 120 * L.u - rows.length * lh;
  const mid = cy + (rows.length * lh) / 2;
  ctx.save();
  ctx.translate(L.W / 2, mid); ctx.scale(pop, pop); ctx.translate(-L.W / 2, -mid);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  const space = ctx.measureText(' ').width;
  rows.forEach((line, li) => {
    const widths = line.map((i) => ctx.measureText(upper[i]).width);
    let x = (L.W - (widths.reduce((a, b) => a + b, 0) + space * (line.length - 1))) / 2;
    const y = cy + li * lh;
    line.forEach((i, k) => {
      ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.strokeText(upper[i], x, y);
      ctx.fillStyle = i === cur ? L.theme.accent : '#ffffff';
      ctx.fillText(upper[i], x, y);
      x += widths[k] + space;
    });
  });
  ctx.restore();
}

function drawCaption(ctx, L, t) {
  const cue = L.cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return;
  if (L.captionStyle === 'bold') return drawBoldCaption(ctx, L, t, cue);
  const maxW = Math.min(L.W * 0.86, 1500 * L.u);
  const size = (L.portrait ? 50 : 42) * L.u;
  setFont(ctx, L, size, 600);
  const ls = wrap(ctx, cue.text, maxW - 60 * L.u).slice(0, 3);
  const w = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 60 * L.u;
  const lh = size * 1.3, h = ls.length * lh + 30 * L.u;
  const y = L.H - (L.portrait ? L.H * 0.2 : 60 * L.u) - h;
  ctx.fillStyle = L.theme.captionBg;
  roundRect(ctx, (L.W - w) / 2, y, w, h, 14 * L.u); ctx.fill();
  ctx.fillStyle = L.theme.captionText;
  lines(ctx, ls, L.W / 2, y + 15 * L.u + lh * 0.1, lh, 'center');
}

/**
 * Draw one frame of a scene.
 * @param overlayOnly  true for `clip` scenes: transparent canvas over the video.
 */
export function drawFrame(ctx, scene, t, L) {
  const { W, H } = L;
  const overlayOnly = scene.type === 'clip';
  ctx.clearRect(0, 0, W, H);
  if (!overlayOnly && scene.type !== 'image') drawBackground(ctx, L);
  (drawers[scene.type] || drawers.title)(ctx, scene, t, L);
  if (L.brand) {
    setFont(ctx, L, 26 * L.u, 700);
    ctx.fillStyle = scene.type === 'clip' || scene.type === 'image' ? 'rgba(255,255,255,0.75)' : L.theme.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(L.brand.toUpperCase(), W - 40 * L.u, 34 * L.u);
  }
  if (L.captions) drawCaption(ctx, L, t);
  if (L.progress) {
    // chapter bar: one segment per scene, filled up to the current one
    const segW = W / L.count, bh = 6 * L.u;
    for (let i = 0; i < L.count; i++) {
      ctx.fillStyle = i <= L.index ? L.theme.accent : 'rgba(127,127,127,0.28)';
      ctx.fillRect(i * segW + (i ? 2 : 0), H - bh, segW - (i ? 2 : 0), bh);
    }
  }
  // dip-to-background between scenes
  const fade = Math.max(1 - t / 0.22, 1 - (L.dur - t) / 0.22, 0);
  if (fade > 0) {
    ctx.globalAlpha = Math.min(1, fade);
    ctx.fillStyle = overlayOnly || scene.type === 'image' ? '#000' : L.theme.bg[0];
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

export function makeLayout(spec, scene, extra) {
  const { width: W, height: H } = spec;
  const u = Math.min(W, H) / 1080;
  const portrait = H > W;
  return {
    W, H, u, portrait,
    m: (portrait ? 80 : 120) * u,
    captionH: !spec.captions ? 80 * u : spec.captionStyle === 'bold' ? (portrait ? H * 0.42 : 330 * u) : portrait ? H * 0.2 + 200 * u : 230 * u,
    theme: withFont(typeof spec.theme === 'object' ? { ...THEMES.midnight, ...spec.theme } : THEMES[spec.theme], spec.font),
    captionStyle: spec.captionStyle,
    brand: spec.brand,
    captions: spec.captions,
    progress: spec.progressBar,
    ...extra,
  };
}

const registered = new Map();
/** `font` may be an installed family name or a .ttf/.otf/.woff2 path; it becomes the display font. */
function withFont(theme, font) {
  if (!font) return theme;
  let family = font;
  if (/\.(ttf|otf|woff2?)$/i.test(font)) {
    if (!registered.has(font)) {
      const name = 'Narrated ' + path.basename(font).replace(/\.[^.]+$/, '');
      GlobalFonts.registerFromPath(font, name);
      registered.set(font, name);
    }
    family = registered.get(font);
  }
  return { ...theme, font: `"${family}", ${theme.font}` };
}
